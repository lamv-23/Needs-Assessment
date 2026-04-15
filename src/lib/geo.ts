import fs from 'fs';
import path from 'path';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';

/**
 * Haversine distance between two lat/lng points — returns metres.
 */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Fallback centre — Sydney CBD
const SYDNEY_CBD: [number, number] = [-33.8688, 151.2093];

let lgaGeoCache: GeoJSON.FeatureCollection | null = null;

function loadLGAGeo(): GeoJSON.FeatureCollection | null {
  if (lgaGeoCache) return lgaGeoCache;
  try {
    const filePath = path.join(process.cwd(), 'public', 'geo', 'lga-nsw.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    lgaGeoCache = JSON.parse(raw) as GeoJSON.FeatureCollection;
    return lgaGeoCache;
  } catch {
    return null;
  }
}

type Coord = [number, number]; // [lng, lat] — GeoJSON order

function avgCoords(coords: Coord[]): [number, number] {
  let sumLat = 0, sumLng = 0;
  for (const [lng, lat] of coords) { sumLat += lat; sumLng += lng; }
  return [sumLat / coords.length, sumLng / coords.length]; // returns [lat, lng]
}

function flattenRing(ring: Coord[]): Coord[] {
  return ring;
}

function getCentroidFromGeometry(geom: GeoJSON.Geometry): [number, number] | null {
  if (geom.type === 'Polygon') {
    return avgCoords(flattenRing(geom.coordinates[0] as Coord[]));
  }
  if (geom.type === 'MultiPolygon') {
    const allCoords: Coord[] = [];
    for (const poly of geom.coordinates) {
      allCoords.push(...(poly[0] as Coord[]));
    }
    return avgCoords(allCoords);
  }
  return null;
}

function normaliseAreaName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^city_of_/, '')
    .replace(/^the_/, '')
    .replace(/_council$/, '')
    .replace(/_shire$/, '')
    .replace(/_regional$/, '')
    .replace(/_region$/, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function matchesAreaId(feature: GeoJSON.Feature, areaId: string): boolean {
  const props = feature.properties ?? {};
  const area = SAMPLE_AREAS.find((candidate) => candidate.id === areaId);
  const needles = new Set([
    normaliseAreaName(areaId.replace(/^lga_/, '')),
    ...(area ? [normaliseAreaName(area.name)] : []),
  ]);
  const candidateKeys = ['LGA_NAME', 'lga_name', 'ABB_NAME', 'name', 'LGA_NAME22', 'LGA_NAME21'];

  for (const key of candidateKeys) {
    const value = props[key];
    if (typeof value === 'string' && needles.has(normaliseAreaName(value))) {
      return true;
    }
  }

  return false;
}

export function getLGAGeometry(areaId: string): GeoJSON.Geometry | null {
  const geo = loadLGAGeo();
  if (!geo) return null;

  for (const feature of geo.features) {
    if (!feature.geometry) continue;
    if (matchesAreaId(feature, areaId)) {
      return feature.geometry;
    }
  }

  return null;
}

/**
 * Returns [lat, lng] centroid for the given area id (e.g. 'lga_sydney').
 * Falls back to Sydney CBD if the LGA is not found in the GeoJSON.
 */
export function getLGACentroid(areaId: string): [number, number] {
  const geo = loadLGAGeo();
  if (!geo) return SYDNEY_CBD;

  for (const feature of geo.features) {
    if (!feature.geometry) continue;
    if (matchesAreaId(feature, areaId)) {
      const centroid = getCentroidFromGeometry(feature.geometry);
      if (centroid) return centroid;
    }
  }
  return SYDNEY_CBD;
}
