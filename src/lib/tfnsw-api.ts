/**
 * TfNSW Open Data API scaffold.
 * 
 * Returns null for all live fetches until TFNSW_API_KEY is set in environment.
 * Transport metrics will be served from the bundled static data (tfnsw-transport.ts)
 * which is seeded into SQLite by the seed script.
 * 
 * TODO: When TFNSW_API_KEY is available, implement:
 *   - patronage data: https://opendata.transport.nsw.gov.au/data/dataset/annual-patronage
 *   - GTFS static feeds for stop/route data
 *   - Opal tap-on/tap-off aggregates (if accessible)
 */

const TFNSW_BASE = 'https://api.transport.nsw.gov.au/v1';

export function isTfNSWConfigured(): boolean {
  return Boolean(process.env.TFNSW_API_KEY);
}

export interface TfNSWPatronageData {
  lgaCode: string;
  year: number;
  totalTrips: number;
  tripsByMode: {
    train: number;
    bus: number;
    ferry: number;
    lightRail: number;
  };
  source: 'tfnsw_api';
}

export interface TfNSWTrafficData {
  lgaCode: string;
  year: number;
  avgDailyVehicles: number;
  peakHourCongestionIndex: number;
  source: 'tfnsw_api';
}

/**
 * Fetch annual patronage data for a given LGA from TfNSW Open Data.
 * Returns null if TFNSW_API_KEY is not configured.
 */
export async function fetchPatronageByLGA(
  lgaCode: string,
  year = 2023
): Promise<TfNSWPatronageData | null> {
  if (!isTfNSWConfigured()) {
    console.log('[TfNSW] TFNSW_API_KEY not set — skipping patronage fetch');
    return null;
  }

  try {
    // TODO: Implement when API key is available
    // const res = await fetch(`${TFNSW_BASE}/patronage/lga/${lgaCode}?year=${year}`, {
    //   headers: { Authorization: `apikey ${process.env.TFNSW_API_KEY}` },
    // });
    // const json = await res.json();
    // return parsePatronageResponse(json, lgaCode, year);
    void TFNSW_BASE; // suppress unused warning until implemented
    console.log(`[TfNSW] Patronage fetch not yet implemented for LGA ${lgaCode}`);
    return null;
  } catch (err) {
    console.error(`[TfNSW] Failed to fetch patronage for LGA ${lgaCode}:`, err);
    return null;
  }
}

/**
 * Fetch traffic volume data for a given LGA from TfNSW.
 * Returns null if TFNSW_API_KEY is not configured.
 */
export async function fetchTrafficByLGA(
  lgaCode: string,
  year = 2023
): Promise<TfNSWTrafficData | null> {
  if (!isTfNSWConfigured()) {
    return null;
  }

  try {
    // TODO: Implement when API key is available
    console.log(`[TfNSW] Traffic fetch not yet implemented for LGA ${lgaCode}`);
    return null;
  } catch (err) {
    console.error(`[TfNSW] Failed to fetch traffic for LGA ${lgaCode}:`, err);
    return null;
  }
}

/**
 * Fetch all TfNSW data for a given LGA.
 * Returns null for all fields until TFNSW_API_KEY is configured.
 */
export async function fetchAllTfNSWData(lgaCode: string): Promise<{
  patronage: TfNSWPatronageData | null;
  traffic: TfNSWTrafficData | null;
}> {
  const [patronage, traffic] = await Promise.all([
    fetchPatronageByLGA(lgaCode),
    fetchTrafficByLGA(lgaCode),
  ]);
  return { patronage, traffic };
}
