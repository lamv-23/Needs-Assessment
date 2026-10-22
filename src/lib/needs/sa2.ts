import type {
  DisabilityData, G01Data, HouseholdIncomeData, JourneyToWorkData, LabourData, LanguageData, SEIFAData, VehicleData,
} from '@/lib/abs-fetchers';
import type { CatchmentShare } from '@/lib/catchments';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import { extractIndicators, type IndicatorInputs } from './extract';
import { INDICATORS } from './indicators';
import { rankPhrase } from './insights';
import { assessRecord, needPercentile, needRank, SA2_UNIVERSE_LABEL } from './scoring';
import type {
  AreaAssessment, IndicatorId, IndicatorValue, Sa2Assessed, Sa2NeedsFile, Sa2Ranking, Sa2Record, ScorableRecord,
} from './types';

/**
 * SA2 needs (Phase 2): the SA2 indicators of every NSW SA2, from its decoded Census tables and its straight-line
 * walking catchment (scripts/build-sa2-needs.ts → public/data/sa2-needs.json), scored against the other NSW SA2s,
 * and the SA2s that make up an LGA's drill-down.
 */

/** An SA2 with fewer residents than this is not ranked and is no other SA2's peer: shown as "Low population". */
export const SA2_LOW_POPULATION = 100;

/**
 * The SA2s every SA2 is ranked against, as written after "NSW SA2s" (P2-R21): "No usual address" has more than 100
 * residents but no place on the map, so it is not ranked and "with 100 or more residents" alone would miscount.
 */
export const SA2_RANKED_CRITERIA = `with ${SA2_LOW_POPULATION} or more residents and a place on the map`;

/** An SA2 is in an LGA's drill-down when at least this share of its located residents live in the LGA. */
export const SA2_SHARE_THRESHOLD = 0.1;

/** A pocket of need is an SA2 ranked in this highest-need share of NSW SA2s on its overall score (P2-R15). */
export const SA2_POCKET_SHARE = 0.1;

/** The most pockets of need named for one LGA. */
export const MAX_POCKETS = 3;

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

/**
 * A low-population or non-spatial SA2 keeps its values but has no percentile, rank or score, and no `ranked` count, so
 * nothing can place it "of 623".
 */
function withoutRanking(assessment: AreaAssessment): AreaAssessment {
  return {
    ...assessment,
    indicators: assessment.indicators.map(s => ({
      ...s, percentile: null, rank: null, ranked: null, unranked: false, keyNeed: false,
    })),
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

const rankings = new WeakMap<Sa2NeedsFile, Sa2Ranking>();

/**
 * Every SA2 of `file` assessed (`assessSa2s`) and placed on its overall score among the ranked SA2s that have one:
 * rank 1 is the highest need, ties share the better rank, and the percentile is the mid-rank need percentile. Worked
 * out once per file, as the page, the map, the table and the narrative all read it.
 */
export function rankSa2s(file: Sa2NeedsFile): Sa2Ranking {
  const cached = rankings.get(file);
  if (cached) return cached;

  const assessments = new Map(assessSa2s(file, file.records.map(r => r.sa2Code)).map(a => [a.areaId, a]));
  // An SA2 that is not ranked has no overall score (withoutRanking), so these are the ranked SA2s' scores
  const scores = Array.from(assessments.values()).flatMap(a => (a.overall === null ? [] : [a.overall]));
  const byCode = new Map(file.records.map((record): [string, Sa2Assessed] => {
    const assessment = assessments.get(record.sa2Code)!;
    const { overall } = assessment;
    return [record.sa2Code, {
      record,
      assessment,
      overallRank: overall === null ? null : needRank(overall, scores, 'higher'),
      overallPercentile: overall === null ? null : needPercentile(overall, scores, 'higher'),
    }];
  }));

  const ranking = { byCode, ranked: scores.length, pocketRank: Math.floor(SA2_POCKET_SHARE * scores.length) };
  rankings.set(file, ranking);
  return ranking;
}

/** The drill-down of `lgaIds` (`sa2sForLgas`: each SA2 once, sorted by name), with each SA2's assessment and rank. */
export function drillDownSa2s(file: Sa2NeedsFile, lgaIds: string[]): Sa2Assessed[] {
  const { byCode } = rankSa2s(file);
  return sa2sForLgas(file, lgaIds).map(r => byCode.get(r.sa2Code)!);
}

/** The ranked SA2s of `entries`, highest overall need first; Array.prototype.sort is stable, so ties keep their order. */
const byOverall = (entries: Sa2Assessed[]) => entries
  .filter(e => e.overallRank !== null)
  .sort((a, b) => (a.overallRank as number) - (b.overallRank as number));

/** The `count` SA2s of the drill-down of `lgaIds` with the highest overall need, each once; unranked SA2s left out. */
export function topSa2s(file: Sa2NeedsFile, lgaIds: string[], count: number): Sa2Assessed[] {
  return byOverall(drillDownSa2s(file, lgaIds)).slice(0, count);
}

/**
 * The pockets of need of one LGA: the SA2s of its drill-down ranked in the highest-need 10% of NSW SA2s
 * (rank ≤ floor(10% of the ranked SA2s), so the claim holds by rank, P2-R15), highest first, at most `max`.
 */
export function sa2Pockets(file: Sa2NeedsFile, lgaId: string, max = MAX_POCKETS): Sa2Assessed[] {
  const { pocketRank } = rankSa2s(file);
  return byOverall(drillDownSa2s(file, [lgaId]))
    .filter(e => (e.overallRank as number) <= pocketRank)
    .slice(0, max);
}

/**
 * The LGAs an SA2 is listed for and their shares of its residents, largest first: "Blacktown (71%), Cumberland (29%)".
 * Shares under the drill-down threshold are left out, so the list names the LGAs whose drill-downs show the SA2.
 */
export function lgaShareText(record: Sa2Record, lgaNames: Map<string, string>): string {
  return record.lgaShares
    .filter(s => s.share >= SA2_SHARE_THRESHOLD)
    .map(s => `${lgaNames.get(s.lgaId) ?? s.lgaId} (${Math.round(s.share * 100)}%)`)
    .join(', ');
}

/**
 * Where an SA2's overall score ranks (R57): "ranks in the highest-need 25% of NSW SA2s", or "ranks 3rd of 8 NSW SA2s"
 * with fewer than 20 ranked; null when it is not ranked.
 */
export function sa2RankText(entry: Sa2Assessed, ranking: Pick<Sa2Ranking, 'ranked'>): string | null {
  if (entry.overallRank === null) return null;
  return rankPhrase(
    { rank: entry.overallRank, ranked: ranking.ranked },
    { universeLabel: SA2_UNIVERSE_LABEL, universeSize: ranking.ranked },
  );
}
