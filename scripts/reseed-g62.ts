#!/usr/bin/env tsx
/**
 * Re-seed Census journey-to-work data (G62 2021, G59 2016, B46 2011) for all LGAs.
 *
 * Run after changing MTWP code mappings in the journey-to-work fetchers.
 * Fetches fresh data from the ABS API and overwrites the cache.
 *
 * Usage:
 *   npx tsx scripts/reseed-g62.ts
 *   npx tsx scripts/reseed-g62.ts --lga lga_sydney
 */

import { getDb, upsertABSCache } from '../src/lib/db';
import {
  fetchG62, fetchG59_2016, fetchB46_2011, journeyToWorkBase, LGA_CODE_MAP,
  type JourneyToWorkData,
} from '../src/lib/abs-fetchers';

const args = process.argv.slice(2);
const singleLGA = args.includes('--lga') ? args[args.indexOf('--lga') + 1] : null;

const DATASETS: Array<[string, number, (code: string) => Promise<JourneyToWorkData | null>]> = [
  ['G62', 2021, fetchG62],
  ['G59', 2016, fetchG59_2016],
  ['B46', 2011, fetchB46_2011],
];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  getDb(); // initialise DB

  let lgasToFetch: Array<[string, string]>;

  if (singleLGA) {
    const code = LGA_CODE_MAP[singleLGA];
    if (!code) {
      console.error(`Unknown LGA ID: ${singleLGA}`);
      process.exit(1);
    }
    lgasToFetch = [[singleLGA, code]];
  } else {
    lgasToFetch = Object.entries(LGA_CODE_MAP).filter(([id]) => id !== 'benchmark_gsy');
  }

  // Deduplicate by LGA code (some IDs map to the same code)
  const seen = new Set<string>();
  const unique = lgasToFetch.filter(([, code]) => {
    if (seen.has(code)) return false;
    seen.add(code);
    return true;
  });

  console.log(`\nRe-seeding journey-to-work (G62/G59/B46) for ${unique.length} LGA(s)...\n`);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < unique.length; i++) {
    const [lgaId, lgaCode] = unique[i];
    process.stdout.write(`  [${i + 1}/${unique.length}] ${lgaId} (${lgaCode}) … `);

    const parts: string[] = [];
    for (const [dataset, year, fetcher] of DATASETS) {
      try {
        const jtw = await fetcher(lgaCode);
        if (jtw) {
          upsertABSCache(lgaCode, dataset, jtw, year);
          const base = journeyToWorkBase(jtw);
          const pct = (n: number) => ((n / base) * 100).toFixed(1);
          parts.push(`${year} car=${pct(jtw.car_driver)}% train=${pct(jtw.train)}% wfh=${pct(jtw.worked_home)}%`);
          ok++;
        } else {
          parts.push(`${year} —`);
          fail++;
        }
      } catch (err) {
        parts.push(`${year} ✗ ${(err as Error).message}`);
        fail++;
      }
    }
    console.log(parts.join(' | '));

    // Rate limit: 300ms between LGAs (G59/B46 are cached in memory after the first call)
    if (i < unique.length - 1) await sleep(300);
  }

  console.log(`\nDone: ${ok} dataset rows updated, ${fail} failed/no-data\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
