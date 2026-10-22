import type { FeatureCollection } from 'geojson';
import { loadBoundaries } from '@/lib/needs/boundaries';

/** loadBoundaries keeps one cache for the page, so each test uses URLs of its own. */

const collection = (name: string): FeatureCollection => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [151, -33.9] }, properties: { name } }],
});

const ok = (body: FeatureCollection) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const failed = (status: number) => ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

describe('loadBoundaries', () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  test('the same URL is fetched and parsed once, however many callers ask', async () => {
    fetchMock.mockResolvedValue(ok(collection('lga')));
    const [a, b] = await Promise.all([loadBoundaries('/geo/same.json'), loadBoundaries('/geo/same.json')]);
    const c = await loadBoundaries('/geo/same.json');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/geo/same.json');
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  test('a different URL is fetched on its own', async () => {
    fetchMock.mockImplementation(async (url: string) => ok(collection(url)));
    const lga = await loadBoundaries('/geo/first.json');
    const sa2 = await loadBoundaries('/geo/second.json');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/geo/first.json', '/geo/second.json']);
    expect(lga.features[0].properties?.name).toBe('/geo/first.json');
    expect(sa2.features[0].properties?.name).toBe('/geo/second.json');
  });

  test('a failed request is dropped from the cache, so a retry fetches again and can succeed', async () => {
    fetchMock.mockResolvedValueOnce(failed(500)).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ok(collection('retry')));
    await expect(loadBoundaries('/geo/flaky.json')).rejects.toThrow('HTTP 500 for /geo/flaky.json');
    await expect(loadBoundaries('/geo/flaky.json')).rejects.toThrow('offline');
    const third = await loadBoundaries('/geo/flaky.json');
    expect(third.features[0].properties?.name).toBe('retry');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Once it has succeeded, it is cached
    await loadBoundaries('/geo/flaky.json');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
