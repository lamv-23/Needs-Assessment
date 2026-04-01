#!/usr/bin/env tsx
/**
 * Unified database seeding script.
 * 
 * Usage:
 *   npm run seed              — seed static data + fetch all ABS data
 *   npm run seed -- --static  — seed static data only (fast, no network)
 *   npm run seed -- --abs     — fetch ABS data only (slow, network required)
 *   npm run seed -- --lga lga_sydney  — fetch ABS for a single LGA
 * 
 * Run time:
 *   --static: ~5 seconds (reads bundled TS files)
 *   --abs:    ~10-20 minutes (rate-limited API calls for all 37 LGAs)
 */

import {
  getDb,
  upsertNSWProjection,
  upsertTransportStatic,
  upsertABSCache,
  setConfigValue,
  startRefreshLog,
  completeRefreshLog,
  getNSWProjectionCount,
  getABSCacheCount,
} from '../src/lib/db';
import { fetchAllABSDataForLGA, LGA_CODE_MAP } from '../src/lib/abs-fetchers';
import { nsw_population_projections } from '../src/lib/data/nsw-projections-data';
import { tzp24EmploymentByLGA } from '../src/lib/data/nsw-employment-projections';
import { tfnsw_transport_data } from '../src/lib/data/tfnsw-transport';

const args = process.argv.slice(2);
const onlyStatic = args.includes('--static');
const onlyABS = args.includes('--abs');
const singleLGA = args.includes('--lga') ? args[args.indexOf('--lga') + 1] : null;

// ─── Helper ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Seed Static Data ─────────────────────────────────────────────────────────

async function seedStaticData(): Promise<void> {
  console.log('\n📦 Seeding static data...\n');
  const db = getDb();

  // Seed NSW DPE population projections
  console.log('  NSW DPE population projections...');
  const popByLGA: Record<string, Array<{ year: number; totalPopulation: number }>> = {};
  for (const row of nsw_population_projections) {
    if (!popByLGA[row.lgaName]) popByLGA[row.lgaName] = [];
    popByLGA[row.lgaName].push({ year: row.year, totalPopulation: row.totalPopulation });
  }

  const popInsert = db.prepare(`
    INSERT INTO nsw_projections (lga_name, projection_type, data_json, uploaded_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(lga_name, projection_type) DO UPDATE SET
      data_json = excluded.data_json,
      uploaded_at = excluded.uploaded_at
  `);

  const popTransaction = db.transaction(() => {
    for (const [lgaName, data] of Object.entries(popByLGA)) {
      popInsert.run(lgaName, 'population', JSON.stringify(data));
    }
  });
  popTransaction();
  console.log(`    → ${Object.keys(popByLGA).length} LGAs seeded (population projections)`);

  // Seed TZP24 employment projections
  console.log('  TZP24 employment projections...');
  const empByLGA: Record<string, Array<{ year: number; totalEmployed: number }>> = {};
  for (const row of tzp24EmploymentByLGA) {
    const key = row.lgaId;
    if (!empByLGA[key]) empByLGA[key] = [];
    empByLGA[key].push({ year: row.year, totalEmployed: row.totalEmployed });
  }

  // Also index by lgaName for easier lookup
  const empByLGAName: Record<string, { lgaId: string; data: Array<{ year: number; totalEmployed: number }> }> = {};
  for (const row of tzp24EmploymentByLGA) {
    if (!empByLGAName[row.lgaName]) {
      empByLGAName[row.lgaName] = { lgaId: row.lgaId, data: [] };
    }
    empByLGAName[row.lgaName].data.push({ year: row.year, totalEmployed: row.totalEmployed });
  }

  const empTransaction = db.transaction(() => {
    // Store by lgaId
    for (const [lgaId, data] of Object.entries(empByLGA)) {
      popInsert.run(lgaId, 'employment', JSON.stringify(data));
    }
    // Also store by lgaName (TZP24 name) for cross-reference
    for (const [lgaName, { lgaId, data }] of Object.entries(empByLGAName)) {
      popInsert.run(lgaName, 'employment', JSON.stringify({ lgaId, projections: data }));
    }
  });
  empTransaction();
  console.log(`    → ${Object.keys(empByLGA).length} LGAs seeded (employment projections)`);

  // Seed TfNSW transport static data
  console.log('  TfNSW transport metrics (bundled)...');
  const transportInsert = db.prepare(`
    INSERT INTO transport_static (lga_name, year, data_json, seeded_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(lga_name, year) DO UPDATE SET
      data_json = excluded.data_json,
      seeded_at = excluded.seeded_at
  `);

  const transportTransaction = db.transaction(() => {
    for (const row of tfnsw_transport_data) {
      const { lgaName, year, ...metrics } = row;
      transportInsert.run(lgaName, year, JSON.stringify(metrics));
    }
  });
  transportTransaction();
  console.log(`    → ${tfnsw_transport_data.length} transport records seeded`);

  setConfigValue('static_last_seed', new Date().toISOString());

  const totalProjections = getNSWProjectionCount();
  console.log(`\n  ✅ Static data seeded. Total projection records: ${totalProjections}`);
}

// ─── Seed ABS Data ────────────────────────────────────────────────────────────

async function seedABSData(lgaFilter?: string): Promise<void> {
  console.log('\n🌐 Fetching ABS data...\n');

  // Determine which LGAs to fetch
  let lgasToFetch: Array<[string, string]>;

  if (lgaFilter) {
    const code = LGA_CODE_MAP[lgaFilter];
    if (!code) {
      console.error(`Unknown LGA ID: ${lgaFilter}`);
      console.log('Available LGA IDs:', Object.keys(LGA_CODE_MAP).join(', '));
      process.exit(1);
    }
    lgasToFetch = [[lgaFilter, code]];
  } else {
    lgasToFetch = Object.entries(LGA_CODE_MAP)
      .filter(([id]) => id !== 'benchmark_gsy'); // Greater Sydney is a special aggregate
  }

  console.log(`  Fetching ${lgasToFetch.length} LGA(s)...`);

  const logId = startRefreshLog('abs');
  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < lgasToFetch.length; i++) {
    const [lgaId, lgaCode] = lgasToFetch[i];
    console.log(`\n  [${i + 1}/${lgasToFetch.length}] ${lgaId} (code: ${lgaCode})`);

    try {
      const data = await fetchAllABSDataForLGA(lgaCode);

      // Store each dataset that succeeded
      if (data.g01) {
        upsertABSCache(lgaCode, 'G01', data.g01, 2021);
        process.stdout.write('    G01 ✓ ');
      }
      if (data.g02) {
        upsertABSCache(lgaCode, 'G02', data.g02, 2021);
        process.stdout.write('G02 ✓ ');
      }
      if (data.g33) {
        upsertABSCache(lgaCode, 'G33', data.g33, 2021);
        process.stdout.write('G33 ✓ ');
      }
      if (data.g36) {
        upsertABSCache(lgaCode, 'G36', data.g36, 2021);
        process.stdout.write('G36 ✓ ');
      }
      if (data.g51) {
        upsertABSCache(lgaCode, 'G51', data.g51, 2021);
        process.stdout.write('G51 ✓ ');
      }
      if (data.g55) {
        upsertABSCache(lgaCode, 'G55', data.g55, 2021);
        process.stdout.write('G55 ✓ ');
      }
      if (data.g46) {
        upsertABSCache(lgaCode, 'G46', data.g46, 2021);
        process.stdout.write('G46 ✓ ');
      }
      if (data.g49) {
        upsertABSCache(lgaCode, 'G49', data.g49, 2021);
        process.stdout.write('G49 ✓ ');
      }
      if (data.seifa) {
        upsertABSCache(lgaCode, 'SEIFA', data.seifa, 2021);
        process.stdout.write('SEIFA ✓ ');
      }
      if (data.labour) {
        upsertABSCache(lgaCode, 'LABOUR', data.labour, data.labour.dataYear);
        process.stdout.write('LABOUR ✓ ');
      }
      if (data.erp) {
        upsertABSCache(lgaCode, 'ERP', data.erp, data.erp.latestYear);
        process.stdout.write('ERP ✓ ');
      }
      if (data.g34) {
        upsertABSCache(lgaCode, 'G34', data.g34, 2021);
        process.stdout.write('G34 ✓ ');
      }
      if (data.g62) {
        upsertABSCache(lgaCode, 'G62', data.g62, 2021);
        process.stdout.write('G62 ✓ ');
      }
      if (data.g18) {
        upsertABSCache(lgaCode, 'G18', data.g18, 2021);
        process.stdout.write('G18 ✓ ');
      }
      if (data.g33Income) {
        upsertABSCache(lgaCode, 'G33_INCOME', data.g33Income, 2021);
        process.stdout.write('G33_INCOME ✓ ');
      }
      if (data.g13) {
        upsertABSCache(lgaCode, 'G13', data.g13, 2021);
        process.stdout.write('G13 ✓ ');
      }
      if (data.g09) {
        upsertABSCache(lgaCode, 'G09', data.g09, 2021);
        process.stdout.write('G09 ✓ ');
      }
      if (data.g25) {
        upsertABSCache(lgaCode, 'G25', data.g25, 2021);
        process.stdout.write('G25 ✓ ');
      }
      if (data.g60) {
        upsertABSCache(lgaCode, 'G60', data.g60, 2021);
        process.stdout.write('G60 ✓ ');
      }
      if (data.housingStress) {
        upsertABSCache(lgaCode, 'HOUSING_STRESS', data.housingStress, 2021);
        process.stdout.write('HOUSING_STRESS ✓ ');
      }
      if (data.buildingApprovals) {
        upsertABSCache(lgaCode, 'BUILDING_APPROVALS', data.buildingApprovals, 2024);
        process.stdout.write('BUILDING_APPROVALS ✓ ');
      }

      console.log('');
      successCount++;

      // Rate limiting: 1 second between LGAs
      if (i < lgasToFetch.length - 1) {
        await sleep(1000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`    ✗ Error: ${msg}`);
      errors.push(`${lgaId}: ${msg}`);
      errorCount++;
    }
  }

  const status = errorCount === 0 ? 'success' : successCount > 0 ? 'partial' : 'error';
  const errorMsg = errors.length > 0 ? errors.slice(0, 5).join('; ') : undefined;
  completeRefreshLog(logId, status, successCount, errorMsg);

  setConfigValue('abs_last_refresh', new Date().toISOString());

  const totalCached = getABSCacheCount();
  console.log(`\n  ✅ ABS seeding complete.`);
  console.log(`     Success: ${successCount} | Errors: ${errorCount}`);
  console.log(`     Total LGAs in cache: ${totalCached}`);

  if (errors.length > 0) {
    console.log('\n  ⚠️  Errors encountered:');
    errors.forEach(e => console.log(`    - ${e}`));
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 Needs Assessment — Database Seed Script');
  console.log('==========================================');

  // Initialize DB schema
  const db = getDb();
  console.log(`\n  Database: ${process.cwd()}/data/cache.db`);
  void db;

  const runStatic = !onlyABS;
  const runABS = !onlyStatic;

  if (runStatic) {
    await seedStaticData();
  }

  if (runABS) {
    await seedABSData(singleLGA ?? undefined);
  }

  console.log('\n✨ Done!\n');
}

main().catch(err => {
  console.error('\n❌ Seed failed:', err);
  process.exit(1);
});
