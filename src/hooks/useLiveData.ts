/**
 * useLiveData hook — fetches from /api/live-data/[areaId]
 * 
 * Returns official data for all domains.
 * Data is pre-cached in SQLite; this hook just calls the API route.
 * Initial render uses a bundled official snapshot immediately.
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

function createBundledMeta(source: string, liveFields: string[], sampleFields: string[] = []): DataMeta {
  return {
    source,
    lastRefreshed: null,
    liveFields,
    sampleFields,
    hasLiveData: true,
  };
}

const bundledDemographicsMeta = createBundledMeta(
  'Bundled official snapshot · ABS Census 2021 + LGA boundaries',
  ['totalPopulation', 'malePopulation', 'femalePopulation', 'medianAge', 'ageDistribution', 'countriesOfBirth', 'householdComposition', 'seifaScore', 'populationDensity', 'birthplaceGroups', 'languageGroups', 'englishOnly', 'limitedEnglish', 'disabilityRate', 'needsAssistance', 'familyComposition']
);

const bundledTransportMeta = createBundledMeta(
  'Bundled official snapshot · ABS Census journey-to-work + TfNSW GTFS coverage',
  ['journeyToWork', 'vehicleOwnership', 'modeShareTrend', 'ptStops', 'ptRoutes'],
  ['avgCommute', 'ptPatronage', 'trafficVolumeTrend', 'crashTrend', 'patronageSource']
);

const bundledEconomyMeta = createBundledMeta(
  'Bundled official snapshot · ABS Census/labour + TfNSW TZP24 employment projections',
  ['employmentByIndustry', 'unemploymentRate', 'participationRate', 'medianWeeklyIncome', 'jobDensity', 'employmentTrend', 'occupationByGroup', 'householdIncomeDistribution', 'lowIncomeHouseholds', 'highIncomeHouseholds']
);

const bundledEducationMeta = createBundledMeta(
  'Bundled official snapshot · ABS Census 2021',
  ['attainment'],
  ['schoolEnrolment', 'qualificationTrend']
);

const bundledHousingMeta = createBundledMeta(
  'Bundled official snapshot · ABS Census 2021',
  ['dwellingTypes', 'tenure', 'medianWeeklyRent'],
  ['medianHousePrice', 'housingTrend', 'mortgageStressRate', 'rentStressRate']
);

const bundledGrowthMeta = createBundledMeta(
  'Bundled official snapshot · NSW DPE population projections + TfNSW TZP24 employment projections',
  ['populationHistory', 'populationProjections', 'employmentGrowth', 'annualGrowthRate', 'projectedGrowthRate'],
  ['buildingApprovals', 'rollingAnnualApprovals']
);

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
  const fallbackDemographics = getDemographicsData(areaId, year);
  const fallbackTransport = getTransportData(areaId, year);
  const fallbackEconomy = getEconomyData(areaId, year);
  const fallbackEducation = getEducationData(areaId, year);
  const fallbackHousing = getHousingData(areaId, year);
  const fallbackGrowth = getGrowthData(areaId);

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
    data: fallbackDemographics,
    meta: bundledDemographicsMeta,
  };
  const transport: LiveTransportResult = data?.transport ?? {
    data: fallbackTransport,
    meta: bundledTransportMeta,
  };
  const economy: LiveEconomyResult = data?.economy ?? {
    data: fallbackEconomy,
    meta: bundledEconomyMeta,
  };
  const education: LiveEducationResult = data?.education ?? {
    data: fallbackEducation,
    meta: bundledEducationMeta,
  };
  const housing: LiveHousingResult = data?.housing ?? {
    data: fallbackHousing,
    meta: bundledHousingMeta,
  };
  const growth: LiveGrowthResult = data?.growth ?? {
    data: fallbackGrowth,
    meta: bundledGrowthMeta,
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
  if (!meta.hasLiveData) return meta.source;
  const date = meta.lastRefreshed
    ? new Date(meta.lastRefreshed).toLocaleDateString('en-AU', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : null;
  return date ? `${meta.source} · Refreshed ${date}` : meta.source;
}
