/**
 * Transport service supply and travel demand indicators for an LGA:
 *   - ptFrequency   weekday AM-peak PT service frequency (TfNSW GTFS, tfnsw_cache GTFS_FREQUENCY)
 *   - travelSurvey  all-purpose weekday travel (TfNSW Household Travel Survey, bundled hts-lga-data.ts)
 *
 * Server-side only: reads the SQLite/Postgres cache via the live-data repository.
 */

import { getLiveDataRepository } from '@/lib/repositories';
import type { ERPData } from '@/lib/abs-fetchers';
import type { GTFSFrequencyData } from '@/lib/gtfs-frequency';
import { summariseTravelSurvey } from '@/lib/hts-parser';
import { HTS_LGA_DATA } from './hts-lga-data';
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

export async function getTravelSurvey(lgaCode: string): Promise<NonNullable<TransportData['travelSurvey']> | null> {
  const lga = HTS_LGA_DATA[lgaCode];
  if (!lga) return null; // HTS covers the Sydney Greater Metropolitan Area only
  const erp = await getERP(lgaCode);
  return summariseTravelSurvey(lga, erp?.byYear ?? null);
}
