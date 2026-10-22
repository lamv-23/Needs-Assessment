import type {
  DisabilityData, G01Data, HouseholdIncomeData, JourneyToWorkData, LabourData, LanguageData, SEIFAData, VehicleData,
} from '@/lib/abs-fetchers';
import type { CatchmentShare } from '@/lib/catchments';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import { extractIndicators, type IndicatorInputs } from './extract';
import { INDICATORS } from './indicators';
import { assessRecord } from './scoring';
import type { AreaAssessment, IndicatorId, IndicatorValue, Sa2NeedsFile, Sa2Record, ScorableRecord } from './types';

/**
 * SA2 needs (Phase 2): the SA2 indicators of every NSW SA2, from its decoded Census tables and its straight-line
 * walking catchment (scripts/build-sa2-needs.ts → public/data/sa2-needs.json), scored against the other NSW SA2s,
 * and the SA2s that make up an LGA's drill-down.
 */

/** An SA2 with fewer residents than this is not ranked and is no other SA2's peer: shown as "Low population". */
export const SA2_LOW_POPULATION = 100;

/** An SA2 is in an LGA's drill-down when at least this share of its located residents live in the LGA. */
export const SA2_SHARE_THRESHOLD = 0.1;

/** The indicators assessed at SA2, in registry order. */
export const SA2_INDICATOR_IDS: IndicatorId[] = INDICATORS.filter(def => def.levels.includes('sa2')).map(def => def.id);

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * The mode shares car dependency is computed from, as an LGA's journeyToWork is made from the same G62 counts
 * (journeyToWorkShares in the server-only live-data.ts): percent of those who travelled to work or worked at home
 * (journeyToWorkBase: all workers less "did not go to work" and "not stated"), to 1 dp. Empty with no base.
 */
function journeyToWork(jtw: JourneyToWorkData | undefined): IndicatorInputs['transport']['journeyToWork'] {
  if (!jtw) return [];
  const base = jtw.total - (jtw.did_not_go_to_work ?? 0) - (jtw.not_stated ?? 0);
  if (!(base > 0)) return [];
  const share = (count: number) => Math.round((count / base) * 1000) / 10;
  return [
    { name: 'Car (driver)', value: share(jtw.car_driver) },
    { name: 'Car (passenger)', value: share(jtw.car_passenger) },
    { name: 'Work from home', value: share(jtw.worked_home) },
  ];
}

/** G01 age codes behind the two age groups older_residents reads, mapped as live-data.ts maps an LGA's. */
const OLDER_AGE_CODES: Record<string, string[]> = { '65-74': ['65_74'], '75+': ['75_84', 'GE85'] };

/**
 * The 65-74 and 75+ age groups. older_residents adds male and female, so the persons are all put under `male`
 * (an LGA's are split by its sex ratio, which sums to the same count). A group with none of its codes is left out.
 */
function olderAgeGroups(g01: G01Data): IndicatorInputs['demographics']['ageDistribution'] {
  return Object.entries(OLDER_AGE_CODES).flatMap(([ageGroup, codes]) => {
    const counts = codes.map(code => g01.ageGroups?.[code]).filter(isNum);
    return counts.length > 0 ? [{ ageGroup, male: counts.reduce((sum, n) => sum + n, 0), female: 0 }] : [];
  });
}

/**
 * The SA2 indicator values from one SA2's decoded tables, keyed by dataset as in data/build.db sa2_cache (G01, G13,
 * G18, G33_INCOME, G34, LABOUR, G62, SEIFA, CATCHMENT). They go through the LGA formulas (extractIndicators) with the
 * guards an LGA's live data applies; where an LGA falls back to bundled figures, an SA2 has no value. A decoded 0
 * with nothing behind it (no labour force, no households) is not data either (P2-R9).
 */
export function extractSa2Indicators(cached: Record<string, unknown>): Partial<Record<IndicatorId, IndicatorValue>> {
  const g01 = cached.G01 as G01Data | undefined;
  const g13 = cached.G13 as LanguageData | undefined;
  const g18 = cached.G18 as DisabilityData | undefined;
  const g33 = cached.G33_INCOME as HouseholdIncomeData | undefined;
  const g34 = cached.G34 as VehicleData | undefined;
  const labour = cached.LABOUR as LabourData | undefined;
  const seifa = cached.SEIFA as SEIFAData | undefined;
  const hasIncome = !!g33 && g33.total > 0;

  const values = extractIndicators({
    demographics: {
      // With no G01 every per-resident ratio has a zero denominator, so it is null
      totalPopulation: g01?.totalPopulation ?? 0,
      ageDistribution: g01 ? olderAgeGroups(g01) : [],
      seifaScore: seifa?.irsd ?? null,
      needsAssistance: g18 && g18.total > 0 ? g18.needsAssistance : undefined,
      limitedEnglish: g13?.limitedEnglish,
      indigenousPopulation: g01?.indigenousPopulation,
    },
    transport: {
      journeyToWork: journeyToWork(cached.G62 as JourneyToWorkData | undefined),
      vehicleOwnershipRaw: g34 && g34.totalDwellings > 0 ? g34 : undefined,
      catchment: cached.CATCHMENT as CatchmentShare | undefined,
      // Not available at SA2
      ptFrequency: undefined,
      commuteDistance2016: undefined,
      crashTrend: [],
    },
    economy: {
      unemploymentRate: labour && (labour.labourForce ?? 0) > 0 ? labour.unemploymentRate : null,
      lowIncomeHouseholds: hasIncome ? g33.lowIncomeHouseholds : undefined,
      householdIncomeDistribution: hasIncome ? g33.incomeRanges : undefined,
    },
    // Not available at SA2
    growth: { populationHistory: [], populationProjections: [], employmentGrowth: [], rollingAnnualApprovals: undefined },
  });
  return Object.fromEntries(SA2_INDICATOR_IDS.map(id => [id, values[id]]));
}

/** Ranked against, and a peer of, the other NSW SA2s: a place on the map and at least 100 residents (P2-R7, spec). */
export const isRankedSa2 = (record: Sa2Record): boolean => !record.lowPopulation && !record.nonSpatial;

const REGION_BY_LGA = new Map(SAMPLE_AREAS.filter(a => a.type === 'lga').map(a => [a.id, a.region ?? '']));

/** Scoring's view of an SA2 (P2-R1): the region of its primary LGA ('' with none), and no peer group. */
function scorable(record: Sa2Record): ScorableRecord {
  return {
    areaId: record.sa2Code,
    name: record.name,
    region: (record.primaryLgaId !== null && REGION_BY_LGA.get(record.primaryLgaId)) || '',
    population: record.population,
    peerGroup: null,
    values: record.values,
  };
}

/** A low-population or non-spatial SA2 keeps its values but has no percentile, rank or score. */
function withoutRanking(assessment: AreaAssessment): AreaAssessment {
  return {
    ...assessment,
    indicators: assessment.indicators.map(s => ({ ...s, percentile: null, rank: null, unranked: false, keyNeed: false })),
    domains: assessment.domains.map(d => ({ ...d, score: null, band: null, available: 0 })),
    overall: null,
    band: null,
  };
}

/**
 * The SA2s in the drill-down of `lgaIds`: those with at least `minShare` of their located residents in one of the
 * LGAs (each SA2 once), sorted by name. Low-population SA2s are included; an SA2 with no located residents in an LGA
 * (the non-spatial SA2s, Lord Howe Island) never is.
 */
export function sa2sForLgas(file: Sa2NeedsFile, lgaIds: string[], minShare = SA2_SHARE_THRESHOLD): Sa2Record[] {
  const wanted = new Set(lgaIds);
  return file.records
    .filter(r => !r.nonSpatial && r.lgaShares.some(s => wanted.has(s.lgaId) && s.share >= minShare))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-AU') || (a.sa2Code < b.sa2Code ? -1 : 1));
}

/**
 * Scores the SA2s of `sa2Codes` (unknown codes dropped, repeats once) on the SA2 indicators against every ranked NSW
 * SA2, so the transport and socio domains only. Low-population and non-spatial SA2s are no one's peer, and their own
 * percentiles, ranks and scores are null.
 */
export function assessSa2s(file: Sa2NeedsFile, sa2Codes: string[]): AreaAssessment[] {
  const peers = file.records.filter(isRankedSa2).map(scorable);
  const byCode = new Map(file.records.map(r => [r.sa2Code, r]));
  return Array.from(new Set(sa2Codes)).flatMap(code => {
    const record = byCode.get(code);
    if (!record) return [];
    const assessment = assessRecord(scorable(record), 'nsw', peers, {}, 'sa2');
    return [isRankedSa2(record) ? assessment : withoutRanking(assessment)];
  });
}
