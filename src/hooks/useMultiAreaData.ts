/**
 * useMultiAreaData — fetches live data for up to 4 areas simultaneously.
 *
 * React hook rules require hooks to always be called the same number of times,
 * so this hook always calls 4 inner SWR hooks, using null keys for inactive slots.
 */
import useSWR from 'swr';
import {
  getDemographicsData,
  getTransportData,
  getEconomyData,
  getHousingData,
  getGrowthData,
} from '@/lib/data/sample-data';
import type {
  LiveDemographicsResult,
  LiveTransportResult,
  LiveEconomyResult,
  LiveHousingResult,
  LiveGrowthResult,
  DataMeta,
} from '@/lib/data/live-data';
import type { Area } from '@/types';

const FALLBACK_AREA = 'lga_sydney';

const bundledMeta: DataMeta = {
  source: 'Bundled official snapshot',
  lastRefreshed: null,
  liveFields: [],
  sampleFields: [],
  hasLiveData: false,
  hasPartialLive: false,
};

interface AreaSlotData {
  demographics: LiveDemographicsResult;
  transport: LiveTransportResult;
  economy: LiveEconomyResult;
  housing: LiveHousingResult;
  growth: LiveGrowthResult;
  hasLiveData: boolean;
  isLoading: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function useAreaSlot(areaId: string | null, year: number): AreaSlotData {
  const id = areaId ?? FALLBACK_AREA;
  const fallbackDemographics = getDemographicsData(id, year);
  const fallbackTransport = getTransportData(id, year);
  const fallbackEconomy = getEconomyData(id, year);
  const fallbackHousing = getHousingData(id, year);
  const fallbackGrowth = getGrowthData(id);

  const { data, isLoading } = useSWR(
    areaId ? `/api/live-data/${encodeURIComponent(areaId)}?year=${year}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  const demographics: LiveDemographicsResult = data?.demographics ?? { data: fallbackDemographics, meta: bundledMeta };
  const transport: LiveTransportResult = data?.transport ?? { data: fallbackTransport, meta: bundledMeta };
  const economy: LiveEconomyResult = data?.economy ?? { data: fallbackEconomy, meta: bundledMeta };
  const housing: LiveHousingResult = data?.housing ?? { data: fallbackHousing, meta: bundledMeta };
  const growth: LiveGrowthResult = data?.growth ?? { data: fallbackGrowth, meta: bundledMeta };

  const hasLiveData =
    demographics.meta.hasLiveData ||
    transport.meta.hasLiveData ||
    economy.meta.hasLiveData ||
    housing.meta.hasLiveData ||
    growth.meta.hasLiveData;

  return {
    demographics,
    transport,
    economy,
    housing,
    growth,
    hasLiveData,
    isLoading: isLoading && !!areaId,
  };
}

export function useMultiAreaData(areas: Area[], year: number): AreaSlotData[] {
  // Always call exactly 4 hooks to satisfy React's rules of hooks.
  // Slots beyond `areas.length` use null keys so SWR skips fetching.
  const slot0 = useAreaSlot(areas[0]?.id ?? null, year);
  const slot1 = useAreaSlot(areas[1]?.id ?? null, year);
  const slot2 = useAreaSlot(areas[2]?.id ?? null, year);
  const slot3 = useAreaSlot(areas[3]?.id ?? null, year);

  return [slot0, slot1, slot2, slot3].slice(0, areas.length);
}
