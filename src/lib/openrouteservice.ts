/**
 * OpenRouteService Matrix API client.
 * Used for driving, cycling, and walking time estimates from LGA centroid to CBD.
 * Free tier: 2,000 matrix requests/day. Monthly refresh of 128 LGAs × 3 modes = 384 requests.
 * Register free at https://openrouteservice.org/dev/#/signup
 *
 * IMPORTANT: Results displayed with "indicative" label — OpenStreetMap routing,
 * suitable for benchmarking only.
 */

const ORS_BASE = 'https://api.openrouteservice.org/v2/matrix';

export type ORSProfile = 'driving-car' | 'cycling-regular' | 'foot-walking';

export interface ORSMatrixResult {
  durationSeconds: number;
  distanceMetres: number;
}

export async function getORSMatrix(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  profile: ORSProfile
): Promise<ORSMatrixResult | null> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) return null;

  try {
    const body = {
      locations: [
        [originLng, originLat],
        [destLng, destLat],
      ],
      sources: [0],
      destinations: [1],
      metrics: ['duration', 'distance'],
    };

    const res = await fetch(`${ORS_BASE}/${profile}`, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const json = await res.json() as {
      durations?: number[][];
      distances?: number[][];
    };

    const duration = json.durations?.[0]?.[0];
    const distance = json.distances?.[0]?.[0];

    if (duration === undefined || duration === null) return null;

    return {
      durationSeconds: Math.round(duration),
      distanceMetres: Math.round(distance ?? 0),
    };
  } catch {
    return null;
  }
}
