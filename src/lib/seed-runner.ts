/**
 * Seed runner — used by the admin API route to trigger data refresh.
 * This module is dynamically imported so it only loads when needed.
 * 
 * For full seeding, use the CLI script: npm run seed
 */

import { fetchAllABSDataForLGA, LGA_CODE_MAP } from './abs-fetchers';
import { nsw_population_projections } from './data/nsw-projections-data';
import { tzp24EmploymentByLGA } from './data/nsw-employment-projections';
import { tfnsw_transport_data } from './data/tfnsw-transport';
import {
  getOperationsRepository,
  getSeedWriteRepository,
} from '@/lib/repositories';
import { logServerError, logServerInfo } from '@/lib/server/logger';

export type SeedMode = 'static' | 'abs' | 'all';

export default async function runSeed(mode: SeedMode, lgaId?: string): Promise<void> {
  if (mode === 'static' || mode === 'all') {
    await seedStatic();
  }

  if (mode === 'abs' || mode === 'all') {
    await seedABS(lgaId);
  }
}

async function seedStatic(): Promise<void> {
  const seedRepository = getSeedWriteRepository();
  const operationsRepository = getOperationsRepository();

  // NSW population projections
  const popByLGA: Record<string, Array<{ year: number; totalPopulation: number }>> = {};
  for (const row of nsw_population_projections) {
    if (!popByLGA[row.lgaName]) popByLGA[row.lgaName] = [];
    popByLGA[row.lgaName].push({ year: row.year, totalPopulation: row.totalPopulation });
  }
  for (const [lgaName, data] of Object.entries(popByLGA)) {
    await seedRepository.upsertNSWProjection(lgaName, 'population', data);
  }

  // TZP24 employment projections
  const empByLGA: Record<string, Array<{ year: number; totalEmployed: number }>> = {};
  for (const row of tzp24EmploymentByLGA) {
    if (!empByLGA[row.lgaId]) empByLGA[row.lgaId] = [];
    empByLGA[row.lgaId].push({ year: row.year, totalEmployed: row.totalEmployed });
  }
  for (const [lgaId, data] of Object.entries(empByLGA)) {
    await seedRepository.upsertNSWProjection(lgaId, 'employment', data);
  }

  // TfNSW transport
  for (const row of tfnsw_transport_data) {
    const { lgaName, year, ...metrics } = row;
    await seedRepository.upsertTransportStatic(lgaName, year, metrics);
  }

  await operationsRepository.setConfigValue('static_last_seed', new Date().toISOString());
  await operationsRepository.setConfigValue('tfnsw_last_refresh', new Date().toISOString());
  logServerInfo('seed_static_completed', {
    populationProjectionCount: Object.keys(popByLGA).length,
    employmentProjectionCount: Object.keys(empByLGA).length,
    transportRowCount: tfnsw_transport_data.length,
  });
}

async function seedABS(lgaFilter?: string): Promise<void> {
  const seedRepository = getSeedWriteRepository();
  const operationsRepository = getOperationsRepository();
  const lgasToFetch = lgaFilter
    ? [[lgaFilter, LGA_CODE_MAP[lgaFilter]] as [string, string]].filter(([, code]) => code)
    : Object.entries(LGA_CODE_MAP).filter(([id]) => id !== 'benchmark_gsy');

  const logId = await operationsRepository.startRefreshLog('abs');
  let success = 0;
  const errors: string[] = [];

  for (const [lgaId, lgaCode] of lgasToFetch) {
    try {
      const data = await fetchAllABSDataForLGA(lgaCode);

      if (data.g01) await seedRepository.upsertABSCache(lgaCode, 'G01', data.g01, 2021);
      if (data.g02) await seedRepository.upsertABSCache(lgaCode, 'G02', data.g02, 2021);
      if (data.g33) await seedRepository.upsertABSCache(lgaCode, 'G33', data.g33, 2021);
      if (data.b31_2011) await seedRepository.upsertABSCache(lgaCode, 'B31_2011', data.b31_2011, 2011);
      if (data.g36) await seedRepository.upsertABSCache(lgaCode, 'G36', data.g36, 2021);
      if (data.g51) await seedRepository.upsertABSCache(lgaCode, 'G51', data.g51, 2021);
      // G55 is permanently stubbed (no ABS SDMX endpoint); G62 is used for JTW data instead
      if (data.g46) await seedRepository.upsertABSCache(lgaCode, 'G46', data.g46, 2021);
      if (data.g15) await seedRepository.upsertABSCache(lgaCode, 'G15', data.g15, 2021);
      if (data.g49) await seedRepository.upsertABSCache(lgaCode, 'G49', data.g49, 2021);
      if (data.g49_2016) await seedRepository.upsertABSCache(lgaCode, 'G49_2016', data.g49_2016, 2016);
      if (data.seifa) await seedRepository.upsertABSCache(lgaCode, 'SEIFA', data.seifa, 2021);
      if (data.labour) await seedRepository.upsertABSCache(lgaCode, 'LABOUR', data.labour, data.labour.dataYear);
      if (data.erp) await seedRepository.upsertABSCache(lgaCode, 'ERP', data.erp, data.erp.latestYear);
      // New datasets
      if (data.g34) await seedRepository.upsertABSCache(lgaCode, 'G34', data.g34, 2021);
      if (data.g62) await seedRepository.upsertABSCache(lgaCode, 'G62', data.g62, 2021);
      if (data.g18) await seedRepository.upsertABSCache(lgaCode, 'G18', data.g18, 2021);
      if (data.g33Income) await seedRepository.upsertABSCache(lgaCode, 'G33_INCOME', data.g33Income, 2021);
      if (data.g13) await seedRepository.upsertABSCache(lgaCode, 'G13', data.g13, 2021);
      if (data.g09) await seedRepository.upsertABSCache(lgaCode, 'G09', data.g09, 2021);
      if (data.g25) await seedRepository.upsertABSCache(lgaCode, 'G25', data.g25, 2021);
      if (data.g60) await seedRepository.upsertABSCache(lgaCode, 'G60', data.g60, 2021);
      if (data.housingStress) await seedRepository.upsertABSCache(lgaCode, 'HOUSING_STRESS', data.housingStress, 2021);
      if (data.buildingApprovals) await seedRepository.upsertABSCache(lgaCode, 'BUILDING_APPROVALS', data.buildingApprovals, 2024);

      success++;
      // Rate limit
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${lgaId}: ${msg}`);
      logServerError('seed_abs_lga_failed', { lgaId, error: msg });
    }
  }

  const status = errors.length === 0 ? 'success' : success > 0 ? 'partial' : 'error';
  await operationsRepository.completeRefreshLog(logId, status, success, errors.slice(0, 3).join('; '));
  await operationsRepository.setConfigValue('abs_last_refresh', new Date().toISOString());
  logServerInfo('seed_abs_completed', {
    lgaFilter: lgaFilter ?? null,
    successCount: success,
    errorCount: errors.length,
    status,
  });
}
