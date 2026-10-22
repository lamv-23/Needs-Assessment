import { queryFeatureServer } from '@/lib/arcgis';

const LAYER = 'https://example.test/arcgis/rest/services/X/FeatureServer/0';
const FAST = { retryBaseMs: 1 };

type Body = Record<string, unknown>;

function feature(i: number): GeoJSON.Feature {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [i, i] }, properties: { n: i } };
}

function ok(body: Body): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function geojsonPage(from: number, count: number, exceeded?: boolean): Response {
  const body: Body = { type: 'FeatureCollection', features: Array.from({ length: count }, (_, i) => feature(from + i)) };
  if (exceeded !== undefined) body.properties = { exceededTransferLimit: exceeded };
  return ok(body);
}

let fetchMock: jest.Mock;
const requestParams = (call: number) => new URLSearchParams(String(fetchMock.mock.calls[call][1].body));

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const query = { where: '1=1', outFields: ['a', 'b'], returnGeometry: true };

test('pages by resultOffset until a page is shorter than the page size', async () => {
  fetchMock
    .mockResolvedValueOnce(geojsonPage(0, 3))
    .mockResolvedValueOnce(geojsonPage(3, 3))
    .mockResolvedValueOnce(geojsonPage(6, 1));
  const out = await queryFeatureServer(LAYER, query, { pageSize: 3, ...FAST });
  expect(out.map(f => f.properties!.n)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect([0, 1, 2].map(i => requestParams(i).get('resultOffset'))).toEqual(['0', '3', '6']);
  const first = requestParams(0);
  expect(first.get('resultRecordCount')).toBe('3');
  expect(first.get('outSR')).toBe('4326');
  expect(first.get('f')).toBe('geojson');
  expect(first.get('where')).toBe('1=1');
  expect(first.get('outFields')).toBe('a,b');
  expect(first.get('returnGeometry')).toBe('true');
  expect(first.get('orderByFields')).toBe('objectid');
});

test('ends on an empty page when the last full page is followed by nothing', async () => {
  fetchMock.mockResolvedValueOnce(geojsonPage(0, 2)).mockResolvedValueOnce(geojsonPage(2, 0));
  const out = await queryFeatureServer(LAYER, query, { pageSize: 2, ...FAST });
  expect(out).toHaveLength(2);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('keeps paging past a short page while the server says the transfer limit was exceeded', async () => {
  fetchMock
    .mockResolvedValueOnce(geojsonPage(0, 2, true))
    .mockResolvedValueOnce(geojsonPage(2, 2, true))
    .mockResolvedValueOnce(geojsonPage(4, 1, false));
  const out = await queryFeatureServer(LAYER, query, { pageSize: 5, ...FAST });
  expect(out).toHaveLength(5);
  // The offset follows what was received, not the requested page size.
  expect([0, 1, 2].map(i => requestParams(i).get('resultOffset'))).toEqual(['0', '2', '4']);
});

test('stops when the server reports no more, even on a full page', async () => {
  fetchMock.mockResolvedValueOnce(geojsonPage(0, 2, false));
  const out = await queryFeatureServer(LAYER, query, { pageSize: 2, ...FAST });
  expect(out).toHaveLength(2);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('also reads exceededTransferLimit from the top level of the response', async () => {
  fetchMock
    .mockResolvedValueOnce(ok({ type: 'FeatureCollection', features: [feature(0)], exceededTransferLimit: true }))
    .mockResolvedValueOnce(geojsonPage(1, 1, false));
  expect(await queryFeatureServer(LAYER, query, { pageSize: 5, ...FAST })).toHaveLength(2);
});

test('retries transient HTTP errors and HTTP 200 error bodies, then succeeds', async () => {
  fetchMock
    .mockResolvedValueOnce(new Response('busy', { status: 503, statusText: 'Service Unavailable' }))
    .mockRejectedValueOnce(new TypeError('fetch failed'))
    .mockResolvedValueOnce(ok({ error: { code: 500, message: 'Unable to complete operation.' } }))
    .mockResolvedValueOnce(geojsonPage(0, 1));
  const out = await queryFeatureServer(LAYER, query, { pageSize: 5, ...FAST });
  expect(out).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  // Retries repeat the same page.
  expect([0, 1, 2, 3].map(i => requestParams(i).get('resultOffset'))).toEqual(['0', '0', '0', '0']);
});

test('gives up after the retry budget', async () => {
  fetchMock.mockImplementation(async () => new Response('down', { status: 502 }));
  await expect(queryFeatureServer(LAYER, query, { retries: 2, ...FAST })).rejects.toThrow(/failed after 3 attempts.*502/);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test('does not retry a bad query', async () => {
  fetchMock.mockImplementation(async () =>
    ok({ error: { code: 400, message: 'Unable to complete operation.', details: ['Unable to perform query operation.'] } }),
  );
  await expect(queryFeatureServer(LAYER, query, FAST)).rejects.toThrow(/ArcGIS error 400.*Unable to perform query operation/);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('centroid queries use f=json and come back as GeoJSON points', async () => {
  fetchMock.mockResolvedValueOnce(
    ok({
      features: [
        { attributes: { mb: '1' }, centroid: { x: 151.1, y: -33.8 } },
        { attributes: { mb: '2' }, centroid: { x: 151.2, y: -33.9 } },
      ],
    }),
  );
  const out = await queryFeatureServer(
    LAYER,
    { where: '1=1', outFields: ['mb'], returnGeometry: false, returnCentroid: true },
    { pageSize: 5, ...FAST },
  );
  expect(out).toEqual([
    { type: 'Feature', geometry: { type: 'Point', coordinates: [151.1, -33.8] }, properties: { mb: '1' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [151.2, -33.9] }, properties: { mb: '2' } },
  ]);
  const p = requestParams(0);
  expect(p.get('f')).toBe('json');
  expect(p.get('returnCentroid')).toBe('true');
  expect(p.get('returnGeometry')).toBe('false');
});

test('a centroid query that also asks for geometry is rejected before any request', async () => {
  await expect(queryFeatureServer(LAYER, { ...query, returnCentroid: true })).rejects.toThrow(/returnGeometry false/);
  expect(fetchMock).not.toHaveBeenCalled();
});
