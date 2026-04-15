import { NextRequest, NextResponse } from 'next/server';
import { getCommuteTimesForLGA, upsertCommuteTime } from '@/lib/db';
import { getPTJourneyTime } from '@/lib/tfnsw-trip-planner';
import { getORSMatrix } from '@/lib/openrouteservice';
import { LGA_CODE_MAP } from '@/lib/abs-fetchers';
import {
  findNearestDestination,
  getRealtimeCentroid,
  REALTIME_DESTINATIONS,
} from '@/lib/transport-realtime';

export async function GET(
  _req: NextRequest,
  { params }: { params: { lgaId: string } }
) {
  const { lgaId } = params;
  const lgaCode = LGA_CODE_MAP[lgaId];
  if (!lgaCode) {
    return NextResponse.json({ error: 'Unknown LGA' }, { status: 404 });
  }

  const cached = getCommuteTimesForLGA(lgaCode);
  const today = new Date().toISOString().slice(0, 7);
  const fresh = cached.filter((row) => row.fetched_date.startsWith(today));
  if (fresh.length >= 4) {
    return NextResponse.json({ data: fresh, cached: true });
  }

  if (process.env.VERCEL === '1') {
    return NextResponse.json({
      data: cached,
      cached: true,
      note: cached.length > 0
        ? 'Showing the bundled snapshot for this area.'
        : 'A bundled commute-time snapshot is not available for this area in the shared deployment.',
    });
  }

  const centroid = getRealtimeCentroid(lgaId);
  if (!centroid) {
    return NextResponse.json({
      data: cached,
      cached: true,
      note: 'No centroid defined for this LGA',
    });
  }

  const destinationKey = findNearestDestination(lgaId);
  const destination = REALTIME_DESTINATIONS[destinationKey];
  const fetchDate = new Date().toISOString().slice(0, 10);
  const results = [];

  const ptResult = await getPTJourneyTime(
    centroid.lat,
    centroid.lng,
    destination.lat,
    destination.lng,
  );
  if (ptResult) {
    const row = {
      lga_code: lgaCode,
      destination: destinationKey,
      mode: 'transit',
      duration_minutes: ptResult.durationMinutes,
      distance_km: null,
      fetched_date: fetchDate,
    };
    upsertCommuteTime(row);
    results.push(row);
  }

  const modeMap: Record<string, string> = {
    'driving-car': 'driving',
    'cycling-regular': 'cycling',
    'foot-walking': 'walking',
  };

  for (const profile of ['driving-car', 'cycling-regular', 'foot-walking'] as const) {
    const orsResult = await getORSMatrix(
      centroid.lat,
      centroid.lng,
      destination.lat,
      destination.lng,
      profile,
    );
    if (!orsResult) {
      continue;
    }

    const row = {
      lga_code: lgaCode,
      destination: destinationKey,
      mode: modeMap[profile],
      duration_minutes: Math.round(orsResult.durationSeconds / 60),
      distance_km: Math.round((orsResult.distanceMetres / 1000) * 10) / 10,
      fetched_date: fetchDate,
    };
    upsertCommuteTime(row);
    results.push(row);
  }

  return NextResponse.json({ data: results.length > 0 ? results : cached, cached: false });
}
