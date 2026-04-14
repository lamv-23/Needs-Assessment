import { NextRequest, NextResponse } from 'next/server';
import { getCommuteTimesForLGA, upsertCommuteTime } from '@/lib/db';
import { getPTJourneyTime } from '@/lib/tfnsw-trip-planner';
import { getORSMatrix } from '@/lib/openrouteservice';
import { LGA_CODE_MAP } from '@/lib/abs-fetchers';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';

// Major destination centroids
const DESTINATIONS: Record<string, { name: string; lat: number; lng: number }> = {
  sydney_cbd: { name: 'Sydney CBD', lat: -33.8688, lng: 151.2093 },
  parramatta_cbd: { name: 'Parramatta CBD', lat: -33.8148, lng: 151.0017 },
};

// LGA centroids (approx)
const LGA_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  lga_sydney:       { lat: -33.8688, lng: 151.2093 },
  lga_parramatta:   { lat: -33.8148, lng: 151.0017 },
  lga_blacktown:    { lat: -33.7668, lng: 150.9054 },
  lga_penrith:      { lat: -33.7510, lng: 150.6942 },
  lga_camden:       { lat: -34.0500, lng: 150.6974 },
  lga_liverpool:    { lat: -33.9200, lng: 150.9200 },
  lga_campbelltown: { lat: -34.0650, lng: 150.8135 },
  lga_bankstown:    { lat: -33.9180, lng: 151.0340 },
  lga_ryde:         { lat: -33.8150, lng: 151.1015 },
  lga_hornsby:      { lat: -33.7020, lng: 151.0990 },
};

function findNearestDestination(lgaId: string): string {
  const westernLGAs = ['lga_penrith', 'lga_blacktown', 'lga_camden', 'lga_liverpool', 'lga_campbelltown', 'lga_blue_mountains'];
  return westernLGAs.includes(lgaId) ? 'parramatta_cbd' : 'sydney_cbd';
}

// Fallback centroid from SAMPLE_AREAS
function getCentroid(lgaId: string): { lat: number; lng: number } | null {
  if (LGA_CENTROIDS[lgaId]) return LGA_CENTROIDS[lgaId];
  const area = SAMPLE_AREAS.find((a) => a.id === lgaId);
  if (area && 'centroidLat' in area && 'centroidLng' in area) {
    return { lat: area.centroidLat as number, lng: area.centroidLng as number };
  }
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { lgaId: string } }
) {
  const { lgaId } = params;
  const lgaCode = LGA_CODE_MAP[lgaId];
  if (!lgaCode) {
    return NextResponse.json({ error: 'Unknown LGA' }, { status: 404 });
  }

  // Check cache — monthly refresh
  const cached = getCommuteTimesForLGA(lgaCode);
  const today = new Date().toISOString().slice(0, 7); // YYYY-MM
  const fresh = cached.filter((r) => r.fetched_date.startsWith(today));
  if (fresh.length >= 4) {
    return NextResponse.json({ data: fresh, cached: true });
  }

  const centroid = getCentroid(lgaId);
  if (!centroid) {
    return NextResponse.json({ data: cached, cached: true, note: 'No centroid defined for this LGA' });
  }

  const destKey = findNearestDestination(lgaId);
  const dest = DESTINATIONS[destKey];
  const fetchDate = new Date().toISOString().slice(0, 10);

  const results = [];

  // PT via TfNSW Trip Planner
  const ptResult = await getPTJourneyTime(centroid.lat, centroid.lng, dest.lat, dest.lng);
  if (ptResult) {
    const row = {
      lga_code: lgaCode,
      destination: destKey,
      mode: 'transit',
      duration_minutes: ptResult.durationMinutes,
      distance_km: null,
      fetched_date: fetchDate,
    };
    upsertCommuteTime(row);
    results.push(row);
  }

  // Driving, cycling, walking via OpenRouteService
  const modeMap: Record<string, string> = {
    'driving-car': 'driving',
    'cycling-regular': 'cycling',
    'foot-walking': 'walking',
  };
  for (const profile of ['driving-car', 'cycling-regular', 'foot-walking'] as const) {
    const orsResult = await getORSMatrix(centroid.lat, centroid.lng, dest.lat, dest.lng, profile);
    if (orsResult) {
      const row = {
        lga_code: lgaCode,
        destination: destKey,
        mode: modeMap[profile],
        duration_minutes: Math.round(orsResult.durationSeconds / 60),
        distance_km: Math.round((orsResult.distanceMetres / 1000) * 10) / 10,
        fetched_date: fetchDate,
      };
      upsertCommuteTime(row);
      results.push(row);
    }
  }

  return NextResponse.json({ data: results.length > 0 ? results : cached, cached: false });
}
