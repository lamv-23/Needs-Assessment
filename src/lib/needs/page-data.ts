import { markedValue, notRankedText, partialBenchmarkNotes, partialBenchmarks, type ValueColumn } from './coverage';
import { displayScore, formatValue } from './format';
import { CATCHMENT_NOTE, INDICATOR_BY_ID, INDICATORS, SOURCES } from './indicators';
import { mismatchChartData, trendData } from './insight-chart-data';
import { carDependencySources, WFH_CAVEAT_CITATION } from './insights';
import {
  drillDownSa2s, lgaShareText, rankSa2s, SA2_INDICATOR_IDS, SA2_LOW_POPULATION, SA2_SHARE_THRESHOLD, sa2RankText,
  topSa2s,
} from './sa2';
import type {
  AreaAssessment, IndicatorDef, IndicatorId, IndicatorScore, NeedDomain, NeedsAssessment, Sa2Assessed, Sa2NeedsFile,
  SourceRef,
} from './types';

/** Pure data shaping for the /needs page; the components only draw what this returns. */

const ALL_INDICATOR_IDS = INDICATORS.map(def => def.id);

/**
 * Every source the page cites: the indicators' sources, unique on the full reference and in registry order,
 * then those only the insights cite (ABS ERP, the 2011 and 2016 journey to work tables, and the 2021 Census lockdown
 * caveat). A source's position here is its citation number in the narrative and in the sources list.
 */
export const NEEDS_SOURCES: SourceRef[] = Array.from(
  new Map(
    [...INDICATORS.map(def => def.source), SOURCES.erp, SOURCES.b46, SOURCES.g59, WFH_CAVEAT_CITATION].map(s => [s.full, s]),
  ).values(),
);

/** 1-based citation number of `source`; 0 when it is not one of the page's sources. */
export function sourceNumber(source: SourceRef): number {
  return NEEDS_SOURCES.findIndex(s => s.full === source.full) + 1;
}

/** Source line for a figure: the distinct short names of `sources`, in the order given, joined by "; " (R31). */
function sourcesCaption(sources: SourceRef[]): string {
  return Array.from(new Set(sources.map(source => source.short))).join('; ');
}

/**
 * Source line for a figure: the distinct short source names of the indicators it shows, in the order
 * given (the registry order by default), joined by "; ".
 */
export function figureCaption(ids: IndicatorId[] = ALL_INDICATOR_IDS): string {
  return sourcesCaption(ids.map(id => INDICATOR_BY_ID[id].source));
}

// The insight figures draw on series that are not all indicators, so their sources are named here. They are the
// sources the findings cite (insights.ts), without the 2021 Census lockdown caveat, which is a note and not data.

/**
 * Car dependency, and the predictor of each setting drawn: residents near frequent AM-peak service in Sydney (the
 * straight-line catchments), population elsewhere.
 */
export function mismatchCaption(assessment: NeedsAssessment): string {
  const predictors = { metro: SOURCES.catchments, non_metro: SOURCES.g01 };
  return sourcesCaption([
    SOURCES.g62,
    ...mismatchChartData(assessment).charts.map(chart => predictors[chart.setting]),
  ]);
}

/**
 * Car dependency (the Census table of each year the figure draws: 2011 B46, 2016 G59 and 2021 G62, R59), crashes
 * (per 10,000 residents on each year's ERP), and population (ERP, then the projection).
 */
export function trendsCaption(assessment: NeedsAssessment): string {
  const carYears = trendData(assessment).panels.find(panel => panel.id === 'car_dependency')?.rows.map(row => row.x) ?? [];
  return sourcesCaption([
    ...carDependencySources([...carYears, 2021]), SOURCES.crashes, SOURCES.erp, SOURCES.populationProjections,
  ]);
}

/** AM-peak departures, over today's ERP and the 2041 projection. */
export const GROWTH_SERVICE_CAPTION = sourcesCaption([SOURCES.gtfs, SOURCES.erp, SOURCES.populationProjections]);

/** TZP24 jobs, over 2021 ERP and the 2041 projection. */
export const JOBS_HOUSING_CAPTION = sourcesCaption([
  SOURCES.employmentProjections, SOURCES.erp, SOURCES.populationProjections,
]);

// The SA2 drill-down (Phase 2). Every catchment figure says "straight-line distance", in its title so that the Word
// caption ("Figure n. {title}. Source: …") says it too.

export const SA2_MAP_TITLE = 'SA2 need map';

/** The SA2 map shades each SA2 by its overall score, made from all the SA2 indicators. */
export const SA2_MAP_CAPTION = figureCaption(SA2_INDICATOR_IDS);

/** The SA2 table's source line (page and Word): its scores, like the map's shading, use all the SA2 indicators. */
export const SA2_TABLE_CAPTION = figureCaption(SA2_INDICATOR_IDS);

/** The SA2 table's heading in the Word export (P2-R18). */
export const SA2_TABLE_HEADING = 'SA2s within the selection';

/** In place of the SA2 table when the selection has no ranked SA2. */
export const SA2_TABLE_EMPTY = 'No ranked SA2 in the selected LGAs.';

export const CATCHMENT_TITLE = 'Residents near AM-peak public transport (straight-line distance)';

/** The walking catchments: mesh-block residents and the stops with AM-peak service. */
export const CATCHMENT_CAPTION = sourcesCaption([SOURCES.catchments]);

/** The SA2 table lists this many of the selection's highest-need SA2s. */
export const SA2_TABLE_SIZE = 10;

const NO_SCORE = 'No score';

export interface Sa2TableRow {
  code: string;
  name: string;
  /** The LGAs the SA2 is listed for, with their shares of its residents. */
  lgas: string;
  /** "High (67)": the band and the overall score, floored. */
  overall: string;
  /** "ranks in the highest-need 10% of NSW SA2s" (R57). */
  rank: string;
  transport: string;
  socio: string;
  /** Residents near frequent AM-peak public transport (straight-line distance), or "No data". */
  frequent: string;
}

export interface Sa2TableData { rows: Sa2TableRow[]; notes: string[] }

type Sa2TableColumnKey = Exclude<keyof Sa2TableRow, 'code' | 'rank'>;

/**
 * The SA2 table's columns, in order, for the page and the Word export: the Overall need cell is `overall` with `rank`
 * on a line of its own, every other cell is its row field. `numeric` columns are right-aligned.
 */
export const SA2_TABLE_COLUMNS: { key: Sa2TableColumnKey; header: string; numeric: boolean }[] = [
  { key: 'name', header: 'SA2', numeric: false },
  { key: 'lgas', header: 'LGA (share of residents)', numeric: false },
  { key: 'overall', header: 'Overall need', numeric: false },
  { key: 'transport', header: 'Transport score', numeric: true },
  { key: 'socio', header: 'Socio-economic score', numeric: true },
  { key: 'frequent', header: 'Near frequent AM-peak public transport (straight-line distance)', numeric: true },
];

/** "Blacktown" by area id, for every LGA. */
const lgaNames = (assessment: Pick<NeedsAssessment, 'records'>) => new Map(assessment.records.map(r => [r.areaId, r.name]));

/**
 * The selection's highest-need SA2s (`topSa2s` of the selected LGAs, each SA2 once), with notes on what the scores
 * cover, the SA2s that are not ranked, and the straight-line catchment.
 */
export function sa2Table(file: Sa2NeedsFile, assessment: Pick<NeedsAssessment, 'records' | 'memberIds'>): Sa2TableData {
  const ranking = rankSa2s(file);
  const names = lgaNames(assessment);
  const drillDown = drillDownSa2s(file, assessment.memberIds);
  const top = topSa2s(file, assessment.memberIds, SA2_TABLE_SIZE);
  const frequent = INDICATOR_BY_ID.frequent_service_catchment;
  const domainText = (entry: Sa2Assessed, domain: NeedDomain) => {
    const score = entry.assessment.domains.find(d => d.domain === domain)?.score ?? null;
    return score === null ? NO_SCORE : String(displayScore(score));
  };

  const rows = top.map((entry): Sa2TableRow => {
    const { record, assessment: a } = entry;
    return {
      code: record.sa2Code,
      name: record.name,
      lgas: lgaShareText(record, names),
      overall: a.overall !== null && a.band !== null ? `${a.band} (${displayScore(a.overall)})` : NO_SCORE,
      rank: sa2RankText(entry, ranking) ?? '',
      transport: domainText(entry, 'transport'),
      socio: domainText(entry, 'socio'),
      frequent: formatValue(frequent, a.indicators.find(s => s.id === frequent.id)?.value ?? null),
    };
  });

  const rankedCount = drillDown.filter(e => e.overallRank !== null).length;
  const unranked = drillDown.filter(e => e.overallRank === null).map(e => e.record.name);
  const shown = rows.length < rankedCount
    ? `The ${rows.length} highest-need of the ${rankedCount} ranked SA2s in the selection`
    : `All ${rankedCount} ranked SA2s in the selection`;
  const notes = [
    `${shown}, by overall SA2 need score. An SA2 is in the selection when at least `
      + `${Math.round(SA2_SHARE_THRESHOLD * 100)}% of its residents live in a selected LGA. SA2 scores cover the `
      + `transport and socio-economic domains only and are ranked against the ${ranking.ranked} NSW SA2s with `
      + `${SA2_LOW_POPULATION} or more residents.`,
    ...(unranked.length > 0
      ? [`Not ranked (fewer than ${SA2_LOW_POPULATION} residents, or no score): ${unranked.join(', ')}.`]
      : []),
    CATCHMENT_NOTE,
  ];
  return { rows, notes };
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
 * One table cell: "83.8% (p91)", "≈ 70.0% (p60)" for a population-weighted value, "No data" when missing, and
 * "12.3% (not ranked, n = 2)" for a value with fewer than 5 LGAs with data in its comparison group (R58). The
 * percentile is floored like every shown score, so a shown p80 always means a key need. Benchmark columns are not
 * ranked in the table: they show the value, marked "*" when it is made from only some of the benchmark's LGAs (R58).
 */
export function indicatorCellText(def: IndicatorDef, score: IndicatorScore | undefined, column: ValueColumn): string {
  const value = markedValue(def, score, column);
  if (column === 'benchmark' || !score || score.value === null) return value;
  if (score.unranked && score.ranked !== null) return `${value} ${notRankedText(score.ranked)}`;
  return score.percentile !== null ? `${value} (p${displayScore(score.percentile)})` : value;
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
  /** Under the table: what each "*" benchmark value is made from (R58); empty when none is marked. */
  notes: string[];
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
      cells: scoresByColumn.map((scores, i) => (
        indicatorCellText(def, scores.get(def.id), i < areas.length ? 'area' : 'benchmark')
      )),
      source: def.source.short,
    })),
    notes: partialBenchmarkNotes(partialBenchmarks(assessment)),
  };
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

/** The comparison group(s) the areas' percentiles are ranked in: each distinct `universeLabel`, joined by ", ". */
export function comparisonLabel(areas: Pick<AreaAssessment, 'universeLabel'>[]): string {
  return Array.from(new Set(areas.map(a => a.universeLabel))).join(', ');
}

/** The note under the indicator table (page and Word export): how to read "(pNN)", the benchmarks and "≈". */
export function indicatorTableNote(comparison: string): string {
  return `pNN is an area's need percentile within its comparison group (${comparison}): higher means more need, and p80 or `
    + 'above is a key need. Greater Sydney and NSW are shown as values only. ≈ marks a population-weighted estimate.';
}

/** "22 October 2026": the date of an ISO timestamp in Sydney, so the server, the client and the Word export agree. */
export function formatNeedsDate(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney',
  }).format(new Date(iso));
}

type SelectionOf = Pick<NeedsAssessment, 'memberIds' | 'mode' | 'requestedUniverse'>;

/**
 * Whether two assessments are of the same selection: the same LGAs in the same order, the same mode and the same
 * comparison universe asked for. Compared by value, so a re-render that builds an equal assessment is not a change.
 */
export function sameSelection(a: SelectionOf, b: SelectionOf): boolean {
  return a.mode === b.mode
    && a.requestedUniverse === b.requestedUniverse
    && a.memberIds.length === b.memberIds.length
    && a.memberIds.every((id, i) => id === b.memberIds[i]);
}

/**
 * What the Word export is waiting for, named on its button ("Loading map boundaries…"): the SA2 file (P2-R5), then the
 * boundary files of the maps (P2-R19), so no figure is pictured while it still shows a placeholder. Null when nothing
 * the document needs is loading.
 */
export function exportWaitingFor(loading: { sa2Data: boolean; boundaries: boolean }): string | null {
  if (loading.sa2Data) return 'SA2 data';
  if (loading.boundaries) return 'map boundaries';
  return null;
}

/** Shown, with no download, when the selection changed while the Word export was capturing its figures. */
export const SELECTION_CHANGED_MESSAGE = 'The selection changed while exporting. Export again.';

const TITLE_PREFIX = 'Needs assessment';
const MAX_TITLE_NAME_CHARS = 60;
const SHORT_TITLE_NAMES = 2;

/**
 * Title of the Word export: "Needs assessment — Blacktown, Penrith", or the combined area's name. A list
 * of names too long for a title keeps the first two and counts the rest ("A, B and 31 more").
 */
export function exportTitle(assessment: Pick<NeedsAssessment, 'areas'>): string {
  const names = assessment.areas.map(a => a.name);
  if (names.length === 0) return TITLE_PREFIX;
  const all = names.join(', ');
  const shown = all.length <= MAX_TITLE_NAME_CHARS
    ? all
    : `${names.slice(0, SHORT_TITLE_NAMES).join(', ')} and ${names.length - SHORT_TITLE_NAMES} more`;
  return `${TITLE_PREFIX} — ${shown}`;
}

const MAX_FILE_NAME_CHARS = 80;

/** `title` as a file name: lower-case words joined by "-", at most 80 characters, plus ".docx". */
export function exportFileName(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_FILE_NAME_CHARS)
    .replace(/-+$/, '');
  return `${slug || 'needs-assessment'}.docx`;
}
