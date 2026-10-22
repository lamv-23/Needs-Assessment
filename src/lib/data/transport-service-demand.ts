/**
 * Transport service supply and travel demand indicators for an LGA:
 *   - ptFrequency   weekday AM-peak PT service frequency (TfNSW GTFS, tfnsw_cache GTFS_FREQUENCY)
 *   - catchment     residents within a straight-line walk of a serviced stop (tfnsw_cache CATCHMENT_COVERAGE)
 *   - travelSurvey  all-purpose weekday travel (TfNSW Household Travel Survey, bundled hts-lga-data.ts)
 *   - commuteFlows  where residents work / where workers live (ABS Census TableBuilder, bundled jtw-flows-data.ts)
 *
 * Server-side only: reads the SQLite/Postgres cache via the live-data repository.
 */

import { getLiveDataRepository } from '@/lib/repositories';
import type { ERPData } from '@/lib/abs-fetchers';
import type { CatchmentShare } from '@/lib/catchments';
import type { GTFSFrequencyData } from '@/lib/gtfs-frequency';
import { summariseTravelSurvey } from '@/lib/hts-parser';
import { HTS_LGA_DATA } from './hts-lga-data';
import { JTW_FLOWS_DATA, JTW_FLOWS_CENSUS_YEAR } from './jtw-flows-data';
import type { TransportData } from './sample-data';

async function getERP(lgaCode: string): Promise<ERPData | null> {
  const row = await getLiveDataRepository().getABSCacheEntry(lgaCode, 'ERP');
  if (!row) return null;
  try {
    return JSON.parse(row.dataJson) as ERPData;
  } catch {
    return null;
  }
}

export async function getPtFrequency(lgaCode: string): Promise<NonNullable<TransportData['ptFrequency']> | null> {
  const row = await getLiveDataRepository().getTfNSWCacheEntry(lgaCode, 'GTFS_FREQUENCY');
  if (!row) return null;
  let freq: GTFSFrequencyData;
  try {
    freq = JSON.parse(row.dataJson) as GTFSFrequencyData;
  } catch (error) {
    console.error(`Failed to parse cached JSON for TfNSW dataset GTFS_FREQUENCY (${lgaCode}):`, error);
    return null;
  }
  const erp = await getERP(lgaCode);
  const population = erp ? erp.byYear[erp.latestYear] ?? 0 : 0;
  return {
    ...freq,
    departuresPer1000Residents: population > 0
      ? Math.round((freq.amPeakDepartures / population) * 10000) / 10
      : null,
  };
}

/** Straight-line walking catchment shares, written by `npm run build:catchments`; null when the LGA has no row. */
export async function getCatchment(lgaCode: string): Promise<CatchmentShare | null> {
  const row = await getLiveDataRepository().getTfNSWCacheEntry(lgaCode, 'CATCHMENT_COVERAGE');
  if (!row) return null;
  try {
    return JSON.parse(row.dataJson) as CatchmentShare;
  } catch (error) {
    console.error(`Failed to parse cached JSON for TfNSW dataset CATCHMENT_COVERAGE (${lgaCode}):`, error);
    return null;
  }
}

export function getCommuteFlows(lgaCode: string): NonNullable<TransportData['commuteFlows']> | null {
  const flows = JTW_FLOWS_DATA[lgaCode];
  return flows && JTW_FLOWS_CENSUS_YEAR ? { ...flows, censusYear: JTW_FLOWS_CENSUS_YEAR } : null;
}

export async function getTravelSurvey(lgaCode: string): Promise<NonNullable<TransportData['travelSurvey']> | null> {
  const lga = HTS_LGA_DATA[lgaCode];
  if (!lga) return null; // HTS covers the Sydney Greater Metropolitan Area only
  const erp = await getERP(lgaCode);
  return summariseTravelSurvey(lga, erp?.byYear ?? null);
}
