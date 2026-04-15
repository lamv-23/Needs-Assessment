/**
 * TfNSW Trip Planner API client.
 * Fetches scheduled PT journey times from LGA centroid to major CBDs.
 * Uses existing TFNSW_API_KEY environment variable.
 */

const TRIP_PLANNER_BASE = 'https://api.transport.nsw.gov.au/v1/tp';

export interface TripPlannerResult {
  durationMinutes: number;
  walkingMinutes: number;
  transfers: number;
  legs: number;
}

/**
 * Get scheduled PT journey time from origin to destination.
 * Uses a standard Tuesday 8:30am AM peak departure.
 */
export async function getPTJourneyTime(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<TripPlannerResult | null> {
  const apiKey = process.env.TFNSW_API_KEY;
  if (!apiKey) return null;

  // Standard AM peak: next Tuesday 8:30am
  const now = new Date();
  const daysUntilTuesday = (2 - now.getDay() + 7) % 7 || 7;
  const tuesday = new Date(now);
  tuesday.setDate(now.getDate() + daysUntilTuesday);
  const dateStr = tuesday.toISOString().slice(0, 10).replace(/-/g, '');

  const params = new URLSearchParams({
    outputFormat: 'rapidJSON',
    coordOutputFormat: 'EPSG:4326',
    depArrMacro: 'dep',
    itdDate: dateStr,
    itdTime: '0830',
    type_origin: 'coord',
    name_origin: `${originLng}:${originLat}:EPSG:4326`,
    type_destination: 'coord',
    name_destination: `${destLng}:${destLat}:EPSG:4326`,
    calcNumberOfTrips: '3',
    TfNSWTR: 'true',
  });

  try {
    const res = await fetch(`${TRIP_PLANNER_BASE}/trip?${params}`, {
      headers: { Authorization: `apikey ${apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const json = await res.json() as {
      journeys?: Array<{
        legs?: Array<{ duration?: number; transportation?: { product?: { class?: number } }; isWalking?: boolean }>;
        interchanges?: number;
      }>;
    };

    const journeys = json.journeys ?? [];
    if (journeys.length === 0) return null;

    // Take the first (fastest) journey
    const journey = journeys[0];
    const legs = journey.legs ?? [];
    const totalDuration = legs.reduce((sum, leg) => sum + (leg.duration ?? 0), 0);
    const walkingDuration = legs
      .filter((leg) => leg.isWalking)
      .reduce((sum, leg) => sum + (leg.duration ?? 0), 0);

    return {
      durationMinutes: Math.round(totalDuration / 60),
      walkingMinutes: Math.round(walkingDuration / 60),
      transfers: journey.interchanges ?? Math.max(0, legs.filter((l) => !l.isWalking).length - 1),
      legs: legs.length,
    };
  } catch {
    return null;
  }
}
