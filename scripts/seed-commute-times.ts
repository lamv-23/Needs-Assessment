import { LGA_CODE_MAP } from '@/lib/abs-fetchers';
import { upsertCommuteTime } from '@/lib/db';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import { getORSMatrix } from '@/lib/openrouteservice';
import { getPTJourneyTime } from '@/lib/tfnsw-trip-planner';
import {
  findNearestDestination,
  getRealtimeCentroid,
  REALTIME_DESTINATIONS,
} from '@/lib/transport-realtime';

const modeMap: Record<string, string> = {
  'driving-car': 'driving',
  'cycling-regular': 'cycling',
  'foot-walking': 'walking',
};

function parseArgs(): { lgaIds: string[] } {
  const args = process.argv.slice(2);
  const lgaIndex = args.indexOf('--lga');

  if (lgaIndex >= 0) {
    const lgaId = args[lgaIndex + 1];
    if (!lgaId) {
      throw new Error('Missing value for --lga');
    }

    return { lgaIds: [lgaId] };
  }

  return {
    lgaIds: SAMPLE_AREAS
      .filter((area) => area.type === 'lga' && area.id in LGA_CODE_MAP)
      .map((area) => area.id),
  };
}

async function seedArea(lgaId: string): Promise<number> {
  const lgaCode = LGA_CODE_MAP[lgaId];
  if (!lgaCode) {
    throw new Error(`Unknown LGA: ${lgaId}`);
  }

  const centroid = getRealtimeCentroid(lgaId);
  if (!centroid) {
    throw new Error(`No centroid configured for ${lgaId}`);
  }

  const destinationKey = findNearestDestination(lgaId);
  const destination = REALTIME_DESTINATIONS[destinationKey];
  const fetchDate = new Date().toISOString().slice(0, 10);
  let inserted = 0;

  if (process.env.TFNSW_API_KEY) {
    const ptResult = await getPTJourneyTime(
      centroid.lat,
      centroid.lng,
      destination.lat,
      destination.lng,
    );
    if (ptResult) {
      upsertCommuteTime({
        lga_code: lgaCode,
        destination: destinationKey,
        mode: 'transit',
        duration_minutes: ptResult.durationMinutes,
        distance_km: null,
        fetched_date: fetchDate,
      });
      inserted += 1;
    }
  }

  if (process.env.OPENROUTESERVICE_API_KEY) {
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

      upsertCommuteTime({
        lga_code: lgaCode,
        destination: destinationKey,
        mode: modeMap[profile],
        duration_minutes: Math.round(orsResult.durationSeconds / 60),
        distance_km: Math.round((orsResult.distanceMetres / 1000) * 10) / 10,
        fetched_date: fetchDate,
      });
      inserted += 1;
    }
  }

  return inserted;
}

async function main() {
  const { lgaIds } = parseArgs();

  if (!process.env.TFNSW_API_KEY && !process.env.OPENROUTESERVICE_API_KEY) {
    throw new Error(
      'Set TFNSW_API_KEY and/or OPENROUTESERVICE_API_KEY before running seed:commute-times',
    );
  }

  let populated = 0;
  for (const lgaId of lgaIds) {
    const rows = await seedArea(lgaId);
    populated += rows;
    console.log(`[seed:commute-times] ${lgaId}: ${rows} rows`);
  }

  console.log(`[seed:commute-times] Done. Seeded ${populated} rows across ${lgaIds.length} LGAs.`);
}

main().catch((error) => {
  console.error('[seed:commute-times] Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
