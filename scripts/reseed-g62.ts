#!/usr/bin/env tsx
/**
 * Re-seed G62 (journey-to-work) data for all LGAs.
 *
 * Run after fixing MTWP code mappings in fetchG62().
 * Fetches fresh G62 data from the ABS API and overwrites the cache.
 *
 * Usage:
 *   npx tsx scripts/reseed-g62.ts
 *   npx tsx scripts/reseed-g62.ts --lga lga_sydney
 */

import { getDb, upsertABSCache } from '../src/lib/db';
import { fetchG62, LGA_CODE_MAP } from '../src/lib/abs-fetchers';

const args = process.argv.slice(2);
const singleLGA = args.includes('--lga') ? args[args.indexOf('--lga') + 1] : null;

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

  console.log(`\nRe-seeding G62 for ${unique.length} LGA(s)...\n`);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < unique.length; i++) {
    const [lgaId, lgaCode] = unique[i];
    process.stdout.write(`  [${i + 1}/${unique.length}] ${lgaId} (${lgaCode}) … `);

    try {
      const g62 = await fetchG62(lgaCode);
      if (g62) {
        upsertABSCache(lgaCode, 'G62', g62, 2021);
        const carPct = ((g62.car_driver / g62.total) * 100).toFixed(1);
        const trainPct = ((g62.train / g62.total) * 100).toFixed(1);
        const busPct = ((g62.bus / g62.total) * 100).toFixed(1);
        console.log(`✓  car=${carPct}% train=${trainPct}% bus=${busPct}%`);
        ok++;
      } else {
        console.log('— no data');
        fail++;
      }
    } catch (err) {
      console.log(`✗ ${(err as Error).message}`);
      fail++;
    }

    // Rate limit: 300ms between requests
    if (i < unique.length - 1) await sleep(300);
  }

  console.log(`\nDone: ${ok} updated, ${fail} failed/no-data\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
