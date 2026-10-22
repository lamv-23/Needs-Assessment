import type { DemographicsData, TransportData, EconomyData, GrowthData } from '@/lib/data/sample-data';

export type NeedDomain = 'transport' | 'socio' | 'growth';

export type IndicatorId =
  | 'car_dependency' | 'zero_car_households' | 'frequent_stop_share' | 'frequent_service_catchment'
  | 'any_service_catchment' | 'am_peak_departures_per_1000' | 'commute_distance_km' | 'crash_rate' | 'seifa_irsd'
  | 'unemployment_rate' | 'low_income_households' | 'needs_assistance' | 'limited_english' | 'older_residents'
  | 'indigenous_share' | 'pop_growth_2041' | 'job_growth_2041' | 'approvals_per_1000';

/** The geography an indicator is assessed at: LGAs, or SA2s (a subset: no growth indicators exist at SA2). */
export type IndicatorLevel = 'lga' | 'sa2';

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
  /** The levels the indicator is assessed at; an assessment at another level leaves it out. */
  levels: IndicatorLevel[];
  /** 100, 1000 or 10000 for ratios; 1 for weighted. */
  scale: number;
  decimals: number;
  source: SourceRef;
}

/** `value` is null when the source is missing or the denominator is zero; never 0. */
export interface IndicatorValue { value: number | null; numerator?: number; denominator?: number }

/** The time series behind the Part B insights. Missing values are `null` or omitted from an array, never 0. */
export interface InsightSeries {
  /**
   * Car share of commuters who travel to a workplace, (car ÷ (100 − wfh)) × 100, for the Census years that have
   * data. The 2021 point is the car_dependency indicator value; 2011 and 2016 come from the mode share trend.
   */
  carDependencyByYear: { year: 2011 | 2016 | 2021; value: number }[];
  /** Total crashes per year (TfNSW). */
  crashesByYear: { year: number; total: number }[];
  /** Estimated resident population per year (ABS ERP). */
  populationHistory: { year: number; population: number }[];
  population2041: number | null;
  /** Weekday 7-9am departures from all stops in the LGA. */
  amPeakDepartures: number | null;
  /** Residential building approvals: the latest 12 months and the 12 before; null unless 24 consecutive months exist. */
  approvalsLast12: number | null;
  approvalsPrev12: number | null;
  jobs2021: number | null;
  jobs2041: number | null;
}

export interface LgaIndicatorRecord {
  areaId: string;
  name: string;
  region: string;
  population: number;
  densityPerKm2: number;
  peerGroup: PeerGroup;
  values: Record<IndicatorId, IndicatorValue>;
  series: InsightSeries;
}

/** A record that may describe a combined selection or benchmark, which can span several peer groups. */
export type AssessableRecord = Omit<LgaIndicatorRecord, 'peerGroup'> & { peerGroup: PeerGroup | null };

/**
 * What scoring reads of a record (P2-R1): an LGA, a combined selection or benchmark, or an SA2, which has no series,
 * density or peer group and only the SA2 indicators.
 */
export interface ScorableRecord {
  areaId: string;
  name: string;
  region: string;
  population: number;
  peerGroup: PeerGroup | null;
  values: Partial<Record<IndicatorId, IndicatorValue>>;
}

/** Comparison universe: all NSW LGAs, Greater Sydney LGAs, the same region, or the same peer group. */
export type Universe = 'nsw' | 'gsyd' | 'region' | 'peer';

export type NeedBand = 'Very high' | 'High' | 'Moderate' | 'Lower';

export interface IndicatorScore {
  id: IndicatorId;
  value: number | null;
  /**
   * Need percentile 0-100 (100 = most need), unrounded; null when there is no value, or it is `unranked`, or the
   * area is not ranked at all (a low-population or non-spatial SA2).
   */
  percentile: number | null;
  /**
   * Place in need order among the universe LGAs with a value: 1 + the number with more need, so ties share the better
   * rank. An area that is not one of those LGAs (a combined area, a benchmark) takes the place it would have among
   * them. Null when the percentile is.
   */
  rank: number | null;
  /** The universe LGAs with a value, which `rank` is out of; null when the area itself has no value. */
  ranked: number | null;
  /**
   * The area has a value, but fewer than 5 universe LGAs do (`SMALL_GROUP_SIZE`), so it is not ranked (R58): no
   * percentile or rank, and it counts towards no domain or overall score and is never a key need.
   */
  unranked: boolean;
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
  /** Scored indicators with a ranked value (a percentile) / scored indicators in the domain. */
  available: number;
  total: number;
}

export interface AreaAssessment {
  areaId: string;
  name: string;
  region: string;
  population: number;
  /** null for a combined area spanning several peer groups, and for an SA2. */
  peerGroup: PeerGroup | null;
  universe: Universe;
  /** Plural noun phrase used verbatim in sentences ("NSW LGAs", "regional cities", "NSW SA2s"). */
  universeLabel: string;
  universeSize: number;
  /** The universe has fewer than 5 LGAs, so percentiles are coarse. */
  smallGroup: boolean;
  /** The indicators assessed at the area's level, in registry order: all of them for an LGA, the SA2 subset for an SA2. */
  indicators: IndicatorScore[];
  /** The domains with a scored indicator at the area's level, in order: all three for an LGA, no growth for an SA2. */
  domains: DomainScore[];
  overall: number | null;
  band: NeedBand | null;
}

export interface NeedsSnapshot { generatedAt: string; records: LgaIndicatorRecord[] }

/** One NSW SA2 (ASGS 2021) with its SA2 indicator values. */
export interface Sa2Record {
  /** 9-digit ASGS 2021 SA2 code. */
  sa2Code: string;
  name: string;
  /** Census 2021 usual residents (G01). */
  population: number;
  /** Fewer than 100 residents: not ranked and not a peer, shown as "Low population". */
  lowPopulation: boolean;
  /** One of the two special-purpose SA2s with no geometry: not ranked, not a peer and in no LGA (P2-R7). */
  nonSpatial: boolean;
  /** The LGA with the largest share of the SA2's residents; null when no resident is in an LGA (Lord Howe Island). */
  primaryLgaId: string | null;
  /** Each LGA's share of the SA2's located mesh-block residents (Σ = 1), largest first. SA2s do not nest in LGAs. */
  lgaShares: { lgaId: string; share: number }[];
  values: Partial<Record<IndicatorId, IndicatorValue>>;
}

/** public/data/sa2-needs.json: every NSW SA2, sorted by code. */
export interface Sa2NeedsFile { generatedAt: string; records: Sa2Record[] }

/** An SA2 scored against the ranked NSW SA2s, with the place of its overall score among theirs. */
export interface Sa2Assessed {
  record: Sa2Record;
  assessment: AreaAssessment;
  /**
   * 1 + the ranked SA2s with a higher overall score (ties share the better rank); null for an SA2 that is not ranked
   * (low population, non-spatial) or has no overall score.
   */
  overallRank: number | null;
  /** Mid-rank need percentile (0-100, unrounded) of the overall score among the ranked SA2s' scores; null likewise. */
  overallPercentile: number | null;
}

/** Every SA2 of a needs file, ranked on its overall score. */
export interface Sa2Ranking {
  byCode: Map<string, Sa2Assessed>;
  /** The ranked SA2s with an overall score: what an `overallRank` is out of. */
  ranked: number;
  /** The lowest rank in the highest-need 10%: floor(0.1 × ranked) (P2-R15). */
  pocketRank: number;
}

/** A combined selection or a benchmark, rolled up (values and series) from the member LGAs it covers. */
export type AggregatedRecord = AssessableRecord & {
  memberIds: string[];
  /** Weighted (non-additive) indicators with at least one member value: population-weighted means. */
  approximate: IndicatorId[];
  /** Indicators where some, but not all, members have no value. */
  partial: IndicatorId[];
  /** The members each indicator's value is made from (those with a value, and for a ratio both its parts). */
  withData: Record<IndicatorId, number>;
};

/** A cited finding about one assessed area, ranked by severity for the key findings. */
export interface Insight {
  /** Unique within one assessment: kind, area and (for key needs, trends and quadrants) the indicator, metric or chart. */
  id: string;
  /** The assessed area it is about ('combined' for a combined selection). */
  areaId: string;
  kind: 'key_need' | 'mismatch' | 'trend' | 'growth_service' | 'quadrant' | 'jobs_housing';
  /** 0-1; higher is more notable. */
  severity: number;
  text: string;
  citations: SourceRef[];
}

export type NeedsMode = 'separate' | 'combined';

export interface NeedsAssessment {
  mode: NeedsMode;
  /** The universe that was asked for. */
  requestedUniverse: Universe;
  /** The universe actually used. Differs from `requestedUniverse` only when `universeFallback` is true. */
  universe: Universe;
  /** A combined selection asked for a region or peer universe but spans several, so NSW was used instead. */
  universeFallback: boolean;
  /** One per LGA (separate), or exactly one with `areaId` 'combined' (combined); empty when nothing valid is selected. */
  areas: AreaAssessment[];
  memberIds: string[];
  invalidIds: string[];
  benchmarks: { gsyd: AreaAssessment; nsw: AreaAssessment };
  benchmarkRecords: { gsyd: AggregatedRecord; nsw: AggregatedRecord };
  /** The full snapshot, for strip plots and the map. */
  records: LgaIndicatorRecord[];
  generatedAt: string;
}

export interface LiveBundle {
  demographics: DemographicsData;
  transport: TransportData;
  economy: EconomyData;
  growth: GrowthData;
}
