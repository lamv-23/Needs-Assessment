#!/usr/bin/env tsx
/**
 * Fetch ABS Census 2021 indicators for every NSW SA2 into data/build.db (sa2_cache).
 *
 * One request per 100 SA2s per table, sequential (~65 requests, a few minutes);
 * see the header of src/lib/abs-sa2-fetchers.ts. Only the gitignored build
 * database is written; data/cache.db is not touched.
 *
 * Usage:
 *   npm run seed:sa2
 *   npm run seed:sa2 -- --dataset G01     # one table (G01 G02 G13 G18 G33_INCOME G34 LABOUR G62 SEIFA)
 */

import { SA2_AREAS } from '../src/lib/data/sa2-areas';
import { SA2_DATASETS, fetchSa2Dataset, type Sa2Dataset } from '../src/lib/abs-sa2-fetchers';
import { getBuildDb, upsertSa2Cache } from '../src/lib/build-db';

const args = process.argv.slice(2);
const only = args.includes('--dataset') ? args[args.indexOf('--dataset') + 1] : null;

async function main(): Promise<void> {
  if (only && !(SA2_DATASETS as readonly string[]).includes(only)) {
    console.error(`Unknown dataset: ${only} (expected one of ${SA2_DATASETS.join(', ')})`);
    process.exit(1);
  }
  const datasets: readonly Sa2Dataset[] = only ? [only as Sa2Dataset] : SA2_DATASETS;
  const codes = SA2_AREAS.map((a) => a.code);
  const db = getBuildDb();
  let failed = 0;

  for (const dataset of datasets) {
    try {
      const rows = await fetchSa2Dataset(dataset, codes);
      // Replace the table's rows so an SA2 that no longer has data does not keep a stale one.
      db.transaction(() => {
        db.prepare('DELETE FROM sa2_cache WHERE dataset = ?').run(dataset);
        rows.forEach((data, sa2) => upsertSa2Cache(sa2, dataset, data));
      })();

      const missing = codes.filter((c) => !rows.has(c));
      const note = missing.length > 0 && missing.length <= 10 ? `  (no data: ${missing.join(', ')})` : '';
      console.log(`${dataset} ${rows.size}/${codes.length}${note}`);
    } catch (err) {
      failed++;
      console.error(`${dataset} FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
