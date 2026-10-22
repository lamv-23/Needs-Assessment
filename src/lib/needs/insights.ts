import { aggregateRecords } from './aggregate';
import { groupWithData } from './coverage';
import { populationNearest } from './extract';
import { formatDiff, formatSignedDiff, formatValue, inSentence, ordinal, possessive } from './format';
import { INDICATOR_BY_ID, SOURCES } from './indicators';
import { settingOf } from './peer-groups';
import { areaQuadrantInsights } from './project-need';
import { universeRecords } from './scoring';
import type {
  AggregatedRecord, AreaAssessment, AssessableRecord, IndicatorDef, IndicatorId, IndicatorScore, Insight,
  InsightSeries, LgaIndicatorRecord, NeedsAssessment, SourceRef,
} from './types';

export interface LinearFit {
  intercept: number;
  slope: number;
  r2: number;
  /** Standard error of the regression, √(SSE ÷ (n − 2)). */
  residualSd: number;
  n: number;
  predictor: 'frequent_stop_share' | 'ln_population';
  setting: 'metro' | 'non_metro';
}

export interface MismatchResult {
  areaId: string;
  actual: number;
  /** The record's value of the model's predictor; a combined area's is its members' population-weighted mean. */
  x: number;
  expected: number;
  /** actual − expected, in percentage points. */
  residual: number;
  /** residual ÷ the model's residual SD. */
  z: number;
  fit: LinearFit;
  /** The model is strong enough to show: n ≥ 20 and R² ≥ 0.3. */
  usable: boolean;
}

export interface TrendResult {
  areaId: string;
  metric: 'car_dependency' | 'crash_rate' | 'population_growth' | 'approvals';
  from: { label: string; value: number };
  to: { label: string; value: number };
  /** to − from. */
  change: number;
  /** Median change across the universe LGAs measured over the same endpoints; null when none are. */
  universeMedianChange: number | null;
  /** The universe LGAs measured over the same endpoints, which the median is over. */
  universeMeasured: number;
}

export interface GrowthServiceResult {
  areaId: string;
  per1000Now: number;
  per1000In2041: number;
  extraDeparturesNeeded: number;
}

export interface JobsHousingResult { areaId: string; jobsPerResident2021: number; jobsPerResident2041: number }

type Setting = LinearFit['setting'];
type TrendMetric = TrendResult['metric'];
/** One LGA, or a combined selection with its members' series rolled up. */
export type SeriesRecord = LgaIndicatorRecord | AggregatedRecord;

// A mismatch model is shown only with enough LGAs and a strong enough fit (spec).
const MIN_MODEL_N = 20;
const MIN_MODEL_R2 = 0.3;
/** A residual of at least this many residual SDs is flagged, and only a flagged one is an insight (R41). */
export const MISMATCH_FLAG_Z = 1;
/** Actual and projected population growth this close (percentage points a year) are "in line". */
const IN_LINE_PP = 0.1;
export const BASE_YEAR = 2021;
export const PROJECTION_YEAR = 2041;

export const WFH_CAVEAT =
  "The 2021 Census was held during Sydney's COVID-19 lockdown, which inflated working from home. "
  + 'Car dependency is therefore measured as a share of people who travelled to work.';

/** Cited with every car dependency trend, whose 2021 values are lockdown-affected. */
export const WFH_CAVEAT_CITATION: SourceRef = { short: '2021 Census lockdown caveat', full: WFH_CAVEAT };

/** The journey to work table each Census year of car dependency comes from (R59). */
export const CAR_DEPENDENCY_SOURCES: Record<2011 | 2016 | 2021, SourceRef> = {
  2011: SOURCES.b46,
  2016: SOURCES.g59,
  2021: SOURCES.g62,
};

/** The Census tables behind car dependency in `years`, in year order. */
export function carDependencySources(years: number[]): SourceRef[] {
  return ([2011, 2016, 2021] as const).filter(year => years.includes(year)).map(year => CAR_DEPENDENCY_SOURCES[year]);
}

const CAR = INDICATOR_BY_ID.car_dependency;
const DEPARTURES = INDICATOR_BY_ID.am_peak_departures_per_1000;

// Expected car dependency

/**
 * Ordinary least squares of y on x. R² is 1 − SSE ÷ SST and the residual SD uses n − 2 degrees of
 * freedom. Degenerate inputs give finite numbers: no x spread → slope 0; no y spread → R² 0; n ≤ 2 → residual SD 0.
 */
export function fitLinear(points: { x: number; y: number }[]): Omit<LinearFit, 'predictor' | 'setting'> {
  const n = points.length;
  if (n === 0) return { intercept: 0, slope: 0, r2: 0, residualSd: 0, n };
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.x - meanX) ** 2;
    sxy += (p.x - meanX) * (p.y - meanY);
    syy += (p.y - meanY) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = meanY - slope * meanX;
  const sse = points.reduce((sum, p) => sum + (p.y - intercept - slope * p.x) ** 2, 0);
  return {
    intercept,
    slope,
    r2: syy > 0 ? 1 - sse / syy : 0,
    residualSd: n > 2 ? Math.sqrt(sse / (n - 2)) : 0,
    n,
  };
}


const carDependencyOf = (record: AssessableRecord): number | null => record.values.car_dependency?.value ?? null;

/** Frequent-stop share in Sydney; outside it service explains almost nothing (R² 0.02), so ln(population). */
export function predictorOf(record: AssessableRecord, setting: Setting): number | null {
  if (setting === 'metro') return record.values.frequent_stop_share?.value ?? null;
  return record.population > 0 ? Math.log(record.population) : null;
}

/** Car dependency against its setting's predictor, over the setting's LGAs that have both values. */
export function expectedCarDependencyModel(records: LgaIndicatorRecord[], setting: Setting): LinearFit {
  const points = records
    .filter(r => settingOf(r.areaId) === setting)
    .flatMap(r => {
      const x = predictorOf(r, setting);
      const y = carDependencyOf(r);
      return x !== null && y !== null ? [{ x, y }] : [];
    });
  return { ...fitLinear(points), predictor: setting === 'metro' ? 'frequent_stop_share' : 'ln_population', setting };
}

const isAggregate = (record: AssessableRecord): record is AggregatedRecord => 'memberIds' in record;

/** The LGAs behind a record's car dependency: itself, or an aggregate's members that have a value (null if one is unknown). */
function carDependencyMembers(record: AssessableRecord, records: LgaIndicatorRecord[]): AssessableRecord[] | null {
  if (!isAggregate(record)) return [record];
  const byId = new Map(records.map(r => [r.areaId, r]));
  const members = record.memberIds.map(id => byId.get(id));
  if (members.some(m => m === undefined)) return null;
  return (members as LgaIndicatorRecord[]).filter(m => carDependencyOf(m) !== null);
}

/**
 * Actual against expected car dependency, from the model of the record's setting. A combined area's expected
 * value is the population-weighted mean of its members' expected values, the weighting of its car dependency;
 * one spanning metropolitan and non-metropolitan LGAs has no single model. Null in that case, and when the
 * record (or a member with car dependency) has no value or no predictor.
 */
export function carDependencyMismatch(record: AssessableRecord, records: LgaIndicatorRecord[]): MismatchResult | null {
  const actual = carDependencyOf(record);
  if (actual === null) return null;
  const members = carDependencyMembers(record, records);
  if (members === null || members.length === 0) return null;
  const setting = settingOf(members[0].areaId);
  if (members.some(m => settingOf(m.areaId) !== setting)) return null;
  const predictors = members.map(m => predictorOf(m, setting));
  if (predictors.some(x => x === null)) return null;

  const fit = expectedCarDependencyModel(records, setting);
  const expectedFor = (x: number) => fit.intercept + fit.slope * x;
  const weight = members.reduce((sum, m) => sum + m.population, 0);
  const expected = members.length === 1
    ? expectedFor(predictors[0]!)
    : members.reduce((sum, m, i) => sum + expectedFor(predictors[i]!) * m.population, 0) / weight;
  if (!Number.isFinite(expected)) return null;
  // The model is linear, so the weighted mean of the members' expected values is the model at their weighted mean x.
  const x = members.length === 1
    ? predictors[0]!
    : members.reduce((sum, m, i) => sum + predictors[i]! * m.population, 0) / weight;

  const residual = actual - expected;
  return {
    areaId: record.areaId,
    actual,
    x,
    expected,
    residual,
    z: fit.residualSd > 0 ? residual / fit.residualSd : 0,
    fit,
    usable: fit.n >= MIN_MODEL_N && fit.r2 >= MIN_MODEL_R2,
  };
}

// Trends

interface TrendWindow { from: TrendResult['from']; to: TrendResult['to'] }
/** A record's trend over fixed endpoints; null when it lacks either. */
type Measure = (record: SeriesRecord) => TrendWindow | null;

const TREND_METRICS: TrendMetric[] = ['car_dependency', 'crash_rate', 'population_growth', 'approvals'];

export function populationIn(series: InsightSeries, year: number): number | null {
  const point = series.populationHistory.find(p => p.year === year && p.population > 0);
  return point ? point.population : null;
}

export function latestPopulation(series: InsightSeries): { year: number; population: number } | null {
  return series.populationHistory
    .filter(p => p.population > 0)
    .reduce<{ year: number; population: number } | null>((best, p) => (!best || p.year > best.year ? p : best), null);
}

/**
 * Crashes per 10,000 residents in `year`, on that year's ERP (the nearest year when it has none), as the
 * crash_rate indicator; null without a crash count for the year or any ERP.
 */
export function crashRate(series: InsightSeries, year: number): number | null {
  const crashes = series.crashesByYear.find(c => c.year === year)?.total;
  const population = populationNearest(series.populationHistory, year);
  return crashes === undefined || population === null ? null : (crashes * 10000) / population;
}

/** Compound annual growth in % a year. */
const annualGrowth = (from: number, to: number, years: number): number => (Math.pow(to / from, 1 / years) - 1) * 100;

/**
 * Per metric: given the subject, how to measure any record over the subject's endpoints (so the universe is
 * compared over the same years), or null when the subject has no trend. Crash and approval rates use their
 * indicators' denominators (ERP of each crash year; the Census population for approvals), so the latest value
 * matches the indicator.
 */
const MEASURES: Record<TrendMetric, (subject: SeriesRecord) => Measure | null> = {
  car_dependency: subject => {
    const years: number[] = subject.series.carDependencyByYear.map(p => p.year);
    const from = [2011, 2016].find(year => years.includes(year));
    if (from === undefined || !years.includes(2021)) return null;
    return record => {
      const at = (year: number) => record.series.carDependencyByYear.find(p => p.year === year)?.value;
      const [start, end] = [at(from), at(2021)];
      return start === undefined || end === undefined
        ? null
        : { from: { label: String(from), value: start }, to: { label: '2021', value: end } };
    };
  },
  crash_rate: subject => {
    const years = subject.series.crashesByYear.map(c => c.year);
    if (years.length < 2) return null;
    const [from, to] = [Math.min(...years), Math.max(...years)];
    return record => {
      const [start, end] = [crashRate(record.series, from), crashRate(record.series, to)];
      return start === null || end === null
        ? null
        : { from: { label: String(from), value: start }, to: { label: String(to), value: end } };
    };
  },
  // R39: actual annual growth from 2021 to the latest ERP year, against the DPE projection for 2021-2041
  population_growth: subject => {
    const latest = latestPopulation(subject.series);
    if (!latest || latest.year <= BASE_YEAR) return null;
    return record => {
      const base = populationIn(record.series, BASE_YEAR);
      const now = populationIn(record.series, latest.year);
      const projected = record.series.population2041;
      if (base === null || now === null || projected === null || !(projected > 0)) return null;
      return {
        from: { label: `${BASE_YEAR}–${latest.year} actual`, value: annualGrowth(base, now, latest.year - BASE_YEAR) },
        to: {
          label: `${BASE_YEAR}–${PROJECTION_YEAR} projected`,
          value: annualGrowth(base, projected, PROJECTION_YEAR - BASE_YEAR),
        },
      };
    };
  },
  approvals: () => record => {
    const { approvalsLast12: last, approvalsPrev12: previous } = record.series;
    if (last === null || previous === null || !(record.population > 0)) return null;
    const per1000 = (approvals: number) => (approvals * 1000) / record.population;
    return {
      from: { label: 'previous 12 months', value: per1000(previous) },
      to: { label: 'last 12 months', value: per1000(last) },
    };
  },
};

/** The p-th quantile (0-1), interpolating between order statistics. `values` must not be empty. */
function quantile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const h = (sorted.length - 1) * p;
  const lower = Math.floor(h);
  return lower + 1 < sorted.length ? sorted[lower] + (h - lower) * (sorted[lower + 1] - sorted[lower]) : sorted[lower];
}

const changeIn = (window: TrendWindow): number => window.to.value - window.from.value;

/** Each trend with the interquartile range of the universe's changes, which scales its severity. */
function trendsWithSpread(record: SeriesRecord, universe: LgaIndicatorRecord[]): { trend: TrendResult; iqr: number | null }[] {
  return TREND_METRICS.flatMap(metric => {
    const measure = MEASURES[metric](record);
    const own = measure?.(record) ?? null;
    if (!measure || !own) return [];
    const changes = universe.map(measure).filter((w): w is TrendWindow => w !== null).map(changeIn);
    const trend: TrendResult = {
      areaId: record.areaId,
      metric,
      from: own.from,
      to: own.to,
      change: changeIn(own),
      universeMedianChange: changes.length > 0 ? quantile(changes, 0.5) : null,
      universeMeasured: changes.length,
    };
    return [{ trend, iqr: changes.length > 0 ? quantile(changes, 0.75) - quantile(changes, 0.25) : null }];
  });
}

/**
 * Car dependency (earliest of 2011/2016 → 2021), crashes per 10,000 residents (first → last year), population
 * growth (R39) and dwelling approvals per 1,000 residents (previous → last 12 months), each with the median
 * change across `universe` over the same endpoints. Metrics without both endpoints are left out.
 */
export function trends(record: SeriesRecord, universe: LgaIndicatorRecord[]): TrendResult[] {
  return trendsWithSpread(record, universe).map(t => t.trend);
}

// Growth against service, jobs-housing balance

/**
 * AM-peak departures per 1,000 residents today (the latest ERP year, as for am_peak_departures_per_1000) and in
 * 2041 at today's service, with the extra departures needed to hold today's rate. Null without departures, an
 * ERP figure or a 2041 projection.
 */
export function growthVsService(record: SeriesRecord): GrowthServiceResult | null {
  const { amPeakDepartures, population2041 } = record.series;
  const latest = latestPopulation(record.series);
  if (amPeakDepartures === null || !(amPeakDepartures > 0) || !latest || population2041 === null || !(population2041 > 0)) {
    return null;
  }
  return {
    areaId: record.areaId,
    per1000Now: (amPeakDepartures * 1000) / latest.population,
    per1000In2041: (amPeakDepartures * 1000) / population2041,
    extraDeparturesNeeded: amPeakDepartures * (population2041 / latest.population - 1),
  };
}

/** TZP24 jobs per resident: 2021 jobs ÷ 2021 ERP, and 2041 jobs ÷ the 2041 projection. Null without all four. */
export function jobsHousing(record: SeriesRecord): JobsHousingResult | null {
  const { jobs2021, jobs2041, population2041 } = record.series;
  const base = populationIn(record.series, BASE_YEAR);
  if (jobs2021 === null || jobs2041 === null || base === null || population2041 === null || !(population2041 > 0)) {
    return null;
  }
  return { areaId: record.areaId, jobsPerResident2021: jobs2021 / base, jobsPerResident2041: jobs2041 / population2041 };
}

// Sentences

/** How sentences name an area: by name, or "the combined area" for two or more LGAs combined. */
interface Subject { start: string; mid: string; owner: string }

function subjectFor(area: AreaAssessment, combined: boolean): Subject {
  return combined
    ? { start: 'The combined area', mid: 'the combined area', owner: "The combined area's" }
    : { start: area.name, mid: area.name, owner: possessive(area.name) };
}

/** With fewer LGAs ranked than this, a rank reads as "1st of 8", not as a share ("the highest-need 13%"). */
export const ORDINAL_RANK_BELOW = 20;

/** An indicator value with its place in need order (`IndicatorScore.rank` of `ranked`). */
export interface RankedValue { id: IndicatorId; value: number; rank: number; ranked: number }

/**
 * Where a value ranks (R57): "ranks 1st of 8 {universeLabel}" when fewer than 20 LGAs are ranked, otherwise
 * "ranks in the highest-need k% of {universeLabel}" with k = ceil(100 × rank ÷ ranked), the true share of the group
 * at or above it. When only some of the group's LGAs have a value, the group is "the {ranked} {universeLabel} with
 * data" (R58): "ranks 3rd of the 7 LGAs in the Far West region with data".
 */
export function rankPhrase(
  { rank, ranked }: Pick<RankedValue, 'rank' | 'ranked'>,
  { universeLabel, universeSize }: Pick<AreaAssessment, 'universeLabel' | 'universeSize'>,
): string {
  const group = groupWithData(universeLabel, ranked, universeSize);
  if (ranked >= ORDINAL_RANK_BELOW) return `ranks in the highest-need ${Math.ceil((100 * rank) / ranked)}% of ${group}`;
  return `ranks ${ordinal(rank)} of ${ranked < universeSize ? group : `${ranked} ${universeLabel}`}`;
}

/**
 * "On {label}, {subject} ({value}) {rank phrase}, {diff} {above|below} the Greater Sydney figure of {gs}." (R19,
 * R57). The Greater Sydney clause is left out when that figure is null.
 */
export function keyNeedText(
  subject: string,
  need: RankedValue,
  group: Pick<AreaAssessment, 'universeLabel' | 'universeSize'>,
  greaterSydney: number | null,
): string {
  const def = INDICATOR_BY_ID[need.id];
  let text = `On ${inSentence(def.label)}, ${subject} (${formatValue(def, need.value)}) ${rankPhrase(need, group)}`;
  if (greaterSydney !== null) {
    const diff = need.value - greaterSydney;
    const figure = `the Greater Sydney figure of ${formatValue(def, greaterSydney)}`;
    // A difference that rounds to zero is not "above" or "below" anything.
    text += Number(Math.abs(diff).toFixed(def.decimals)) === 0
      ? `, level with ${figure}`
      : `, ${formatDiff(def, Math.abs(diff))} ${diff > 0 ? 'above' : 'below'} ${figure}`;
  }
  return `${text}.`;
}

const MODEL_WORDING: Record<Setting, { basis: string; group: string; source: SourceRef }> = {
  metro: { basis: 'for its level of frequent public transport service', group: 'metropolitan LGAs', source: SOURCES.gtfs },
  non_metro: { basis: 'for an LGA of its population size', group: 'non-metropolitan LGAs', source: SOURCES.g01 },
};

function mismatchText(subject: Subject, m: MismatchResult): string {
  const { basis, group } = MODEL_WORDING[m.fit.setting];
  return `${subject.owner} car dependency (${formatValue(CAR, m.actual)}) is ${formatDiff(CAR, Math.abs(m.residual))} `
    + `${m.residual > 0 ? 'higher' : 'lower'} than expected ${basis} `
    + `(model across ${m.fit.n} ${group}, R² ${m.fit.r2.toFixed(2)}).`;
}

interface RateWording {
  label: string;
  def: IndicatorDef;
  /** The sources of a trend's two endpoints. */
  citations: (trend: TrendResult) => SourceRef[];
  /** An endpoint label as it reads after "between" or "and": years as they are, "the last 12 months". */
  period: (label: string) => string;
}

const asIs = (label: string) => label;

const TREND_WORDING: Record<Exclude<TrendMetric, 'population_growth'>, RateWording> = {
  // R59: the 2011 or 2016 value comes from that Census's own table
  car_dependency: {
    label: 'car dependency',
    def: CAR,
    citations: trend => [...carDependencySources([Number(trend.from.label), Number(trend.to.label)]), WFH_CAVEAT_CITATION],
    period: asIs,
  },
  crash_rate: {
    label: 'road crashes per 10,000 residents',
    def: INDICATOR_BY_ID.crash_rate,
    citations: () => [SOURCES.crashes],
    period: asIs,
  },
  approvals: {
    label: 'dwelling approvals per 1,000 residents',
    def: INDICATOR_BY_ID.approvals_per_1000,
    citations: () => [SOURCES.buildingApprovals],
    period: label => `the ${label}`,
  },
};

const POPULATION_CITATIONS = [SOURCES.erp, SOURCES.populationProjections];

/**
 * "{Owner} {label} changed from {from} ({fromLabel}) to {to} ({toLabel}), {comparison}.", or, when the two values
 * show the same, "{Owner} {label} stayed at {to} between {fromLabel} and {toLabel}, {comparison}." (R47).
 * The comparison states the median change with its sign, or "no median change" when it shows as zero (R43), across
 * the group, or "the {n} {group} with data" when only some of its LGAs are measured (R58).
 */
function trendText(
  subject: Subject,
  trend: TrendResult,
  { label, def, period }: RateWording,
  median: number,
  group: Pick<AreaAssessment, 'universeLabel' | 'universeSize'>,
): string {
  const universeLabel = groupWithData(group.universeLabel, trend.universeMeasured, group.universeSize);
  const signedMedian = formatSignedDiff(def, median);
  const comparison = signedMedian === null
    ? `compared with no median change across ${universeLabel}`
    : `compared with a median change of ${signedMedian} across ${universeLabel}`;
  const [from, to] = [formatValue(def, trend.from.value), formatValue(def, trend.to.value)];
  return from === to
    ? `${subject.owner} ${label} stayed at ${to} between ${period(trend.from.label)} and ${period(trend.to.label)}, `
      + `${comparison}.`
    : `${subject.owner} ${label} changed from ${from} (${trend.from.label}) to ${to} (${trend.to.label}), ${comparison}.`;
}

/**
 * R39: "{Name}'s population grew by {a}% a year between 2021 and {latestYear}, {faster than|slower than|in line
 * with} the {p}% a year projected for 2021–2041", in line when |a − p| < 0.1. A falling population "fell by" its
 * rate (never "grew by" a negative one); when only one of the two falls, the projection is stated "against" the
 * actual rate; when both fall, the projection is a "decline" and faster means falling faster. A projection that
 * shows as 0.0% a year is "a flat population" (R42).
 */
function populationTrendText(subject: Subject, trend: TrendResult, latestYear: number): string {
  const actual = trend.from.value;
  const projected = trend.to.value;
  // The sign as shown, so a rate that rounds to 0.0 is never "fell by 0.0%"
  const falls = (rate: number) => Number(rate.toFixed(1)) < 0;
  const percent = (rate: number) => `${Math.abs(rate).toFixed(1)}%`;
  const projection = `projected for ${BASE_YEAR}–${PROJECTION_YEAR}`;
  const inLine = Math.abs(actual - projected) < IN_LINE_PP;

  let comparison: string;
  if (Number(projected.toFixed(1)) === 0) {
    comparison = `against a flat population ${projection}`;
  } else if (inLine || falls(actual) === falls(projected)) {
    const faster = falls(actual) ? actual < projected : actual > projected;
    const pace = inLine ? 'in line with' : faster ? 'faster than' : 'slower than';
    comparison = `${pace} the ${percent(projected)} a year ${falls(projected) ? 'decline ' : ''}${projection}`;
  } else {
    comparison = `against ${falls(projected) ? 'a decline' : 'growth'} of ${percent(projected)} a year ${projection}`;
  }
  return `${subject.owner} population ${falls(actual) ? 'fell' : 'grew'} by ${percent(actual)} a year `
    + `between ${BASE_YEAR} and ${latestYear}, ${comparison}.`;
}

/** Extra departures as stated: to the nearest 10 below 1,000 and to the nearest 100 from 1,000 (R44). */
function roundDepartures(extra: number): number {
  const step = extra < 1000 ? 10 : 100;
  return Math.round(extra / step) * step;
}

function growthServiceText(subject: Subject, g: GrowthServiceResult, extra: number): string {
  return `If AM-peak service stays at today's level, departures per 1,000 residents in ${subject.mid} fall from `
    + `${g.per1000Now.toFixed(DEPARTURES.decimals)} to ${g.per1000In2041.toFixed(DEPARTURES.decimals)} by 2041; `
    + `holding today's rate needs about ${extra.toLocaleString('en-AU')} more AM-peak departures.`;
}

function jobsHousingText(subject: Subject, j: JobsHousingResult): string {
  return `${subject.start} has ${j.jobsPerResident2021.toFixed(2)} local jobs per resident in 2021, `
    + `projected to be ${j.jobsPerResident2041.toFixed(2)} in 2041 (TfNSW TZP24).`;
}

// Insights

interface AreaContext {
  area: AreaAssessment;
  record: SeriesRecord;
  subject: Subject;
  universe: LgaIndicatorRecord[];
  /** The Greater Sydney benchmark's value of an indicator. */
  greaterSydney: (id: IndicatorId) => number | null;
  records: LgaIndicatorRecord[];
  assessment: NeedsAssessment;
}

/** A key need, with everything its sentence states. */
export type KeyNeed = IndicatorScore & { value: number; percentile: number; rank: number; ranked: number };

export const isKeyNeed = (s: IndicatorScore): s is KeyNeed => (
  s.keyNeed && INDICATOR_BY_ID[s.id].scored && s.value !== null && s.percentile !== null && s.rank !== null
  && s.ranked !== null
);

const INSIGHTS_BY_KIND: Record<Insight['kind'], (c: AreaContext) => Insight[]> = {
  key_need: ({ area, subject, greaterSydney }) => area.indicators
    .filter(isKeyNeed)
    .map(need => ({
      id: `key_need:${area.areaId}:${need.id}`,
      areaId: area.areaId,
      kind: 'key_need',
      severity: need.percentile / 100,
      text: keyNeedText(subject.mid, need, area, greaterSydney(need.id)),
      citations: [INDICATOR_BY_ID[need.id].source],
    })),

  mismatch: ({ area, record, subject, records }) => {
    const m = carDependencyMismatch(record, records);
    // Smaller residuals are shown only on the mismatch chart. One that rounds to 0.0 pp is not "higher" or
    // "lower" than expected (possible only with a near-perfect fit).
    if (!m || !m.usable || Math.abs(m.z) < MISMATCH_FLAG_Z || Number(Math.abs(m.residual).toFixed(CAR.decimals)) === 0) {
      return [];
    }
    return [{
      id: `mismatch:${area.areaId}`,
      areaId: area.areaId,
      kind: 'mismatch',
      severity: Math.min(1, Math.abs(m.z) / 2),
      text: mismatchText(subject, m),
      citations: [SOURCES.g62, MODEL_WORDING[m.fit.setting].source],
    }];
  },

  trend: ({ area, record, subject, universe }) => trendsWithSpread(record, universe).flatMap(({ trend, iqr }) => {
    const median = trend.universeMedianChange;
    if (median === null || iqr === null) return [];
    const distance = Math.abs(trend.change - median);
    const wording = trend.metric === 'population_growth' ? null : TREND_WORDING[trend.metric];
    return [{
      id: `trend:${area.areaId}:${trend.metric}`,
      areaId: area.areaId,
      kind: 'trend',
      severity: iqr > 0 ? Math.min(1, distance / (2 * iqr)) : distance > 0 ? 1 : 0,
      text: wording
        ? trendText(subject, trend, wording, median, area)
        // A population trend exists only when the record has an ERP year after 2021
        : populationTrendText(subject, trend, latestPopulation(record.series)!.year),
      citations: wording ? wording.citations(trend) : POPULATION_CITATIONS,
    }];
  }),

  growth_service: ({ area, record, subject }) => {
    const g = growthVsService(record);
    if (!g) return [];
    const extra = roundDepartures(g.extraDeparturesNeeded);
    const shown = (per1000: number) => per1000.toFixed(DEPARTURES.decimals);
    // Not for a shrinking population, nor "about 0 more"; and never "fall from 10.0 to 10.0", which only an
    // area of over 100,000 residents needing very few extra departures could produce.
    if (extra <= 0 || shown(g.per1000Now) === shown(g.per1000In2041)) return [];
    return [{
      id: `growth_service:${area.areaId}`,
      areaId: area.areaId,
      kind: 'growth_service',
      severity: Math.min(1, (1 - g.per1000In2041 / g.per1000Now) * 2),
      text: growthServiceText(subject, g, extra),
      citations: [SOURCES.gtfs, SOURCES.erp, SOURCES.populationProjections],
    }];
  },

  quadrant: ({ assessment, area, subject }) => areaQuadrantInsights(assessment, area, subject.start),

  jobs_housing: ({ area, record, subject }) => {
    const j = jobsHousing(record);
    if (!j) return [];
    return [{
      id: `jobs_housing:${area.areaId}`,
      areaId: area.areaId,
      kind: 'jobs_housing',
      severity: Math.min(1, Math.abs(j.jobsPerResident2041 - j.jobsPerResident2021) * 2),
      text: jobsHousingText(subject, j),
      citations: [SOURCES.employmentProjections, SOURCES.erp, SOURCES.populationProjections],
    }];
  },
};

/** Each assessed area with the record its series come from: its own LGA's, or the roll-up of a combined selection's members. */
export function areaRecords(a: NeedsAssessment): { area: AreaAssessment; record: SeriesRecord }[] {
  const byId = new Map(a.records.map(r => [r.areaId, r]));
  return a.areas.flatMap(area => {
    const record: SeriesRecord | undefined = a.mode === 'combined'
      ? aggregateRecords(a.memberIds.flatMap(id => byId.get(id) ?? []), area.name, area.areaId)
      : byId.get(area.areaId);
    return record ? [{ area, record }] : [];
  });
}

const KIND_ORDER: Insight['kind'][] = ['key_need', 'mismatch', 'trend', 'growth_service', 'quadrant', 'jobs_housing'];

/**
 * Cited findings for every assessed area, most severe first. Severity (0-1): key need = percentile ÷ 100;
 * mismatch = |z| ÷ 2; trend = |change − universe median change| ÷ (2 × the universe's IQR of changes);
 * growth against service = 2 × the fall in departures per 1,000 as a share; quadrant = the mean of the two need
 * percentiles within its panel group ÷ 100; jobs-housing = 2 × |change in jobs per resident|; each capped at 1.
 * Ties keep kind order (as KIND_ORDER), then area order. A mismatch is an insight only when the model is usable
 * and |z| ≥ 1. Nothing is drawn from missing data. A combined selection of two or more LGAs is "the combined
 * area" throughout.
 */
export function buildInsights(a: NeedsAssessment): Insight[] {
  const combined = a.mode === 'combined' && a.memberIds.length >= 2;
  const greaterSydney = (id: IndicatorId) => a.benchmarks.gsyd.indicators.find(s => s.id === id)?.value ?? null;

  const contexts = areaRecords(a).map(({ area, record }): AreaContext => ({
    area,
    record,
    subject: subjectFor(area, combined),
    universe: universeRecords(a.records, area.universe, area),
    greaterSydney,
    records: a.records,
    assessment: a,
  }));

  const insights = KIND_ORDER.flatMap(kind => contexts.flatMap(INSIGHTS_BY_KIND[kind]));
  // Array.prototype.sort is stable, so ties keep the kind-then-area order they were built in.
  return insights.sort((x, y) => y.severity - x.severity);
}
