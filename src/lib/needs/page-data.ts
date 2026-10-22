import { displayScore, formatValue } from './format';
import { INDICATOR_BY_ID, INDICATORS } from './indicators';
import type {
  AreaAssessment, IndicatorDef, IndicatorId, IndicatorScore, NeedDomain, NeedsAssessment, SourceRef,
} from './types';

/** Pure data shaping for the /needs page; the components only draw what this returns. */

const ALL_INDICATOR_IDS = INDICATORS.map(def => def.id);

/**
 * Every source behind the page's indicators, unique on the full reference and in registry order.
 * A source's position here is its citation number in the narrative and in the sources list.
 */
export const NEEDS_SOURCES: SourceRef[] = Array.from(
  new Map(INDICATORS.map(def => [def.source.full, def.source])).values(),
);

/** 1-based citation number of `source`; 0 when it is not one of the page's sources. */
export function sourceNumber(source: SourceRef): number {
  return NEEDS_SOURCES.findIndex(s => s.full === source.full) + 1;
}

/**
 * Source line for a figure: the distinct short source names of the indicators it shows, in the order
 * given (the registry order by default), joined by "; ".
 */
export function figureCaption(ids: IndicatorId[] = ALL_INDICATOR_IDS): string {
  return Array.from(new Set(ids.map(id => INDICATOR_BY_ID[id].source.short))).join('; ');
}

export const STRIP_PLOT_COUNT = 6;

/**
 * The scored indicators to draw as strip plots: those whose highest need percentile across `areas` is
 * greatest, highest first; ties keep the registry order. An indicator with no percentile in any area
 * ranks last but still counts, so the page always has `count` plots.
 */
export function stripIndicatorIds(areas: Pick<AreaAssessment, 'indicators'>[], count = STRIP_PLOT_COUNT): IndicatorId[] {
  const highest = (id: IndicatorId) => Math.max(
    -1,
    ...areas.flatMap(area => area.indicators.filter(s => s.id === id).map(s => s.percentile ?? -1)),
  );
  return INDICATORS
    .filter(def => def.scored)
    .map(def => ({ id: def.id, highest: highest(def.id) }))
    // Array.prototype.sort is stable, so equal percentiles keep the registry order.
    .sort((a, b) => b.highest - a.highest)
    .slice(0, count)
    .map(entry => entry.id);
}

/**
 * One table cell: "83.8% (p91)", "≈ 70.0% (p60)" for a population-weighted value, "No data" when missing.
 * The percentile is floored like every shown score, so a shown p80 always means a key need. Benchmarks
 * pass `withPercentile` false: they are not ranked in the table.
 */
export function indicatorCellText(def: IndicatorDef, score: IndicatorScore | undefined, withPercentile: boolean): string {
  if (!score || score.value === null) return formatValue(def, null);
  const value = `${score.approximate ? '≈ ' : ''}${formatValue(def, score.value)}`;
  return withPercentile && score.percentile !== null ? `${value} (p${displayScore(score.percentile)})` : value;
}

export interface IndicatorTableRow {
  id: IndicatorId;
  domain: NeedDomain;
  /** The indicator's label; "(context)" is appended for an indicator that is shown but not scored. */
  label: string;
  /** One per column of `IndicatorTableData.columns`. */
  cells: string[];
  source: string;
}

export interface IndicatorTableData {
  /** The selected areas, then Greater Sydney, then NSW. */
  columns: string[];
  rows: IndicatorTableRow[];
}

/** Every indicator against the selected areas (value and percentile), Greater Sydney and NSW (value only). */
export function indicatorTable(assessment: NeedsAssessment): IndicatorTableData {
  const { areas, benchmarks } = assessment;
  const columns = [...areas, benchmarks.gsyd, benchmarks.nsw];
  const scoresByColumn = columns.map(column => new Map(column.indicators.map(s => [s.id, s])));
  return {
    columns: columns.map(column => column.name),
    rows: INDICATORS.map(def => ({
      id: def.id,
      domain: def.domain,
      label: def.scored ? def.label : `${def.label} (context)`,
      cells: scoresByColumn.map((scores, i) => indicatorCellText(def, scores.get(def.id), i < areas.length)),
      source: def.source.short,
    })),
  };
}

/** The table as records for the Excel export: `indicator`, one key per column, then `source`. */
export function indicatorExcelRows(table: IndicatorTableData): Array<Record<string, string>> {
  return table.rows.map(row => ({
    indicator: row.label,
    ...Object.fromEntries(table.columns.map((column, i) => [column, row.cells[i]])),
    source: row.source,
  }));
}

/**
 * Citation numbers in ascending order with runs of three or more consecutive numbers collapsed to a
 * range, so a sentence citing every source reads "1–14", not "1,2,3,…,14". A single number has `from === to`.
 */
export function citationSegments(numbers: number[]): Array<{ from: number; to: number }> {
  const sorted = Array.from(new Set(numbers)).sort((a, b) => a - b);
  const segments: Array<{ from: number; to: number }> = [];
  let start = 0;
  while (start < sorted.length) {
    let end = start;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end++;
    if (end - start >= 2) {
      segments.push({ from: sorted[start], to: sorted[end] });
    } else {
      for (let i = start; i <= end; i++) segments.push({ from: sorted[i], to: sorted[i] });
    }
    start = end + 1;
  }
  return segments;
}
