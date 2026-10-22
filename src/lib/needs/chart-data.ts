import { BENCHMARK_UNIVERSES } from './assess';
import { markedValue, partialBenchmarkNotes, partialBenchmarks } from './coverage';
import { CATCHMENT_NOTE, INDICATOR_BY_ID, DOMAIN_LABELS, NEED_DOMAINS } from './indicators';
import { formatValue } from './format';
import { AREA_PALETTE_SIZE, areaColor, BENCHMARK_COLOR, DOMAIN_COLORS, labelledIds } from './colors';
import type { AreaAssessment, IndicatorDef, IndicatorId, NeedDomain, NeedsAssessment } from './types';

/** Pure data shaping for the needs charts; the components only draw what this returns. */

const ELLIPSIS = '…';

interface Token { text: string; spaceBefore: boolean }

/** Words, split again after each hyphen ("Canterbury-" "Bankstown") and into chunks of at most `maxChars`. */
function tokenize(text: string, maxChars: number): Token[] {
  const tokens: Token[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const parts = word.split('-');
    parts.forEach((part, i) => {
      const piece = i < parts.length - 1 ? `${part}-` : part;
      for (let start = 0; start < piece.length; start += maxChars) {
        tokens.push({ text: piece.slice(start, start + maxChars), spaceBefore: i === 0 && start === 0 && tokens.length > 0 });
      }
    });
  }
  return tokens;
}

/**
 * Greedy word wrap for SVG text, which does not wrap itself. Breaks at spaces and after hyphens,
 * splits a word longer than a line, and ends the last line with an ellipsis when `maxLines` is not
 * enough. Every line is at most `maxChars` long.
 */
export function wrapLabel(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = '';
  let truncated = false;
  for (const token of tokenize(text, maxChars)) {
    const joined = current === '' ? token.text : `${current}${token.spaceBefore ? ' ' : ''}${token.text}`;
    if (joined.length <= maxChars) {
      current = joined;
      continue;
    }
    if (lines.length === maxLines - 1) {
      truncated = true;
      break;
    }
    lines.push(current);
    current = token.text;
  }
  if (current !== '') lines.push(current);
  if (truncated) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length + ELLIPSIS.length > maxChars
      ? `${last.slice(0, maxChars - ELLIPSIS.length)}${ELLIPSIS}`
      : `${last}${ELLIPSIS}`;
  }
  return lines;
}

/**
 * Baseline of a point name relative to its dot, per level: near above, near below, then further
 * out. A leader line joins a name on an outer level to its dot.
 */
export const LABEL_DY = [-14, 26, -32, 44, -50, 62];
export const LABEL_LEVELS = LABEL_DY.length;

export interface LabelBox {
  /** Horizontal centre of the name, in pixels across the plot. */
  at: number;
  /** Width of the name, in pixels. */
  width: number;
}

const LABEL_PAD_PX = 6;

/**
 * Picks a level for each name so that no two names on a level overprint. Works left to right: a
 * name takes the first level whose previous name ends at least `LABEL_PAD_PX` before it starts.
 * A name that fits on none of the `levelCount` levels gets null (it is left unnamed rather than
 * overprinted). Returns levels in input order.
 */
export function assignLabelLevels(labels: LabelBox[], levelCount = LABEL_LEVELS): Array<number | null> {
  const rightEdge: number[] = Array(levelCount).fill(-Infinity);
  const levels: Array<number | null> = Array(labels.length).fill(null);
  const order = labels.map((l, i) => i).sort((a, b) => labels[a].at - labels[b].at);
  for (const index of order) {
    const { at, width } = labels[index];
    const level = rightEdge.findIndex(edge => at - width / 2 >= edge + LABEL_PAD_PX);
    if (level === -1) continue;
    rightEdge[level] = at + width / 2;
    levels[index] = level;
  }
  return levels;
}

/** Longest row label line in the heatmap, in characters. */
export const HEATMAP_LABEL_CHARS = 38;
const LOWER_IS_MORE_NEED = '(lower value = more need)';

/**
 * Heatmap row names of the indicators whose label does not fit the one line beside the hint: the label's terms, AM-peak
 * kept (P2-R17). The heatmap's notes give their straight-line definition (HEATMAP_CATCHMENT_NOTE).
 */
const HEATMAP_LABELS: Partial<Record<IndicatorId, string>> = {
  frequent_service_catchment: 'Near frequent AM-peak public transport',
  any_service_catchment: 'Near any AM-peak public transport',
};

/** Longest line of a heatmap note: the legend is 700 px wide, at 11 px. */
const HEATMAP_NOTE_CHARS = 110;

/** Under the heatmap: what its two catchment rows measure (the shared catchment note), wrapped to the legend's width. */
export const HEATMAP_CATCHMENT_NOTE = wrapLabel(CATCHMENT_NOTE, HEATMAP_NOTE_CHARS, 4);

/** The name of `def`'s heatmap row: its label, or a shorter name where the label is too long for the row. */
export const heatmapRowName = (def: IndicatorDef): string => HEATMAP_LABELS[def.id] ?? def.label;

/**
 * Heatmap row label: the indicator's row name wrapped to the label column ("(context)" appended for an
 * unscored one), and a separate hint line when a lower value means more need, since the cell
 * colour then runs against the number. A context row is unshaded, so it has no hint. At most two lines in all, so
 * rows stay one height.
 */
export function heatmapRowLabel(def: IndicatorDef): { lines: string[]; hint: string | null } {
  const hint = def.direction === 'lower' && def.scored ? LOWER_IS_MORE_NEED : null;
  const name = heatmapRowName(def);
  const text = def.scored ? name : `${name} (context)`;
  return { lines: wrapLabel(text, HEATMAP_LABEL_CHARS, hint ? 1 : 2), hint };
}

/**
 * Which side of its line a reference label goes, so labels point away from each other and never
 * sit across the other line. `mine` and `other` are positions across the axis (0 = left edge, 1 =
 * right edge; `other` is null when there is only one line). The left-hand line's label goes left
 * unless it is too close to the left edge to fit, and mirrored; a lone line's label goes toward
 * the middle of the plot.
 */
export function labelSide(mine: number, other: number | null): 'left' | 'right' {
  const EDGE = 0.12;
  const left = other === null ? mine > 0.6 : mine < other;
  if (left && mine < EDGE) return 'right';
  if (!left && mine > 1 - EDGE) return 'left';
  return left ? 'left' : 'right';
}

export interface ChartSeries { key: string; name: string; color: string; benchmark?: true }

const GSYD_KEY = 'gsyd';

const domainScore = (area: AreaAssessment, domain: NeedDomain): number | null =>
  area.domains.find(d => d.domain === domain)?.score ?? null;

interface BarLayout { size: number; gap: number; categoryGap: number }

/** One row per domain, a bar per area: up to `AREA_PALETTE_SIZE` areas, each with its own colour. */
const GROUPED_BARS: BarLayout = { size: 16, gap: 3, categoryGap: 20 };
/** One row per area, a bar per domain: for more areas than there are colours, so each row is named. */
const ROW_BARS: BarLayout = { size: 11, gap: 1, categoryGap: 8 };
/** Legend, band labels, axis and padding around the bars; the legend gets a row per 5 series. */
const DOMAIN_CHART_MARGIN_PX = 100;
const LEGEND_ROW_PX = 22;

type DomainRow = Record<string, string | number | null>;

/** Height of a bar chart with `categories` groups of `bars` bars. */
function barChartHeight(categories: number, bars: number, layout: BarLayout, legendEntries: number): number {
  const group = bars * layout.size + (bars - 1) * layout.gap + layout.categoryGap;
  return DOMAIN_CHART_MARGIN_PX + LEGEND_ROW_PX * Math.ceil(legendEntries / 5) + categories * group;
}

/** The areas the domain score chart draws: the selected areas, then Greater Sydney when it is drawn (R61). */
export function domainChartAreas(assessment: NeedsAssessment): AreaAssessment[] {
  const withBenchmark = BENCHMARK_UNIVERSES.includes(assessment.universe);
  return [...assessment.areas, ...(withBenchmark ? [assessment.benchmarks.gsyd] : [])];
}

/**
 * Domain score bars. Values are the unrounded scores; a missing score is null.
 * - Up to `AREA_PALETTE_SIZE` areas ("by-domain"): one row per domain, one series per area
 *   (selection order, shared area colours) and a Greater Sydney reference last.
 * - More areas ("by-area"): colours would repeat and the legend could not tell bars apart, so one
 *   row per area (named on the axis) with a bar per domain, coloured by domain, and a Greater
 *   Sydney row last.
 * Greater Sydney is drawn only when the areas are ranked against NSW or Greater Sydney, where its scores are (R61).
 */
export function domainChartData(assessment: NeedsAssessment) {
  const withBenchmark = BENCHMARK_UNIVERSES.includes(assessment.universe);
  const sources = domainChartAreas(assessment);

  if (assessment.areas.length > AREA_PALETTE_SIZE) {
    const series: ChartSeries[] = NEED_DOMAINS.map(domain => ({
      key: domain, name: DOMAIN_LABELS[domain], color: DOMAIN_COLORS[domain],
    }));
    const rows = sources.map(area => {
      const row: DomainRow = { name: area.name };
      NEED_DOMAINS.forEach(domain => { row[domain] = domainScore(area, domain); });
      return row;
    });
    return {
      layout: 'by-area' as const,
      rows,
      series,
      bar: ROW_BARS,
      /** Name of the Greater Sydney row, which the chart sets apart from the areas; null when it is not drawn. */
      benchmarkName: withBenchmark ? assessment.benchmarks.gsyd.name : null,
      height: barChartHeight(rows.length, series.length, ROW_BARS, series.length),
    };
  }

  const series: ChartSeries[] = [
    ...assessment.areas.map((area, i) => ({ key: `a${i}`, name: area.name, color: areaColor(i) })),
    ...(withBenchmark
      ? [{ key: GSYD_KEY, name: assessment.benchmarks.gsyd.name, color: BENCHMARK_COLOR, benchmark: true as const }]
      : []),
  ];
  const rows = NEED_DOMAINS.map(domain => {
    const row: DomainRow = { name: DOMAIN_LABELS[domain] };
    series.forEach((s, i) => { row[s.key] = domainScore(sources[i], domain); });
    return row;
  });
  return {
    layout: 'by-domain' as const,
    rows,
    series,
    bar: GROUPED_BARS,
    benchmarkName: null,
    height: barChartHeight(rows.length, series.length, GROUPED_BARS, series.length),
  };
}

export interface NiceAxis { lo: number; hi: number; ticks: number[] }

/**
 * A round-numbered axis (steps of 1, 2 or 5 times a power of ten, about `targetTicks` ticks) that
 * covers [min, max] with a little room at each end, but never beyond `limits` (so a share does not
 * run below 0% or above 100%). Setting it on the chart fixes where every value falls, which the name
 * placement needs.
 */
export function niceAxis(min: number, max: number, limits: { floor?: number; cap?: number } = {}, targetTicks = 6): NiceAxis {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 1] };
  const span = max - min || Math.abs(min) * 0.2 || 1;
  const raw = (span * 1.02) / (targetTicks - 1);
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  const step = (unit <= 1.5 ? 1 : unit <= 3 ? 2 : unit <= 7 ? 5 : 10) * power;
  const round = (n: number) => Number(n.toFixed(10));
  const lo = round(Math.max(Math.floor((min - span * 0.01) / step) * step, limits.floor ?? -Infinity));
  const hi = round(Math.min(Math.ceil((max + span * 0.01) / step) * step, limits.cap ?? Infinity));
  const count = Math.round((hi - lo) / step);
  return { lo, hi, ticks: Array.from({ length: count + 1 }, (_, i) => round(lo + i * step)) };
}

/** Where `value` falls across the plot, 0 = left edge and 1 = right edge; mirrored for a reversed axis. */
export function axisFraction(axis: NiceAxis, reversed: boolean, value: number): number {
  const f = (value - axis.lo) / (axis.hi - axis.lo);
  return reversed ? 1 - f : f;
}

export interface StripPoint {
  id: string;
  name: string;
  x: number;
  /** Value as shown: "≈ " in front when it is a population-weighted estimate. */
  text: string;
  color: string;
  /** Name level (0 to `LABEL_LEVELS` - 1) when the point is named on the plot, else null. */
  level: number | null;
}

/** A benchmark line; `text` is marked "*" when the value is made from only some of the benchmark's LGAs (R58). */
export interface StripReference { key: 'gsyd' | 'nsw'; name: string; x: number; text: string }

/** Longest name drawn on the strip plot, in characters; longer names end with an ellipsis. */
export const STRIP_NAME_CHARS = 26;
const NAME_PX_PER_CHAR = 6;
/** Plot width assumed until the chart has been measured. */
export const DEFAULT_STRIP_PLOT_PX = 640;

const MID_GREY = '#9ca3af';

function valueText(def: IndicatorDef, value: number | null, approximate: boolean): string {
  return `${approximate && value !== null ? '≈ ' : ''}${formatValue(def, value)}`;
}

/**
 * One indicator across NSW: every other LGA as a grey dot, each selected area coloured, the
 * Greater Sydney and NSW values as reference lines (marked "*", with a note, when made from only some of their
 * LGAs). `reversed` flips the axis for indicators where a
 * lower value means more need, so more need is always to the right. Selected areas without a value
 * are listed in `noData`, not plotted. The first few selected areas are named, each on a level where
 * it does not overprint another name for a plot `plotWidthPx` wide; one that fits nowhere is unnamed.
 */
export function stripData(assessment: NeedsAssessment, indicatorId: IndicatorId, plotWidthPx = DEFAULT_STRIP_PLOT_PX) {
  const def = INDICATOR_BY_ID[indicatorId];
  const scoreOf = (area: AreaAssessment) => area.indicators.find(i => i.id === indicatorId);

  const selectedIds = new Set(assessment.areas.map(a => a.areaId));
  const others: StripPoint[] = assessment.records.flatMap(record => {
    const value = record.values[indicatorId]?.value ?? null;
    if (value === null || selectedIds.has(record.areaId)) return [];
    return [{ id: record.areaId, name: record.name, x: value, text: valueText(def, value, false), color: MID_GREY, level: null }];
  });

  const noData: string[] = [];
  const plotted: StripPoint[] = [];
  assessment.areas.forEach((area, i) => {
    const score = scoreOf(area);
    if (!score || score.value === null) {
      noData.push(area.name);
      return;
    }
    plotted.push({
      id: area.areaId,
      name: area.name,
      x: score.value,
      text: valueText(def, score.value, score.approximate),
      color: areaColor(i),
      level: null,
    });
  });

  const references: StripReference[] = (['gsyd', 'nsw'] as const).flatMap(key => {
    const benchmark = assessment.benchmarks[key];
    const score = scoreOf(benchmark);
    if (!score || score.value === null) return [];
    return [{ key, name: benchmark.name, x: score.value, text: markedValue(def, score, 'benchmark') }];
  });

  const reversed = def.direction === 'lower';
  const everything = [...others, ...plotted, ...references].map(p => p.x);
  const [min, max] = [Math.min(...everything), Math.max(...everything)];
  const axis = niceAxis(min, max, {
    floor: min >= 0 ? 0 : undefined,
    cap: def.unit === '%' && max <= 100 ? 100 : undefined,
  });

  const named = new Set(labelledIds(assessment.areas.map(a => a.areaId)));
  const toName = plotted.filter(p => named.has(p.id));
  const levels = assignLabelLevels(toName.map(p => ({
    at: axisFraction(axis, reversed, p.x) * plotWidthPx,
    width: Math.min(p.name.length, STRIP_NAME_CHARS) * NAME_PX_PER_CHAR,
  })));
  const selected = plotted.map(p => {
    const at = toName.indexOf(p);
    return at === -1 ? p : { ...p, level: levels[at] };
  });

  return {
    def,
    reversed,
    others,
    selected,
    references,
    /** The axis to draw, covering every dot and reference line. */
    axis,
    noData,
    unnamedCount: selected.filter(p => p.level === null).length,
    /** Under the plot: what a "*" benchmark line is made from (R58). */
    notes: partialBenchmarkNotes(partialBenchmarks(assessment, [indicatorId])),
  };
}

// Walking catchments (Phase 2)

export type CatchmentId = 'frequent_service_catchment' | 'any_service_catchment';

/** The catchment chart's two panels, in order, with their titles. */
export const CATCHMENT_PANELS: { id: CatchmentId; title: string }[] = [
  { id: 'frequent_service_catchment', title: 'Near frequent service (8+ weekday 7-9am departures)' },
  { id: 'any_service_catchment', title: 'Near any service (1+ weekday 7-9am departures)' },
];

export interface CatchmentBar {
  id: string;
  name: string;
  /** The share in percent; null when the area has none (drawn as "No data"). */
  value: number | null;
  text: string;
}

export interface CatchmentPanel {
  id: CatchmentId;
  title: string;
  bars: CatchmentBar[];
  /** Greater Sydney and NSW, drawn as reference lines; a benchmark with no value is left out. */
  references: StripReference[];
}

const CATCHMENT_BAR_PX = 30;

/**
 * The residents near frequent and near any AM-peak public transport (straight-line distance) of each assessed area (the
 * combined area as one bar), one panel per measure, with Greater Sydney and NSW as reference lines, marked "*" with a
 * note when made from only some of their LGAs (R58).
 */
export function catchmentChartData(assessment: NeedsAssessment) {
  const ids = CATCHMENT_PANELS.map(panel => panel.id);
  const panels: CatchmentPanel[] = CATCHMENT_PANELS.map(({ id, title }) => {
    const def = INDICATOR_BY_ID[id];
    const scoreOf = (area: AreaAssessment) => area.indicators.find(s => s.id === id);
    return {
      id,
      title,
      bars: assessment.areas.map(area => {
        const value = scoreOf(area)?.value ?? null;
        return { id: area.areaId, name: area.name, value, text: formatValue(def, value) };
      }),
      references: (['gsyd', 'nsw'] as const).flatMap(key => {
        const benchmark = assessment.benchmarks[key];
        const score = scoreOf(benchmark);
        if (!score || score.value === null) return [];
        return [{ key, name: benchmark.name, x: score.value, text: markedValue(def, score, 'benchmark') }];
      }),
    };
  });
  return {
    panels,
    /** Shares run 0-100%. */
    axis: { lo: 0, hi: 100, ticks: [0, 20, 40, 60, 80, 100] } satisfies NiceAxis,
    /** Each panel's height: a row per area, plus the axis and room for the reference labels. */
    height: Math.max(150, 96 + assessment.areas.length * CATCHMENT_BAR_PX),
    noData: assessment.areas
      .filter(area => ids.some(id => (area.indicators.find(s => s.id === id)?.value ?? null) === null))
      .map(area => area.name),
    notes: partialBenchmarkNotes(partialBenchmarks(assessment, ids)),
  };
}
