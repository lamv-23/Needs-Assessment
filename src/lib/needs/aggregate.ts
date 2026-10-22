import { INDICATORS } from './indicators';
import type { AggregatedRecord, IndicatorId, IndicatorValue, InsightSeries, LgaIndicatorRecord } from './types';

/** `region` of an aggregate whose members are not all in one region. */
export const MULTIPLE_REGIONS = 'Multiple regions';

const MAX_NAMED_MEMBERS = 3;

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Up to three names are joined, more are counted. */
export function combinedName(names: string[]): string {
  return names.length <= MAX_NAMED_MEMBERS ? names.join(' + ') : `${names.length} LGAs`;
}

/** The one value every item shares, or null when there are none or they differ. */
function shared<T>(items: T[]): T | null {
  return items.length > 0 && items.every(item => item === items[0]) ? items[0] : null;
}

/** The sum of every member's count; null when any member has none, so a partial sum is never shown. */
function sumAll(values: (number | null)[]): number | null {
  if (values.length === 0 || !values.every(isNum)) return null;
  return (values as number[]).reduce((sum, v) => sum + v, 0);
}

/** The years every member has a point for, ascending. */
function sharedYears<Y extends number>(perMember: { year: Y }[][]): Y[] {
  if (perMember.length === 0) return [];
  return perMember[0]
    .map(p => p.year)
    .filter(year => perMember.every(points => points.some(p => p.year === year)))
    .sort((a, b) => a - b);
}

/**
 * Members' insight series rolled up. Counts are summed and yearly series are summed per year, both only
 * where every member has a value (else null, or the year is left out). Car dependency by year is the
 * population-weighted mean, with the same weights as the car_dependency indicator, so its 2021 point is the
 * aggregated indicator value; like the indicator, it is an approximation (`approximate` lists car_dependency).
 */
function aggregateSeries(members: LgaIndicatorRecord[]): InsightSeries {
  const population = members.reduce((sum, m) => sum + m.population, 0);
  const pointIn = <T extends { year: number }>(points: T[], year: number): T => points.find(p => p.year === year)!;

  const carYears = sharedYears(members.map(m => m.series.carDependencyByYear));
  const crashYears = sharedYears(members.map(m => m.series.crashesByYear));
  const populationYears = sharedYears(members.map(m => m.series.populationHistory));

  return {
    carDependencyByYear: population > 0
      ? carYears.map(year => ({
        year,
        value: members.reduce((sum, m) => sum + pointIn(m.series.carDependencyByYear, year).value * m.population, 0)
          / population,
      }))
      : [],
    crashesByYear: crashYears.map(year => ({
      year,
      total: members.reduce((sum, m) => sum + pointIn(m.series.crashesByYear, year).total, 0),
    })),
    populationHistory: populationYears.map(year => ({
      year,
      population: members.reduce((sum, m) => sum + pointIn(m.series.populationHistory, year).population, 0),
    })),
    population2041: sumAll(members.map(m => m.series.population2041)),
    amPeakDepartures: sumAll(members.map(m => m.series.amPeakDepartures)),
    approvalsLast12: sumAll(members.map(m => m.series.approvalsLast12)),
    approvalsPrev12: sumAll(members.map(m => m.series.approvalsPrev12)),
    jobs2021: sumAll(members.map(m => m.series.jobs2021)),
    jobs2041: sumAll(members.map(m => m.series.jobs2041)),
  };
}

/**
 * Rolls member LGAs up into one record: a combined selection or a benchmark. An empty `members` gives
 * an all-null record.
 *
 * - Ratio indicators are Σ numerator ÷ Σ denominator × scale. A member counts only if it has a value
 *   and both parts; one without cannot be summed, so it is treated as missing.
 * - Weighted indicators are population-weighted means over the members that have a value, and are
 *   flagged `approximate`.
 * - A member with no value is skipped and the indicator is flagged `partial`; if every member lacks
 *   one, the value is null (never 0).
 * - Density is Σ population ÷ Σ area, with each member's area recovered as population ÷ density.
 * - The insight series are rolled up as described at `aggregateSeries`.
 *
 * `peerGroup` is the members' shared group, else null; `region` is their shared region, else
 * `MULTIPLE_REGIONS`. The members are not modified.
 */
export function aggregateRecords(members: LgaIndicatorRecord[], name: string, areaId: string): AggregatedRecord {
  const population = members.reduce((sum, m) => sum + m.population, 0);
  const area = members.reduce((sum, m) => sum + m.population / m.densityPerKm2, 0);

  const values = {} as Record<IndicatorId, IndicatorValue>;
  const approximate: IndicatorId[] = [];
  const partial: IndicatorId[] = [];

  for (const def of INDICATORS) {
    let value: IndicatorValue = { value: null };
    let contributing = 0;

    if (def.aggregation === 'ratio') {
      let numerator = 0;
      let denominator = 0;
      for (const member of members) {
        const v = member.values[def.id];
        if (v && v.value !== null && isNum(v.numerator) && isNum(v.denominator)) {
          numerator += v.numerator;
          denominator += v.denominator;
          contributing++;
        }
      }
      if (contributing > 0 && denominator > 0) {
        value = { value: (numerator * def.scale) / denominator, numerator, denominator };
      }
    } else {
      let weighted = 0;
      let weight = 0;
      for (const member of members) {
        const v = member.values[def.id];
        if (v && v.value !== null) {
          weighted += v.value * member.population;
          weight += member.population;
          contributing++;
        }
      }
      if (contributing > 0) {
        approximate.push(def.id);
        if (weight > 0) value = { value: weighted / weight };
      }
    }

    values[def.id] = value;
    if (contributing > 0 && contributing < members.length) partial.push(def.id);
  }

  return {
    areaId,
    name,
    region: shared(members.map(m => m.region)) ?? MULTIPLE_REGIONS,
    population,
    densityPerKm2: area > 0 ? population / area : 0,
    peerGroup: shared(members.map(m => m.peerGroup)),
    values,
    series: aggregateSeries(members),
    memberIds: members.map(m => m.areaId),
    approximate,
    partial,
  };
}
