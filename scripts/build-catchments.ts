#!/usr/bin/env tsx
/**
 * Straight-line walking catchments for every NSW SA2 and LGA.
 *
 * For each located 2021 mesh block (data/build.db mesh_blocks) this tests whether its centroid
 * lies within walking distance of a stop with frequent (>= 8 departures, 07:00-09:00) or any
 * (>= 1) weekday service, using the stops in data/build.db gtfs_stop_frequency (lat, lng, mode
 * and departures from the same GTFS bundle). Radii: train/metro/ferry 800 m, bus/light rail 400 m
 * (src/lib/catchments.ts). Stops in any LGA count. Distances are straight-line, not walking routes.
 *
 * Outputs (shares are PERCENT of persons, 0-100, 4 dp; null when persons = 0):
 *   - data/build.db sa2_cache, dataset CATCHMENT: one row per SA2 with a located mesh block.
 *     Shares use all located blocks of the SA2. Non-spatial SA2s have none, so no row.
 *   - data/cache.db tfnsw_cache, dataset CATCHMENT_COVERAGE: one row per LGA under its ABS code,
 *     from blocks whose centroid falls in an LGA, plus pooled Greater Sydney ('1GSYD') and NSW
 *     ('1NSW') under the benchmark codes. Same JSON shape as the SA2 rows.
 *
 * Usage:
 *   npm run build:catchments
 */

import { getBuildDb, upsertSa2Cache } from '../src/lib/build-db';
import { getDb, upsertTfNSWCache } from '../src/lib/db';
import { LGA_CODE_MAP } from '../src/lib/abs-fetchers';
import { GREATER_SYDNEY_GCCSA_AREA_IDS } from '../src/lib/data/sample-areas';
import {
  CATCHMENT_RADIUS_M,
  buildStopIndex,
  catchmentShares,
  poolShares,
  type CatchmentShare,
  type CatchmentStop,
} from '../src/lib/catchments';
import type { FrequencyMode } from '../src/lib/gtfs-frequency';

const SA2_DATASET = 'CATCHMENT';
const LGA_DATASET = 'CATCHMENT_COVERAGE';
const SPOT_CHECK_LGAS = ['lga_sydney', 'lga_blacktown', 'lga_penrith', 'lga_newcastle', 'lga_bourke'];

interface StopRow { lat: number; lng: number; mode: string; am_peak_departures: number }
interface BlockRow { sa2_code: string; lga_id: string | null; persons: number; lat: number; lng: number }

function fmt(share: CatchmentShare): string {
  const pct = (v: number | null) => (v === null ? 'n/a' : `${v.toFixed(2)}%`);
  return `frequent ${pct(share.frequentShare)}, any ${pct(share.anyShare)} (${share.persons.toLocaleString('en-AU')} persons)`;
}

function main(): void {
  const started = Date.now();
  const buildDb = getBuildDb();

  // ── Stops ────────────────────────────────────────────────────────────────
  const stopRows = buildDb
    .prepare('SELECT lat, lng, mode, am_peak_departures FROM gtfs_stop_frequency')
    .all() as StopRow[];
  if (stopRows.length === 0) {
    console.error('gtfs_stop_frequency is empty. Run `npm run seed:gtfs` first.');
    process.exit(1);
  }
  const stops: CatchmentStop[] = [];
  const unknownModes = new Map<string, number>();
  for (const row of stopRows) {
    if (!Object.prototype.hasOwnProperty.call(CATCHMENT_RADIUS_M, row.mode)) {
      unknownModes.set(row.mode, (unknownModes.get(row.mode) ?? 0) + 1);
      continue;
    }
    stops.push({ lat: row.lat, lng: row.lng, mode: row.mode as FrequencyMode, amPeakDepartures: row.am_peak_departures });
  }
  for (const [mode, count] of unknownModes) console.warn(`  Skipping ${count} stops with unknown mode "${mode}"`);
  const index = buildStopIndex(stops);
  const serviced = stops.filter((s) => s.amPeakDepartures >= 1).length;
  console.log(`Stops: ${stopRows.length.toLocaleString('en-AU')} read, ${serviced.toLocaleString('en-AU')} with service indexed`);

  // ── Mesh blocks ──────────────────────────────────────────────────────────
  const blocks = buildDb
    .prepare('SELECT sa2_code, lga_id, persons, lat, lng FROM mesh_blocks WHERE lat IS NOT NULL')
    .all() as BlockRow[];
  if (blocks.length === 0) {
    console.error('mesh_blocks has no located blocks. Run `npm run seed:mesh-blocks` first.');
    process.exit(1);
  }
  console.log(`Mesh blocks: ${blocks.length.toLocaleString('en-AU')} located`);

  // ── Shares ───────────────────────────────────────────────────────────────
  const sa2Shares = catchmentShares(
    blocks.map((b) => ({ key: b.sa2_code, persons: b.persons, lat: b.lat, lng: b.lng })),
    index,
  );
  const lgaShares = catchmentShares(
    blocks.filter((b) => b.lga_id !== null).map((b) => ({ key: b.lga_id as string, persons: b.persons, lat: b.lat, lng: b.lng })),
    index,
  );

  const unmapped = [...lgaShares.keys()].filter((id) => !LGA_CODE_MAP[id]);
  if (unmapped.length > 0) {
    console.error(`mesh_blocks has LGA ids with no ABS code in LGA_CODE_MAP: ${unmapped.join(', ')}`);
    process.exit(1);
  }
  const lgaIdsInMap = Object.keys(LGA_CODE_MAP).filter((id) => id.startsWith('lga_'));
  const lgasWithoutBlocks = lgaIdsInMap.filter((id) => !lgaShares.has(id));
  if (lgasWithoutBlocks.length > 0) console.warn(`  No mesh blocks for ${lgasWithoutBlocks.length} LGAs: ${lgasWithoutBlocks.join(', ')}`);

  const gsyParts = GREATER_SYDNEY_GCCSA_AREA_IDS.map((id) => lgaShares.get(id)).filter((s): s is CatchmentShare => !!s);
  if (gsyParts.length !== GREATER_SYDNEY_GCCSA_AREA_IDS.length) {
    console.warn(`  Greater Sydney pooled over ${gsyParts.length} of ${GREATER_SYDNEY_GCCSA_AREA_IDS.length} LGAs`);
  }
  const greaterSydney = poolShares(gsyParts);
  const nsw = poolShares(lgaShares.values());

  // ── Write ────────────────────────────────────────────────────────────────
  // Replace the SA2 rows so an SA2 that no longer has located blocks does not keep a stale one.
  buildDb.transaction(() => {
    buildDb.prepare('DELETE FROM sa2_cache WHERE dataset = ?').run(SA2_DATASET);
    for (const [sa2, share] of sa2Shares) upsertSa2Cache(sa2, SA2_DATASET, share);
  })();

  const year = new Date().getFullYear();
  const cacheDb = getDb();
  cacheDb.transaction(() => {
    for (const [lgaId, share] of lgaShares) upsertTfNSWCache(LGA_CODE_MAP[lgaId], LGA_DATASET, share, year);
    upsertTfNSWCache(LGA_CODE_MAP.benchmark_gsy, LGA_DATASET, greaterSydney, year);
    upsertTfNSWCache(LGA_CODE_MAP.benchmark_nsw, LGA_DATASET, nsw, year);
  })();
  cacheDb.pragma('wal_checkpoint(TRUNCATE)');

  // ── Report ───────────────────────────────────────────────────────────────
  console.log(`\nWrote ${sa2Shares.size} SA2 rows to build.db sa2_cache (${SA2_DATASET})`);
  console.log(`Wrote ${lgaShares.size} LGA rows + 2 benchmarks to cache.db tfnsw_cache (${LGA_DATASET})`);
  console.log('\nStraight-line catchment shares (percent of persons):');
  for (const id of SPOT_CHECK_LGAS) {
    const share = lgaShares.get(id);
    console.log(`  ${id.padEnd(16)} ${share ? fmt(share) : 'no mesh blocks'}`);
  }
  console.log(`  ${'Greater Sydney'.padEnd(16)} ${fmt(greaterSydney)}  [${LGA_CODE_MAP.benchmark_gsy}, ${gsyParts.length} LGAs]`);
  console.log(`  ${'NSW'.padEnd(16)} ${fmt(nsw)}  [${LGA_CODE_MAP.benchmark_nsw}, ${lgaShares.size} LGAs]`);
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main();
