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

/** A record that may describe a combined selection, which can span several peer groups. */
export type AssessableRecord = Omit<LgaIndicatorRecord, 'peerGroup'> & { peerGroup: PeerGroup | null };

/** Comparison universe: all NSW LGAs, Greater Sydney LGAs, the same region, or the same peer group. */
export type Universe = 'nsw' | 'gsyd' | 'region' | 'peer';

export type NeedBand = 'Very high' | 'High' | 'Moderate' | 'Lower';

export interface IndicatorScore {
  id: IndicatorId;
  value: number | null;
  /** Need percentile 0-100 (100 = most need), unrounded; null when there is no value to rank. */
  percentile: number | null;
  /** Scored indicator with a need percentile of 80 or more. */
  keyNeed: boolean;
  /** Combined selection: population-weighted mean of a non-additive indicator. */
  approximate: boolean;
  /** Combined selection: some of the selected LGAs have no value. */
  partial: boolean;
}

export interface DomainScore {
  domain: NeedDomain;
  score: number | null;
  band: NeedBand | null;
  /** Scored indicators with a value / scored indicators in the domain. */
  available: number;
  total: number;
}

export interface AreaAssessment {
  areaId: string;
  name: string;
  region: string;
  population: number;
  /** null for a combined area spanning several peer groups. */
  peerGroup: PeerGroup | null;
  universe: Universe;
  /** Plural noun phrase used verbatim in sentences ("NSW LGAs", "regional cities"). */
  universeLabel: string;
  universeSize: number;
  /** The universe has fewer than 5 LGAs, so percentiles are coarse. */
  smallGroup: boolean;
  indicators: IndicatorScore[];
  domains: DomainScore[];
  overall: number | null;
  band: NeedBand | null;
}

export interface NeedsSnapshot { generatedAt: string; records: LgaIndicatorRecord[] }

export interface LiveBundle {
  demographics: DemographicsData;
  transport: TransportData;
  economy: EconomyData;
  growth: GrowthData;
}
