#!/usr/bin/env tsx
/**
 * Build the SA2 needs file: every NSW SA2 (ASGS 2021, 644) with its SA2 indicator values, population, low-population
 * and non-spatial flags, and its LGA shares, for the /needs drill-down.
 *
 *   public/data/sa2-needs.json — Sa2NeedsFile, loaded by the page on demand
 *
 * Inputs (all build-time, data/build.db):
 *   - sa2_cache: the decoded Census tables (G01, G13, G18, G33_INCOME, G34, LABOUR, G62, SEIFA) and the straight-line
 *     walking catchment (CATCHMENT) of each SA2, run through extractSa2Indicators(), i.e. the LGA formulas.
 *   - mesh_blocks: each LGA's share of an SA2's located residents (lgaSharesForSa2), which places an SA2 in the
 *     drill-down of every LGA holding at least 10% of them. SA2s do not nest in LGAs.
 * Names come from SA2_AREAS. SA2s with fewer than 100 residents are flagged lowPopulation; the two special-purpose
 * SA2s with no geometry (areaKm2 0) are flagged nonSpatial (P2-R7). Neither is ranked.
 *
 * The file is written one record per line with non-integer numbers rounded to 4 dp, to stay under 600 KB.
 * data/cache.db is not read or written.
 *
 * Run after `npm run seed:sa2`, `npm run seed:mesh-blocks` and `npm run build:catchments`:  npm run build:sa2-needs
 */

import * as fs from 'fs';
import * as path from 'path';
import { getBuildDb } from '../src/lib/build-db';
import { SA2_AREAS } from '../src/lib/data/sa2-areas';
import { SAMPLE_AREAS } from '../src/lib/data/sample-areas';
import { lgaSharesForSa2 } from '../src/lib/mesh-blocks';
import { INDICATOR_BY_ID } from '../src/lib/needs/indicators';
import {
  assessSa2s, extractSa2Indicators, isRankedSa2, SA2_INDICATOR_IDS, SA2_LOW_POPULATION, sa2sForLgas,
} from '../src/lib/needs/sa2';
import type { G01Data } from '../src/lib/abs-fetchers';
import type { CatchmentShare } from '../src/lib/catchments';
import type { Sa2NeedsFile, Sa2Record } from '../src/lib/needs/types';

const OUTPUT_PATH = path.join(process.cwd(), 'public/data/sa2-needs.json');
const SIZE_TARGET_BYTES = 600 * 1024;
const DECIMALS = 4;
const EXPECTED_SA2S = 644;
/** Spot checks: Mount Druitt - Whalan (QuickStats 22,918 residents), Lord Howe Island (no LGA), Haymarket. */
const SPOT_CHECK_SA2S = ['116031317', '108031161', '117031645'];

/** JSON.stringify replacer: integers pass through; other numbers are rounded to DECIMALS dp. */
const roundNumbers = (_key: string, value: unknown): unknown =>
  typeof value === 'number' && !Number.isInteger(value) ? Number(value.toFixed(DECIMALS)) : value;

function main(): void {
  if (SA2_AREAS.length !== EXPECTED_SA2S) throw new Error(`SA2_AREAS has ${SA2_AREAS.length} SA2s, expected ${EXPECTED_SA2S}`);
  const db = getBuildDb();

  // ── Census tables and catchments, by SA2 ─────────────────────────────────
  const tables = new Map<string, Record<string, unknown>>();
  const rows = db.prepare('SELECT sa2_code, dataset, data_json FROM sa2_cache').all() as
    { sa2_code: string; dataset: string; data_json: string }[];
  for (const row of rows) {
    const cached = tables.get(row.sa2_code) ?? {};
    cached[row.dataset] = JSON.parse(row.data_json);
    tables.set(row.sa2_code, cached);
  }
  if (!rows.some(r => r.dataset === 'G01')) throw new Error('sa2_cache has no G01 rows. Run `npm run seed:sa2` first.');
  if (!rows.some(r => r.dataset === 'CATCHMENT')) {
    throw new Error('sa2_cache has no CATCHMENT rows. Run `npm run build:catchments` first.');
  }

  // ── LGA shares from the located mesh blocks ──────────────────────────────
  const blocks = db.prepare('SELECT sa2_code, lga_id, persons FROM mesh_blocks').all() as
    { sa2_code: string; lga_id: string | null; persons: number }[];
  if (blocks.length === 0) throw new Error('mesh_blocks is empty. Run `npm run seed:mesh-blocks` first.');
  const shares = lgaSharesForSa2(blocks);
  const lgaIds = new Set(SAMPLE_AREAS.filter(a => a.type === 'lga').map(a => a.id));
  const unknownLgas = Array.from(new Set(Array.from(shares.values()).flat().map(s => s.lgaId))).filter(id => !lgaIds.has(id));
  if (unknownLgas.length > 0) throw new Error(`mesh_blocks has LGA ids not in SAMPLE_AREAS: ${unknownLgas.join(', ')}`);

  // ── Records ──────────────────────────────────────────────────────────────
  const records: Sa2Record[] = SA2_AREAS.map(area => {
    const cached = tables.get(area.code) ?? {};
    const population = (cached.G01 as G01Data | undefined)?.totalPopulation ?? 0;
    const lgaShares = shares.get(area.code) ?? [];
    return {
      sa2Code: area.code,
      name: area.name,
      population,
      lowPopulation: population < SA2_LOW_POPULATION,
      nonSpatial: area.areaKm2 === 0,
      primaryLgaId: lgaShares[0]?.lgaId ?? null,
      lgaShares,
      values: extractSa2Indicators(cached),
    };
  });

  // P2-R10: a ranked SA2 must have located residents; only Lord Howe Island (unincorporated) may have no LGA
  const located = (code: string) => ((tables.get(code)?.CATCHMENT as CatchmentShare | undefined)?.persons ?? 0) > 0;
  const unlocated = records.filter(r => isRankedSa2(r) && !located(r.sa2Code)).map(r => r.sa2Code);
  if (unlocated.length > 0) throw new Error(`Ranked SA2s with no located residents: ${unlocated.join(', ')}`);
  const withoutLga = records.filter(r => isRankedSa2(r) && r.lgaShares.length === 0).map(r => `${r.sa2Code} ${r.name}`);

  const file: Sa2NeedsFile = { generatedAt: new Date().toISOString(), records };
  const output = `{"generatedAt":${JSON.stringify(file.generatedAt)},"records":[\n${
    records.map(r => JSON.stringify(r, roundNumbers)).join(',\n')
  }\n]}\n`;
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, output);

  // ── Report ───────────────────────────────────────────────────────────────
  const ranked = records.filter(isRankedSa2);
  console.log(`  ✓ public/data/sa2-needs.json: ${records.length} SA2s`);
  console.log(`    ranked ${ranked.length}, low population (< ${SA2_LOW_POPULATION}) ${records.filter(r => r.lowPopulation).length}, `
    + `non-spatial ${records.filter(r => r.nonSpatial).length} (${records.filter(r => r.nonSpatial).map(r => r.sa2Code).join(', ')}), `
    + `excluded ${records.length - ranked.length}`);
  console.log(`    ranked SA2s with no LGA: ${withoutLga.join('; ') || 'none'}`);
  console.log(`    in an LGA drill-down (share >= 10%): ${sa2sForLgas(file, Array.from(lgaIds)).length}`);

  console.log('\n  Coverage among ranked SA2s (with a value):');
  for (const id of SA2_INDICATOR_IDS) {
    const have = ranked.filter(r => r.values[id]?.value !== null && r.values[id]?.value !== undefined).length;
    console.log(`    ${id.padEnd(30)} ${String(have).padStart(3)}/${ranked.length}`);
  }

  console.log('\n  Spot checks:');
  for (const assessment of assessSa2s(file, SPOT_CHECK_SA2S)) {
    const record = records.find(r => r.sa2Code === assessment.areaId)!;
    const shown = SA2_INDICATOR_IDS.map(id => {
      const value = record.values[id]?.value;
      return `${id}=${value === null || value === undefined ? '-' : value.toFixed(INDICATOR_BY_ID[id].decimals)}`;
    });
    console.log(`    ${record.sa2Code} ${record.name}: population ${record.population}, `
      + `LGAs ${record.lgaShares.map(s => `${s.lgaId} ${(s.share * 100).toFixed(1)}%`).join(', ') || 'none'}, `
      + `overall ${assessment.overall === null ? '-' : assessment.overall.toFixed(1)} (${assessment.band ?? 'no band'})`);
    console.log(`      ${shown.join(' ')}`);
  }

  const bytes = Buffer.byteLength(output);
  console.log(`\n  File size: ${(bytes / 1024).toFixed(1)} KB (target < ${SIZE_TARGET_BYTES / 1024} KB)`);
  if (bytes > SIZE_TARGET_BYTES) console.warn('  ! File exceeds the size target');
}

main();
