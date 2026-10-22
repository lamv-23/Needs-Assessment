/**
 * Mesh-block helpers: the Mesh Block Counts parser, the LGA point locator and the
 * SA2 -> LGA person shares. Pure functions only; the seed script does the I/O.
 */

import fs from 'fs';
import path from 'path';
import {
  NON_SPATIAL_SA2_CODES,
  buildLgaLocator,
  lgaSharesForSa2,
  parseMeshBlockCounts,
} from '../lib/mesh-blocks';

const HEADER = ['MB_CODE_2021', 'MB_CATEGORY_NAME_2021', 'Dwelling', 'Person', 'State'];

describe('parseMeshBlockCounts', () => {
  it('finds the header row below title rows and drops other states', () => {
    const rows: unknown[][] = [
      ['Mesh Block Counts, 2021'],
      [],
      HEADER,
      ['10000010000', 'Residential', 5, 12, '1'],
      ['20000010000', 'Residential', 7, 30, '2'],
      ['11000020000', 'Education', 0, 0, '1'],
    ];
    const counts = parseMeshBlockCounts(rows);
    expect(counts.size).toBe(2);
    expect(counts.get('10000010000')).toBe(12);
    expect(counts.get('11000020000')).toBe(0);
    expect(counts.has('20000010000')).toBe(false);
  });

  it('finds the Person column by name, not by position', () => {
    const rows: unknown[][] = [
      ['MB_CODE_2021', 'MB_CATEGORY_NAME_2021', 'AREA_ALBERS_SQKM', 'Dwelling', 'Person', 'State'],
      ['10000010000', 'Residential', 0.0209, 44, 63, 1],
    ];
    expect(parseMeshBlockCounts(rows).get('10000010000')).toBe(63);
  });

  it('ignores the notes and copyright rows under the table', () => {
    const rows: unknown[][] = [
      HEADER,
      ['10000010000', 'Residential', 5, 12, 1],
      [],
      ['Cells in this table have been randomly adjusted to avoid the release of confidential data.', null, null, null, null],
      ['© Commonwealth of Australia 2022', null, null, null, null],
    ];
    expect([...parseMeshBlockCounts(rows).keys()]).toEqual(['10000010000']);
  });

  it('keeps a block whose Dwelling count is blank (the no-usual-address block)', () => {
    const rows: unknown[][] = [HEADER, ['10000009499', 'NOUSUALRESIDENCE', null, 11371, 1]];
    expect(parseMeshBlockCounts(rows).get('10000009499')).toBe(11371);
  });

  it('throws when there is no MB_CODE_2021 header, so a changed layout cannot pass silently', () => {
    expect(() => parseMeshBlockCounts([['Code', 'Person'], ['10000010000', 12]])).toThrow(/MB_CODE_2021/);
  });

  it('throws when the header has no Person column', () => {
    expect(() => parseMeshBlockCounts([['MB_CODE_2021', 'Dwelling'], ['10000010000', 5]])).toThrow(/Person/);
  });

  it('throws on a NSW row with no usable person count', () => {
    expect(() => parseMeshBlockCounts([HEADER, ['10000010000', 'Residential', 5, null, 1]])).toThrow(/10000010000/);
    expect(() => parseMeshBlockCounts([HEADER, ['10000010000', 'Residential', 5, '-', 1]])).toThrow(/10000010000/);
  });

  it('throws on a duplicated NSW mesh block code', () => {
    const rows: unknown[][] = [HEADER, ['10000010000', 'Residential', 5, 12, 1], ['10000010000', 'Residential', 5, 13, 1]];
    expect(() => parseMeshBlockCounts(rows)).toThrow(/10000010000/);
  });
});

describe('lgaSharesForSa2', () => {
  it('returns each LGA share of the SA2 persons, largest first', () => {
    const shares = lgaSharesForSa2([
      { sa2_code: 'X', lga_id: 'lga_b', persons: 300 },
      { sa2_code: 'X', lga_id: 'lga_a', persons: 500 },
      { sa2_code: 'X', lga_id: 'lga_a', persons: 200 },
    ]);
    expect(shares.get('X')).toEqual([
      { lgaId: 'lga_a', share: 0.7 },
      { lgaId: 'lga_b', share: 0.3 },
    ]);
  });

  it('shares sum to 1 over the persons with a known LGA, ignoring blocks with no LGA', () => {
    const shares = lgaSharesForSa2([
      { sa2_code: 'X', lga_id: 'lga_a', persons: 90 },
      { sa2_code: 'X', lga_id: 'lga_b', persons: 10 },
      { sa2_code: 'X', lga_id: null, persons: 400 },
    ]).get('X')!;
    expect(shares.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 12);
    expect(shares).toEqual([
      { lgaId: 'lga_a', share: 0.9 },
      { lgaId: 'lga_b', share: 0.1 },
    ]);
  });

  it('keeps SA2s separate and gives an SA2 with no located persons no entry', () => {
    const shares = lgaSharesForSa2([
      { sa2_code: 'X', lga_id: 'lga_a', persons: 10 },
      { sa2_code: 'Y', lga_id: 'lga_b', persons: 20 },
      { sa2_code: 'Z', lga_id: null, persons: 50 },
      { sa2_code: 'W', lga_id: 'lga_a', persons: 0 },
    ]);
    expect(shares.get('X')).toEqual([{ lgaId: 'lga_a', share: 1 }]);
    expect(shares.get('Y')).toEqual([{ lgaId: 'lga_b', share: 1 }]);
    expect(shares.has('Z')).toBe(false);
    expect(shares.has('W')).toBe(false);
  });

  it('breaks equal shares by LGA id so the order is deterministic', () => {
    const shares = lgaSharesForSa2([
      { sa2_code: 'X', lga_id: 'lga_b', persons: 50 },
      { sa2_code: 'X', lga_id: 'lga_a', persons: 50 },
    ]);
    expect(shares.get('X')!.map((s) => s.lgaId)).toEqual(['lga_a', 'lga_b']);
  });

  it('produces no shares for the non-spatial SA2s, even if a block carried an LGA', () => {
    expect([...NON_SPATIAL_SA2_CODES].sort()).toEqual(['197979799', '199999499']);
    const shares = lgaSharesForSa2([
      { sa2_code: '197979799', lga_id: 'lga_sydney', persons: 100 },
      { sa2_code: '199999499', lga_id: 'lga_sydney', persons: 11371 },
    ]);
    expect(shares.size).toBe(0);
  });
});

describe('buildLgaLocator', () => {
  const square = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0],
  ];
  const feature = (id: string, geometry: GeoJSON.Geometry | null): GeoJSON.Feature => ({
    type: 'Feature',
    properties: { id },
    geometry: geometry as GeoJSON.Geometry,
  });

  it('finds Blacktown for a point inside it (real simplified boundaries)', () => {
    const geo = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'public/geo/lga-nsw-simple.json'), 'utf8'),
    ) as GeoJSON.FeatureCollection;
    const locate = buildLgaLocator(geo);
    // Blacktown station
    expect(locate(150.9063, -33.769)).toBe('lga_blacktown');
    // Sydney Town Hall
    expect(locate(151.2073, -33.8731)).toBe('lga_sydney');
  });

  it('returns null for a point outside every LGA', () => {
    const locate = buildLgaLocator({
      type: 'FeatureCollection',
      features: [feature('lga_a', { type: 'Polygon', coordinates: [square(0, 0, 1, 1)] })],
    });
    expect(locate(0.5, 0.5)).toBe('lga_a');
    expect(locate(5, 5)).toBeNull();
    // inside the bounding box of a non-rectangular polygon but outside the polygon
    const tri = buildLgaLocator({
      type: 'FeatureCollection',
      features: [feature('lga_t', { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [0, 4], [0, 0]]] })],
    });
    expect(tri(1, 1)).toBe('lga_t');
    expect(tri(3.5, 3.5)).toBeNull();
  });

  it('treats holes as outside and matches any part of a MultiPolygon', () => {
    const locate = buildLgaLocator({
      type: 'FeatureCollection',
      features: [
        feature('lga_donut', { type: 'Polygon', coordinates: [square(0, 0, 10, 10), square(4, 4, 6, 6)] }),
        feature('lga_islands', {
          type: 'MultiPolygon',
          coordinates: [[square(20, 20, 21, 21)], [square(30, 30, 31, 31)]],
        }),
      ],
    });
    expect(locate(1, 1)).toBe('lga_donut');
    expect(locate(5, 5)).toBeNull();
    expect(locate(20.5, 20.5)).toBe('lga_islands');
    expect(locate(30.5, 30.5)).toBe('lga_islands');
    expect(locate(25, 25)).toBeNull();
  });

  it('gives a point on a shared boundary to the first feature, every time', () => {
    const features = [
      feature('lga_west', { type: 'Polygon', coordinates: [square(0, 0, 1, 1)] }),
      feature('lga_east', { type: 'Polygon', coordinates: [square(1, 0, 2, 1)] }),
    ];
    const locate = buildLgaLocator({ type: 'FeatureCollection', features });
    expect(locate(1, 0.5)).toBe('lga_west');
    expect(locate(1, 0.5)).toBe('lga_west');
    const reversed = buildLgaLocator({ type: 'FeatureCollection', features: [...features].reverse() });
    expect(reversed(1, 0.5)).toBe('lga_east');
  });

  it('skips features with no geometry or no id', () => {
    const locate = buildLgaLocator({
      type: 'FeatureCollection',
      features: [
        feature('lga_none', null),
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [square(0, 0, 1, 1)] } },
        feature('lga_ok', { type: 'Polygon', coordinates: [square(0, 0, 1, 1)] }),
      ],
    });
    expect(locate(0.5, 0.5)).toBe('lga_ok');
  });
});
