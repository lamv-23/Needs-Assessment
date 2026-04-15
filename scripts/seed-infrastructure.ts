import { LGA_CODE_MAP } from '@/lib/abs-fetchers';
import { upsertNSWInfrastructure } from '@/lib/db';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import { getNSWInfrastructureLengths } from '@/lib/nsw-spatial-services';

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

async function main() {
  const { lgaIds } = parseArgs();
  let seededRows = 0;

  for (const lgaId of lgaIds) {
    const lgaCode = LGA_CODE_MAP[lgaId];
    if (!lgaCode) {
      throw new Error(`Unknown LGA: ${lgaId}`);
    }

    const rows = await getNSWInfrastructureLengths(lgaId);
    for (const row of rows) {
      upsertNSWInfrastructure({
        lga_code: lgaCode,
        feature_type: row.feature_type,
        total_length_km: row.total_length_km,
      });
      seededRows += 1;
    }

    console.log(`[seed:infrastructure] ${lgaId}: ${rows.length} rows`);
  }

  console.log(`[seed:infrastructure] Done. Seeded ${seededRows} rows across ${lgaIds.length} LGAs.`);
}

main().catch((error) => {
  console.error('[seed:infrastructure] Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
