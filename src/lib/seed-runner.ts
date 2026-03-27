/**
 * Seed runner — used by the admin API route to trigger data refresh.
 * This module is dynamically imported so it only loads when needed.
 * 
 * For full seeding, use the CLI script: npm run seed
 */

import {
  getDb,
  upsertABSCache,
  upsertNSWProjection,
  upsertTransportStatic,
  setConfigValue,
  startRefreshLog,
  completeRefreshLog,
} from './db';
import { fetchAllABSDataForLGA, LGA_CODE_MAP } from './abs-fetchers';
import { nsw_population_projections } from './data/nsw-projections-data';
import { tzp24EmploymentByLGA } from './data/nsw-employment-projections';
import { tfnsw_transport_data } from './data/tfnsw-transport';

export type SeedMode = 'static' | 'abs' | 'all';

export default async function runSeed(mode: SeedMode, lgaId?: string): Promise<void> {
  const db = getDb();
  void db;

  if (mode === 'static' || mode === 'all') {
    await seedStatic();
  }

  if (mode === 'abs' || mode === 'all') {
    await seedABS(lgaId);
  }
}

async function seedStatic(): Promise<void> {
  const db = getDb();

  // NSW population projections
  const popByLGA: Record<string, Array<{ year: number; totalPopulation: number }>> = {};
  for (const row of nsw_population_projections) {
    if (!popByLGA[row.lgaName]) popByLGA[row.lgaName] = [];
    popByLGA[row.lgaName].push({ year: row.year, totalPopulation: row.totalPopulation });
  }

  const stmt = db.prepare(`
    INSERT INTO nsw_projections (lga_name, projection_type, data_json, uploaded_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(lga_name, projection_type) DO UPDATE SET
      data_json = excluded.data_json,
      uploaded_at = excluded.uploaded_at
  `);
  const tx = db.transaction(() => {
    for (const [lgaName, data] of Object.entries(popByLGA)) {
      stmt.run(lgaName, 'population', JSON.stringify(data));
    }
  });
  tx();

  // TZP24 employment projections
  const empByLGA: Record<string, Array<{ year: number; totalEmployed: number }>> = {};
  for (const row of tzp24EmploymentByLGA) {
    if (!empByLGA[row.lgaId]) empByLGA[row.lgaId] = [];
    empByLGA[row.lgaId].push({ year: row.year, totalEmployed: row.totalEmployed });
  }
  const empTx = db.transaction(() => {
    for (const [lgaId, data] of Object.entries(empByLGA)) {
      stmt.run(lgaId, 'employment', JSON.stringify(data));
    }
  });
  empTx();

  // TfNSW transport
  const transportStmt = db.prepare(`
    INSERT INTO transport_static (lga_name, year, data_json, seeded_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(lga_name, year) DO UPDATE SET
      data_json = excluded.data_json,
      seeded_at = excluded.seeded_at
  `);
  const transportTx = db.transaction(() => {
    for (const row of tfnsw_transport_data) {
      const { lgaName, year, ...metrics } = row;
      transportStmt.run(lgaName, year, JSON.stringify(metrics));
    }
  });
  transportTx();

  setConfigValue('static_last_seed', new Date().toISOString());
  console.log('[SeedRunner] Static data seeded');
}

async function seedABS(lgaFilter?: string): Promise<void> {
  const lgasToFetch = lgaFilter
    ? [[lgaFilter, LGA_CODE_MAP[lgaFilter]] as [string, string]].filter(([, code]) => code)
    : Object.entries(LGA_CODE_MAP).filter(([id]) => id !== 'benchmark_gsy');

  const logId = startRefreshLog('abs');
  let success = 0;
  const errors: string[] = [];

  for (const [lgaId, lgaCode] of lgasToFetch) {
    try {
      const data = await fetchAllABSDataForLGA(lgaCode);

      if (data.g01) upsertABSCache(lgaCode, 'G01', data.g01, 2021);
      if (data.g02) upsertABSCache(lgaCode, 'G02', data.g02, 2021);
      if (data.g33) upsertABSCache(lgaCode, 'G33', data.g33, 2021);
      if (data.g36) upsertABSCache(lgaCode, 'G36', data.g36, 2021);
      if (data.g51) upsertABSCache(lgaCode, 'G51', data.g51, 2021);
      if (data.g55) upsertABSCache(lgaCode, 'G55', data.g55, 2021);
      if (data.g46) upsertABSCache(lgaCode, 'G46', data.g46, 2021);
      if (data.g49) upsertABSCache(lgaCode, 'G49', data.g49, 2021);
      if (data.seifa) upsertABSCache(lgaCode, 'SEIFA', data.seifa, 2021);
      if (data.labour) upsertABSCache(lgaCode, 'LABOUR', data.labour, data.labour.dataYear);
      if (data.erp) upsertABSCache(lgaCode, 'ERP', data.erp, data.erp.latestYear);

      success++;
      // Rate limit
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${lgaId}: ${msg}`);
      console.error(`[SeedRunner] ABS error for ${lgaId}:`, msg);
    }
  }

  const status = errors.length === 0 ? 'success' : success > 0 ? 'partial' : 'error';
  completeRefreshLog(logId, status, success, errors.slice(0, 3).join('; '));
  setConfigValue('abs_last_refresh', new Date().toISOString());
  console.log(`[SeedRunner] ABS seed complete: ${success} success, ${errors.length} errors`);
}
