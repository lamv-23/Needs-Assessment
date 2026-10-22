#!/usr/bin/env tsx
/**
 * Official Transport Seed — commute time, commuting distance, station patronage,
 * crash trends. The work is in src/lib/official-transport-seed.ts, which the
 * admin refresh ('transport' job) also runs.
 *
 * Run:  npm run seed:transport
 */

import { getDb } from '../src/lib/db';
import { seedOfficialTransport } from '../src/lib/official-transport-seed';

async function main(): Promise<void> {
  getDb();
  const result = await seedOfficialTransport((message) => console.log(message));
  if (result.failures.length) {
    console.error(`\nFinished with failures: ${result.failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
