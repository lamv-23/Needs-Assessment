import { formatValue } from './format';
import { INDICATOR_BY_ID, INDICATORS } from './indicators';
import type { IndicatorDef, IndicatorId, IndicatorScore, NeedsAssessment } from './types';

/**
 * How partial coverage is stated (R58), in one place for the sentences, the table, the figures and the Word export: a
 * comparison group in which only some LGAs have a value, and a benchmark value made from only some of its LGAs.
 */

/** "NSW LGAs", or "the 43 NSW LGAs with data" when only `withData` of the group's `size` LGAs have a value. */
export function groupWithData(universeLabel: string, withData: number, size: number): string {
  return withData < size ? `the ${withData} ${universeLabel} with data` : universeLabel;
}

/** Follows a benchmark value made from only some of the benchmark's LGAs: "30.2%*". */
export const PARTIAL_MARK = '*';

export type ValueColumn = 'area' | 'benchmark';

/**
 * A value as the tables and figures show it: "≈ " before a population-weighted estimate and, in a benchmark column,
 * `PARTIAL_MARK` after a value made from only some of the benchmark's LGAs. "No data" when there is no value. A
 * combined area's partial values are not marked: the data notes name them (R16).
 */
export function markedValue(
  def: IndicatorDef,
  score: Pick<IndicatorScore, 'value' | 'approximate' | 'partial'> | undefined,
  column: ValueColumn,
): string {
  if (!score || score.value === null) return formatValue(def, null);
  const mark = column === 'benchmark' && score.partial ? PARTIAL_MARK : '';
  return `${score.approximate ? '≈ ' : ''}${formatValue(def, score.value)}${mark}`;
}

/** A benchmark value made from only `withData` of the benchmark's `members` LGAs. */
export interface PartialBenchmark { key: 'gsyd' | 'nsw'; name: string; id: IndicatorId; withData: number; members: number }

const BENCHMARK_KEYS = ['gsyd', 'nsw'] as const;

/** The marked benchmark values among `ids`, by indicator (registry order given), Greater Sydney before NSW. */
export function partialBenchmarks(
  a: Pick<NeedsAssessment, 'benchmarks' | 'benchmarkRecords'>,
  ids: IndicatorId[] = INDICATORS.map(def => def.id),
): PartialBenchmark[] {
  return ids.flatMap(id => BENCHMARK_KEYS.flatMap((key): PartialBenchmark[] => {
    const score = a.benchmarks[key].indicators.find(s => s.id === id);
    if (!score || score.value === null || !score.partial) return [];
    const record = a.benchmarkRecords[key];
    return [{ key, name: a.benchmarks[key].name, id, withData: record.withData[id], members: record.memberIds.length }];
  }));
}

/**
 * The notes under a table or figure with marked values: "* Based on the 43 of 128 LGAs with data." for one; for
 * several, one each that names it, "* Job growth 2021–41, NSW: based on the 43 of 128 LGAs with data.".
 */
export function partialBenchmarkNotes(entries: PartialBenchmark[]): string[] {
  const basis = (e: PartialBenchmark) => `the ${e.withData} of ${e.members} LGAs with data`;
  if (entries.length === 1) return [`${PARTIAL_MARK} Based on ${basis(entries[0])}.`];
  return entries.map(e => `${PARTIAL_MARK} ${INDICATOR_BY_ID[e.id].label}, ${e.name}: based on ${basis(e)}.`);
}

/** "(not ranked, n = 2)": after a value with fewer than 5 LGAs with data in its comparison group (R58). */
export const notRankedText = (ranked: number): string => `(not ranked, n = ${ranked})`;
