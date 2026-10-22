/**
 * Mesh-block helpers for the SA2 catchment pipeline (build-time only; nothing in
 * the app bundle imports this).
 *
 *  - parseMeshBlockCounts: persons per mesh block from the ABS "Mesh Block Counts,
 *    2021" workbook.
 *  - buildLgaLocator: which LGA a mesh-block centroid falls in, against the full
 *    public/geo/lga-nsw.json boundaries.
 *  - lgaSharesForSa2: each LGA's share of an SA2's persons, so an SA2 can be
 *    assigned to the LGAs it overlaps (SA2s do not nest in LGAs).
 */

import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';

/**
 * The two special-purpose SA2s the ABS publishes without geometry: 197979799
 * Migratory - Offshore - Shipping and 199999499 No usual address. Their mesh
 * blocks have no place on the map, so they carry no LGA and take no part in LGA
 * shares or catchments (Ruling P2-R7).
 */
export const NON_SPATIAL_SA2_CODES: ReadonlySet<string> = new Set(['197979799', '199999499']);

const CODE_COLUMN = 'MB_CODE_2021';
const PERSON_COLUMN = 'Person';
/** Mesh block codes are 11 digits; the first is the state, and 1 is NSW. */
const MB_CODE_PATTERN = /^\d{11}$/;
const NSW_STATE_DIGIT = '1';

function cellText(cell: unknown): string {
  return typeof cell === 'string' ? cell.trim() : '';
}

/**
 * Persons per NSW mesh block from rows of a Mesh Block Counts sheet (one sheet's
 * rows; call it for each NSW sheet and merge). The header row is the one holding
 * MB_CODE_2021, wherever the title rows put it, and the Person column is found by
 * name. Rows whose code is not a NSW mesh block (other states, the notes and
 * copyright lines under the table) are dropped.
 */
export function parseMeshBlockCounts(rows: unknown[][]): Map<string, number> {
  const headerIdx = rows.findIndex((r) => r.some((c) => cellText(c) === CODE_COLUMN));
  if (headerIdx < 0) throw new Error(`Mesh Block Counts: no header row containing ${CODE_COLUMN}`);

  const header = rows[headerIdx].map((c) => cellText(c).toLowerCase());
  const codeCol = header.indexOf(CODE_COLUMN.toLowerCase());
  const personCol = header.indexOf(PERSON_COLUMN.toLowerCase());
  if (personCol < 0) throw new Error(`Mesh Block Counts: header row has no ${PERSON_COLUMN} column`);

  const counts = new Map<string, number>();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const raw = row[codeCol];
    const code = typeof raw === 'number' ? String(raw) : cellText(raw);
    if (!MB_CODE_PATTERN.test(code) || code[0] !== NSW_STATE_DIGIT) continue;

    const cell = row[personCol];
    const persons = typeof cell === 'number' ? cell : typeof cell === 'string' && cell.trim() !== '' ? Number(cell) : NaN;
    if (!Number.isFinite(persons) || persons < 0) {
      throw new Error(`Mesh Block Counts: mesh block ${code} has no usable ${PERSON_COLUMN} count (${JSON.stringify(cell)})`);
    }
    if (counts.has(code)) throw new Error(`Mesh Block Counts: mesh block ${code} appears twice`);
    counts.set(code, persons);
  }
  return counts;
}

type Ring = number[][];

interface LgaPart {
  id: string;
  bbox: [number, number, number, number];
  polygon: GeoJSON.Feature<GeoJSON.Polygon>;
}

function ringBbox(ring: Ring): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/**
 * A function that returns the `properties.id` of the LGA containing a point, or
 * null when none does. Each polygon (a MultiPolygon is split into its parts) is
 * prefiltered by bounding box before the point-in-polygon test, which is what
 * keeps ~113,000 points against the full-resolution boundaries fast. Parts are
 * tried in feature order and the first match wins, so a point on a shared
 * boundary always goes to the same LGA. A polygon hole counts as outside.
 */
export function buildLgaLocator(geo: GeoJSON.FeatureCollection): (lng: number, lat: number) => string | null {
  const parts: LgaPart[] = [];
  for (const f of geo.features) {
    const id = f.properties?.id;
    if (typeof id !== 'string' || !f.geometry) continue;
    const polygons: Ring[][] =
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates]
      : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates
      : [];
    for (const coordinates of polygons) {
      if (coordinates.length === 0) continue;
      parts.push({
        id,
        bbox: ringBbox(coordinates[0]),
        polygon: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } },
      });
    }
  }

  return (lng, lat) => {
    const point: [number, number] = [lng, lat];
    for (const part of parts) {
      const [minX, minY, maxX, maxY] = part.bbox;
      if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
      if (booleanPointInPolygon(point, part.polygon)) return part.id;
    }
    return null;
  };
}

/**
 * For each SA2, every LGA's share of its persons (Σ shares = 1), largest share
 * first (ties by LGA id). Blocks with no LGA, with no persons, or in a
 * non-spatial SA2 are ignored; an SA2 left with no located persons gets no entry.
 */
export function lgaSharesForSa2(
  blocks: { sa2_code: string; lga_id: string | null; persons: number }[],
): Map<string, { lgaId: string; share: number }[]> {
  const bySa2 = new Map<string, Map<string, number>>();
  for (const b of blocks) {
    if (b.lga_id === null || b.persons <= 0 || NON_SPATIAL_SA2_CODES.has(b.sa2_code)) continue;
    const byLga = bySa2.get(b.sa2_code) ?? new Map<string, number>();
    byLga.set(b.lga_id, (byLga.get(b.lga_id) ?? 0) + b.persons);
    bySa2.set(b.sa2_code, byLga);
  }

  const shares = new Map<string, { lgaId: string; share: number }[]>();
  for (const [sa2, byLga] of bySa2) {
    const total = [...byLga.values()].reduce((s, p) => s + p, 0);
    shares.set(
      sa2,
      [...byLga]
        .map(([lgaId, persons]) => ({ lgaId, share: persons / total }))
        .sort((a, b) => b.share - a.share || (a.lgaId < b.lgaId ? -1 : 1)),
    );
  }
  return shares;
}
