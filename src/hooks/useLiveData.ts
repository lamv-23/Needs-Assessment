/**
 * useLiveData hook — fetches from /api/live-data/[areaId]
 * 
 * Returns merged live + sample data for all domains.
 * Data is pre-cached in SQLite; this hook just calls the API route.
 * No loading spinners needed — initial render uses sample data immediately.
 */

import useSWR from 'swr';
import type {
  LiveDemographicsResult,
  LiveTransportResult,
  LiveEconomyResult,
  LiveEducationResult,
  LiveHousingResult,
  LiveGrowthResult,
  DataMeta,
} from '@/lib/data/live-data';
import {
  getDemographicsData,
  getTransportData,
  getEconomyData,
  getEducationData,
  getHousingData,
  getGrowthData,
} from '@/lib/data/sample-data';

export type { DataMeta };

const defaultMeta: DataMeta = {
  source: 'Sample data',
  lastRefreshed: null,
  liveFields: [],
  sampleFields: ['all'],
  hasLiveData: false,
};

interface AllLiveData {
  demographics: LiveDemographicsResult;
  transport: LiveTransportResult;
  economy: LiveEconomyResult;
  education: LiveEducationResult;
  housing: LiveHousingResult;
  growth: LiveGrowthResult;
  isLoading: boolean;
  hasLiveData: boolean;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function useLiveData(areaId: string, year: number): AllLiveData {
  // Sample data as immediate defaults (synchronous)
  const sampleDemographics = getDemographicsData(areaId, year);
  const sampleTransport = getTransportData(areaId, year);
  const sampleEconomy = getEconomyData(areaId, year);
  const sampleEducation = getEducationData(areaId, year);
  const sampleHousing = getHousingData(areaId, year);
  const sampleGrowth = getGrowthData(areaId);

  const { data, isLoading } = useSWR<{
    demographics: LiveDemographicsResult;
    transport: LiveTransportResult;
    economy: LiveEconomyResult;
    education: LiveEducationResult;
    housing: LiveHousingResult;
    growth: LiveGrowthResult;
  }>(
    `/api/live-data/${encodeURIComponent(areaId)}?year=${year}`,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      // Revalidate every hour — matches API route cache
      refreshInterval: 3600 * 1000,
      dedupingInterval: 60 * 1000,
      // Use sample data as fallback until SWR loads
      fallbackData: undefined,
    }
  );

  const demographics: LiveDemographicsResult = data?.demographics ?? {
    data: sampleDemographics,
    meta: defaultMeta,
  };
  const transport: LiveTransportResult = data?.transport ?? {
    data: sampleTransport,
    meta: defaultMeta,
  };
  const economy: LiveEconomyResult = data?.economy ?? {
    data: sampleEconomy,
    meta: defaultMeta,
  };
  const education: LiveEducationResult = data?.education ?? {
    data: sampleEducation,
    meta: defaultMeta,
  };
  const housing: LiveHousingResult = data?.housing ?? {
    data: sampleHousing,
    meta: defaultMeta,
  };
  const growth: LiveGrowthResult = data?.growth ?? {
    data: sampleGrowth,
    meta: defaultMeta,
  };

  const hasLiveData =
    demographics.meta.hasLiveData ||
    transport.meta.hasLiveData ||
    economy.meta.hasLiveData ||
    education.meta.hasLiveData ||
    housing.meta.hasLiveData ||
    growth.meta.hasLiveData;

  return {
    demographics,
    transport,
    economy,
    education,
    housing,
    growth,
    isLoading,
    hasLiveData,
  };
}

/**
 * Format the data source attribution for display.
 * Shows unique sources and last refresh date.
 */
export function formatDataSource(meta: DataMeta): string {
  if (!meta.hasLiveData) return 'Indicative data only';
  const date = meta.lastRefreshed
    ? new Date(meta.lastRefreshed).toLocaleDateString('en-AU', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : null;
  return date ? `${meta.source} · Refreshed ${date}` : meta.source;
}
