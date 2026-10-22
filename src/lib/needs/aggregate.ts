import { INDICATORS } from './indicators';
import type { AggregatedRecord, IndicatorId, IndicatorValue, LgaIndicatorRecord } from './types';

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
    memberIds: members.map(m => m.areaId),
    approximate,
    partial,
  };
}
