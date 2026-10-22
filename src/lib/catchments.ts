/**
 * Straight-line walking catchments.
 *
 * A mesh block is "covered" when its centroid lies within the walk radius of a stop that has
 * service: frequent (>= FREQUENT_DEPARTURES_THRESHOLD weekday 07:00-09:00 departures) or any
 * (>= 1 departure). The radius depends on the stop's mode (CATCHMENT_RADIUS_M). Distances are
 * straight-line (haversine), not walking routes, so the shares are an upper bound; every
 * figure built from them must say "straight-line distance".
 *
 * Stops count wherever they are: coverage ignores LGA and SA2 boundaries.
 *
 * Shares are persons-weighted and expressed in PERCENT (0-100, rounded to 4 decimal places),
 * or null when the area has no persons. Used by scripts/build-catchments.ts.
 */

import { FREQUENT_DEPARTURES_THRESHOLD, type FrequencyMode } from './gtfs-frequency';

/** Walk radius in metres, by the mode of the stop. */
export const CATCHMENT_RADIUS_M: Record<FrequencyMode, number> = {
  train: 800,
  metro: 800,
  ferry: 800,
  lightRail: 400,
  bus: 400,
};

const EARTH_RADIUS_M = 6_371_008.8;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const DEFAULT_CELL_DEG = 0.01;
/** Added to the search window so a stop exactly on the radius is never dropped by rounding. */
const WINDOW_EPSILON_DEG = 1e-9;

/** Haversine distance in metres on a sphere of radius 6,371,008.8 m. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const dPhi = (lat2 - lat1) * DEG_TO_RAD;
  const dLambda = (lng2 - lng1) * DEG_TO_RAD;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface CatchmentStop {
  lat: number;
  lng: number;
  mode: FrequencyMode;
  /** Weekday 07:00-09:00 departures. */
  amPeakDepartures: number;
}

interface IndexedStop {
  lat: number;
  lng: number;
  radiusM: number;
  frequent: boolean;
}

export interface StopIndex {
  cellDeg: number;
  cells: Map<string, IndexedStop[]>;
  /** Largest walk radius among the indexed stops; sizes the search window. */
  maxRadiusM: number;
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/**
 * Index the serviced stops (>= 1 departure) in a lat/lng grid of `cellDeg` degrees. Stops with no
 * departures cover nothing, so they are left out.
 */
export function buildStopIndex(stops: CatchmentStop[], cellDeg: number = DEFAULT_CELL_DEG): StopIndex {
  const cells = new Map<string, IndexedStop[]>();
  let maxRadiusM = 0;
  for (const stop of stops) {
    if (stop.amPeakDepartures < 1) continue;
    const radiusM = CATCHMENT_RADIUS_M[stop.mode];
    if (radiusM === undefined) throw new Error(`Unknown stop mode: ${stop.mode}`);
    maxRadiusM = Math.max(maxRadiusM, radiusM);
    const key = cellKey(Math.floor(stop.lat / cellDeg), Math.floor(stop.lng / cellDeg));
    const entry: IndexedStop = {
      lat: stop.lat,
      lng: stop.lng,
      radiusM,
      frequent: stop.amPeakDepartures >= FREQUENT_DEPARTURES_THRESHOLD,
    };
    const bucket = cells.get(key);
    if (bucket) bucket.push(entry);
    else cells.set(key, [entry]);
  }
  return { cellDeg, cells, maxRadiusM };
}

/** Whether a stop within walking distance of (lat, lng) has frequent / any service. */
export function coverage(index: StopIndex, lat: number, lng: number): { frequent: boolean; any: boolean } {
  const { cellDeg, cells, maxRadiusM } = index;
  if (cells.size === 0) return { frequent: false, any: false };

  // Search window covering every point within maxRadiusM of (lat, lng). Longitude degrees shrink
  // with latitude: a circle of angular radius d around latitude phi spans asin(sin d / cos phi).
  const angular = maxRadiusM / EARTH_RADIUS_M;
  const dLat = angular * RAD_TO_DEG + WINDOW_EPSILON_DEG;
  const ratio = Math.sin(angular) / Math.cos(lat * DEG_TO_RAD);
  const dLng = (ratio >= 1 ? 180 : Math.asin(ratio) * RAD_TO_DEG) + WINDOW_EPSILON_DEG;

  const rowFrom = Math.floor((lat - dLat) / cellDeg);
  const rowTo = Math.floor((lat + dLat) / cellDeg);
  const colFrom = Math.floor((lng - dLng) / cellDeg);
  const colTo = Math.floor((lng + dLng) / cellDeg);

  let any = false;
  for (let row = rowFrom; row <= rowTo; row++) {
    for (let col = colFrom; col <= colTo; col++) {
      const bucket = cells.get(cellKey(row, col));
      if (!bucket) continue;
      for (const stop of bucket) {
        if (distanceM(lat, lng, stop.lat, stop.lng) > stop.radiusM) continue;
        if (stop.frequent) return { frequent: true, any: true };
        any = true;
      }
    }
  }
  return { frequent: false, any };
}

/**
 * Persons living within walking distance of service, for one area.
 * `frequentShare` and `anyShare` are PERCENT of `persons` (0-100, 4 dp); null when persons = 0.
 */
export interface CatchmentShare {
  persons: number;
  frequentPersons: number;
  anyPersons: number;
  frequentShare: number | null;
  anyShare: number | null;
}

function toShare(persons: number, frequentPersons: number, anyPersons: number): CatchmentShare {
  const percent = (count: number): number | null =>
    persons > 0 ? Math.round((count * 1e6) / persons) / 1e4 : null;
  return { persons, frequentPersons, anyPersons, frequentShare: percent(frequentPersons), anyShare: percent(anyPersons) };
}

/** Catchment shares per `key` (an SA2, an LGA...) from the located mesh blocks in each. */
export function catchmentShares(
  blocks: { key: string; persons: number; lat: number; lng: number }[],
  index: StopIndex,
): Map<string, CatchmentShare> {
  const totals = new Map<string, { persons: number; frequent: number; any: number }>();
  for (const block of blocks) {
    let total = totals.get(block.key);
    if (!total) {
      total = { persons: 0, frequent: 0, any: 0 };
      totals.set(block.key, total);
    }
    total.persons += block.persons;
    if (block.persons <= 0) continue;
    const covered = coverage(index, block.lat, block.lng);
    if (covered.frequent) total.frequent += block.persons;
    if (covered.any) total.any += block.persons;
  }
  const shares = new Map<string, CatchmentShare>();
  for (const [key, total] of totals) shares.set(key, toShare(total.persons, total.frequent, total.any));
  return shares;
}

/** Pool several areas into one (e.g. LGAs into Greater Sydney): sum the persons, recompute the shares. */
export function poolShares(parts: Iterable<CatchmentShare>): CatchmentShare {
  let persons = 0;
  let frequent = 0;
  let any = 0;
  for (const part of parts) {
    persons += part.persons;
    frequent += part.frequentPersons;
    any += part.anyPersons;
  }
  return toShare(persons, frequent, any);
}
