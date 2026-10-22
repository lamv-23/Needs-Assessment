import * as fs from 'fs';
import * as path from 'path';
import { SA2_AREAS } from '@/lib/data/sa2-areas';

const GEO_PATH = path.join(process.cwd(), 'public/geo/sa2-nsw-simple.json');

test('the SA2 registry covers the 644 NSW SA2s with unique 9-digit NSW codes', () => {
  expect(SA2_AREAS).toHaveLength(644);
  expect(new Set(SA2_AREAS.map(a => a.code)).size).toBe(644);
  expect(SA2_AREAS.every(a => /^1\d{8}$/.test(a.code))).toBe(true);
});

test('every SA2 has a name, parent regions and an area', () => {
  for (const a of SA2_AREAS) {
    expect(a.name).toBeTruthy();
    expect(a.sa3Name).toBeTruthy();
    expect(a.sa4Name).toBeTruthy();
    expect(a.gccsaName).toBeTruthy();
    expect(a.areaKm2).toBeGreaterThanOrEqual(0);
  }
});

describe('simplified SA2 boundaries', () => {
  const geo = JSON.parse(fs.readFileSync(GEO_PATH, 'utf8')) as GeoJSON.FeatureCollection;

  test('644 features whose properties.code and name match the registry', () => {
    expect(geo.features).toHaveLength(644);
    const byCode = new Map(SA2_AREAS.map(a => [a.code, a]));
    expect(new Set(geo.features.map(f => f.properties?.code)).size).toBe(644);
    for (const f of geo.features) {
      const area = byCode.get(f.properties?.code);
      expect(area).toBeDefined();
      expect(f.properties?.name).toBe(area!.name);
    }
  });

  test('only the two special-purpose SA2s (offshore / shipping, no usual address) lack a boundary', () => {
    const noGeometry = geo.features.filter(f => !f.geometry).map(f => f.properties?.code);
    expect(noGeometry.sort()).toEqual(['197979799', '199999499']);
    for (const f of geo.features.filter(f => f.geometry)) {
      expect(['Polygon', 'MultiPolygon']).toContain(f.geometry!.type);
    }
  });

  test('is small enough to ship (under 4 MB)', () => {
    expect(fs.statSync(GEO_PATH).size).toBeLessThan(4 * 1024 * 1024);
  });
});
