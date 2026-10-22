import type { DemographicsData, TransportData, EconomyData, GrowthData } from '@/lib/data/sample-data';

export type NeedDomain = 'transport' | 'socio' | 'growth';

export type IndicatorId =
  | 'car_dependency' | 'zero_car_households' | 'frequent_stop_share' | 'am_peak_departures_per_1000'
  | 'commute_distance_km' | 'crash_rate' | 'seifa_irsd' | 'unemployment_rate' | 'low_income_households'
  | 'needs_assistance' | 'limited_english' | 'older_residents' | 'indigenous_share'
  | 'pop_growth_2041' | 'job_growth_2041' | 'approvals_per_1000';

export type PeerGroup = 'metro_inner' | 'metro_middle' | 'metro_outer' | 'regional_city' | 'regional_town' | 'rural';

export interface SourceRef { short: string; full: string; url?: string }

export interface IndicatorDef {
  id: IndicatorId;
  domain: NeedDomain;
  label: string;
  unit: '%' | 'km' | 'per 1,000' | 'per 10,000' | 'score';
  /** Which value means MORE need. */
  direction: 'higher' | 'lower';
  /** ratio: Σnumerator ÷ Σdenominator × scale; weighted: population-weighted mean. */
  aggregation: 'ratio' | 'weighted';
  /** false = context only: shown with a percentile, excluded from domain/overall scores and key needs. */
  scored: boolean;
  /** 100, 1000 or 10000 for ratios; 1 for weighted. */
  scale: number;
  decimals: number;
  source: SourceRef;
}

/** `value` is null when the source is missing or the denominator is zero; never 0. */
export interface IndicatorValue { value: number | null; numerator?: number; denominator?: number }

export interface LgaIndicatorRecord {
  areaId: string;
  name: string;
  region: string;
  population: number;
  densityPerKm2: number;
  peerGroup: PeerGroup;
  values: Record<IndicatorId, IndicatorValue>;
}

export interface NeedsSnapshot { generatedAt: string; records: LgaIndicatorRecord[] }

export interface LiveBundle {
  demographics: DemographicsData;
  transport: TransportData;
  economy: EconomyData;
  growth: GrowthData;
}
