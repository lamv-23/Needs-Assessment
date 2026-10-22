import { niceAxis, wrapLabel, type NiceAxis } from './chart-data';
import { AREA_PALETTE_SIZE, areaColor, labelledIds } from './colors';
import { formatSignedDiff, formatValue } from './format';
import { INDICATOR_BY_ID } from './indicators';
import { settingOf } from './peer-groups';
import {
  BASE_YEAR, MISMATCH_FLAG_Z, PROJECTION_YEAR, areaRecords, carDependencyMismatch, crashRate, growthVsService, jobsHousing, latestPopulation,
  populationIn, predictorOf, type LinearFit, type SeriesRecord,
} from './insights';
import { universeRecords } from './scoring';
import type { NeedsAssessment } from './types';

/** Pure data shaping for the Part B insight charts (mismatch scatter, trends, growth against service, jobs-housing). */

type Setting = LinearFit['setting'];

interface Pt { x: number; y: number }

const CAR = INDICATOR_BY_ID.car_dependency;
const CRASH = INDICATOR_BY_ID.crash_rate;
const DEPARTURES = INDICATOR_BY_ID.am_peak_departures_per_1000;

// Shared text

/** "A", "A and B", "A, B and C"; past `max` names, the rest are counted ("A, B, C, D, E, F and 2 more"). */
export function nameList(names: string[], max = 6): string {
  if (names.length > max) return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "2 of 5 selected LGAs have no {what} and are not shown: A and B."; null when none are missing. */
export function noDataNote(missing: string[], total: number, what: string): string | null {
  if (missing.length === 0) return null;
  const one = missing.length === 1;
  return `${missing.length} of ${total} selected LGAs ${one ? 'has' : 'have'} no ${what} and ${one ? 'is' : 'are'} not shown: ${nameList(missing)}.`;
}

/** Height of a chart with a row per area: `fixedPx` for the axes and margins, at least `minPx`. */
const rowsHeight = (rows: number, rowPx: number, fixedPx: number, minPx: number) => Math.max(minPx, fixedPx + rows * rowPx);

// Name placement on a scatter

export type LabelPlacement =
  | 'right' | 'left' | 'above' | 'below' | 'above-right' | 'above-left' | 'below-right' | 'below-left';

/** A dot in plot pixels. `width` is the width of its name, or null when it is not to be named. */
export interface LabelAnchor { x: number; y: number; width: number | null; radius: number }

const LABEL_HEIGHT_PX = 14;
const LABEL_GAP_PX = 4;
const LABEL_PAD_PX = 2;

const SIDES: Record<LabelPlacement, { h: -1 | 0 | 1; v: -1 | 0 | 1 }> = {
  right: { h: 1, v: 0 }, left: { h: -1, v: 0 }, above: { h: 0, v: -1 }, below: { h: 0, v: 1 },
  'above-right': { h: 1, v: -1 }, 'above-left': { h: -1, v: -1 }, 'below-right': { h: 1, v: 1 }, 'below-left': { h: -1, v: 1 },
};

/** Preferred places, best first: beside the dot, then above or below it, then the corners. */
const PLACEMENT_ORDER: LabelPlacement[] = [
  'right', 'left', 'above', 'below', 'above-right', 'above-left', 'below-right', 'below-left',
];

/**
 * Where a name of `width` goes relative to the centre of a dot of `radius`: the text origin (`dx`, `dy` to its
 * baseline), its `anchor` and the `rect` it occupies, all in pixels from the dot's centre.
 */
export function labelGeometry(placement: LabelPlacement, width: number, radius: number) {
  const { h, v } = SIDES[placement];
  const diagonal = h !== 0 && v !== 0;
  const reach = diagonal ? radius * 0.71 + 3 : radius + LABEL_GAP_PX;
  const x0 = h === 1 ? h * reach : h === -1 ? -reach - width : -width / 2;
  const y0 = v === 1 ? v * reach : v === -1 ? -reach - LABEL_HEIGHT_PX : -LABEL_HEIGHT_PX / 2;
  return {
    dx: h === 0 ? 0 : h * reach,
    dy: y0 + LABEL_HEIGHT_PX - 3,
    anchor: (h === 1 ? 'start' : h === -1 ? 'end' : 'middle') as 'start' | 'middle' | 'end',
    rect: { x0, x1: x0 + width, y0, y1: y0 + LABEL_HEIGHT_PX },
  };
}

interface Rect { x0: number; x1: number; y0: number; y1: number }

const overlaps = (a: Rect, b: Rect, pad: number) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

/**
 * Picks a place for each name so that none leaves the plot, overprints another name or covers any dot (named
 * or not). Names are placed in the order given, so earlier ones win a contested spot; one that fits nowhere
 * gets null, and is left unnamed rather than overprinted.
 */
export function placePointLabels(anchors: LabelAnchor[], plot: { width: number; height: number }): Array<LabelPlacement | null> {
  const placed: Rect[] = [];
  return anchors.map((anchor, i) => {
    if (anchor.width === null) return null;
    for (const placement of PLACEMENT_ORDER) {
      const g = labelGeometry(placement, anchor.width, anchor.radius);
      const rect = { x0: anchor.x + g.rect.x0, x1: anchor.x + g.rect.x1, y0: anchor.y + g.rect.y0, y1: anchor.y + g.rect.y1 };
      if (rect.x0 < 0 || rect.x1 > plot.width || rect.y0 < 0 || rect.y1 > plot.height) continue;
      if (placed.some(p => overlaps(rect, p, LABEL_PAD_PX))) continue;
      const hitsDot = anchors.some((other, j) => j !== i && overlaps(
        rect, { x0: other.x - other.radius, x1: other.x + other.radius, y0: other.y - other.radius, y1: other.y + other.radius }, 0,
      ));
      if (hitsDot) continue;
      placed.push(rect);
      return placement;
    }
    return null;
  });
}

// Axes

const POPULATION_STEPS = [1, 2, 5];
const POPULATION_PAD = 1.08;
/** Round populations: 1, 2 and 5 times each power of ten up to 500 million, ascending. */
const ROUND_POPULATIONS = Array.from({ length: 9 }, (_, power) => POPULATION_STEPS.map(step => step * 10 ** power)).flat();

/**
 * A log axis for populations, in ln units: ticks at round populations (1, 2 and 5 times a power of ten) from
 * the last one below the smallest value to the first above the largest, so both have a little room.
 */
export function populationAxis(minLn: number, maxLn: number): NiceAxis {
  const [min, max] = [Math.exp(minLn) / POPULATION_PAD, Math.exp(maxLn) * POPULATION_PAD];
  const below = ROUND_POPULATIONS.filter(v => v <= min);
  const lo = below.length > 0 ? below[below.length - 1] : ROUND_POPULATIONS[0];
  const hi = ROUND_POPULATIONS.find(v => v >= max) ?? ROUND_POPULATIONS[ROUND_POPULATIONS.length - 1];
  const ticks = ROUND_POPULATIONS.filter(v => v >= lo && v <= hi).map(Math.log);
  return { lo: ticks[0], hi: ticks[ticks.length - 1], ticks };
}

/** Decimal places that show every tick of an evenly spaced axis the same way: 0 for steps of 1 or more, 1 for 0.5 or 0.2, 2 for 0.05. */
export function tickDecimals(ticks: number[]): number {
  if (ticks.length < 2) return 0;
  const step = Math.abs(ticks[1] - ticks[0]);
  return step >= 1 ? 0 : Math.ceil(-Math.log10(step) - 1e-9);
}

/** "500", "2k", "50k", "1m": a tick of a ln(population) axis. */
export function populationTickLabel(ln: number): string {
  const population = Math.round(Math.exp(ln));
  if (population >= 1_000_000) return `${+(population / 1_000_000).toFixed(1)}m`;
  if (population >= 1000) return `${+(population / 1000).toFixed(1)}k`;
  return String(population);
}

/**
 * The part of the line y = intercept + slope × x that lies inside the box, as two end points; null when none
 * of it does.
 */
export function clipLine(
  intercept: number, slope: number, xRange: [number, number], yRange: [number, number],
): [Pt, Pt] | null {
  let [from, to] = xRange;
  if (slope === 0) {
    if (intercept < yRange[0] || intercept > yRange[1]) return null;
  } else {
    const [a, b] = [(yRange[0] - intercept) / slope, (yRange[1] - intercept) / slope];
    from = Math.max(from, Math.min(a, b));
    to = Math.min(to, Math.max(a, b));
  }
  return from > to ? null : [{ x: from, y: intercept + slope * from }, { x: to, y: intercept + slope * to }];
}

// Mismatch scatter

export const SCATTER_HEIGHT = 440;
export const SCATTER_MARGIN = { top: 20, right: 28, bottom: 8, left: 8 };
export const SCATTER_Y_AXIS_WIDTH = 64;
export const SCATTER_X_AXIS_HEIGHT = 48;
/** Radius of a selected dot, and of the ring around one whose residual is flagged. */
export const SELECTED_RADIUS = 6;
export const RING_RADIUS = 11;
/** Longest name drawn on the scatter, in characters. */
export const SCATTER_NAME_CHARS = 24;
export const NAME_PX_PER_CHAR = 6.6;
/** Chart width assumed until the chart has been measured. */
export const DEFAULT_SCATTER_WIDTH = 900;

/** The plot area (inside the axes) of a scatter `chartWidth` pixels wide. */
export function scatterPlotSize(chartWidth: number) {
  return {
    width: Math.max(chartWidth - SCATTER_MARGIN.left - SCATTER_MARGIN.right - SCATTER_Y_AXIS_WIDTH, 100),
    height: SCATTER_HEIGHT - SCATTER_MARGIN.top - SCATTER_MARGIN.bottom - SCATTER_X_AXIS_HEIGHT,
  };
}

export interface ScatterDot {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Tooltip lines. */
  tooltip: string[];
}

export interface SelectedDot extends ScatterDot {
  color: string;
  expected: number;
  /** actual − expected, in percentage points. */
  residual: number;
  z: number;
  /** |z| >= 1: the residual is at least one residual SD, so the dot is ringed. */
  flagged: boolean;
  /** The name as drawn. */
  label: string;
  /** Where the name goes, or null when the dot is unnamed. */
  placement: LabelPlacement | null;
}

export interface MismatchChart {
  setting: Setting;
  heading: string;
  /** "R² 0.51 · n = 34". */
  subtitle: string;
  /** The legend entry of the grey dots: "Other metropolitan LGAs". */
  othersLabel: string;
  fit: LinearFit;
  /** The sentence shown instead of the plot when the model is too weak to use; null when the plot is shown. */
  weakMessage: string | null;
  xTitle: string;
  /** In ln(population) for non-metropolitan LGAs. */
  xAxis: NiceAxis;
  yAxis: NiceAxis;
  /** The fitted line, and the lines one residual SD above and below it, each as two end points. */
  fitLine: [Pt, Pt] | null;
  bandLines: [Pt, Pt][];
  /** Every other LGA of the setting. */
  others: ScatterDot[];
  selected: SelectedDot[];
  flaggedCount: number;
  /** Selected dots drawn without a name. */
  unnamedCount: number;
}

export interface MismatchChartsData {
  charts: MismatchChart[];
  /** Selected areas with no car dependency or no predictor. */
  noData: string[];
  /** Shown instead of the charts when there are none. */
  message: string | null;
}

const SETTINGS: Setting[] = ['metro', 'non_metro'];

/** The x axis of each setting's model: its predictor (P2-R4: the frequent-service catchment in Sydney). */
export const SETTING_TEXT: Record<Setting, { heading: string; group: string; xTitle: string }> = {
  metro: {
    heading: 'Metropolitan LGAs',
    group: 'metropolitan LGAs',
    xTitle: 'Residents near frequent public transport (%, straight-line distance)',
  },
  non_metro: { heading: 'Non-metropolitan LGAs', group: 'non-metropolitan LGAs', xTitle: 'Population (log scale)' },
};

/** A tick of a scatter's x axis: a share, or a population on the ln axis. */
export function predictorTickLabel(setting: Setting, value: number): string {
  return setting === 'metro' ? `${value}%` : populationTickLabel(value);
}

/** "+0.7" or "−2.0": a z-score with its sign, "0.0" when it shows as zero. */
function signedZ(z: number): string {
  const text = Math.abs(z).toFixed(1);
  return Number(text) === 0 ? '0.0' : `${z > 0 ? '+' : '−'}${text}`;
}

const carText = (value: number) => `${CAR.label} ${formatValue(CAR, value)}`;

/** "+6.0 pp above expected (z = +0.7)"; "level with expected" when the residual shows as zero. */
function residualText(residual: number, z: number): string {
  const signed = formatSignedDiff(CAR, residual);
  const against = signed === null ? 'level with expected' : `${signed} ${residual > 0 ? 'above' : 'below'} expected`;
  return `${against} (z = ${signedZ(z)})`;
}

/**
 * Car dependency against its setting's predictor for every LGA of the setting. Each setting with a selected
 * area gets a chart: the other LGAs as grey dots, the fitted line with a band of one residual SD either side,
 * and the selected areas coloured (selection order) and named, up to `MAX_LABELLED`, where a name fits. Flagged
 * dots (|z| >= 1) are named first, the largest |z| first, then the rest in selection order, so that with many
 * selected areas the names go to the outliers. A setting whose model is too weak to use gets the spec's sentence instead.
 */
export function mismatchChartData(a: NeedsAssessment, chartWidth = DEFAULT_SCATTER_WIDTH): MismatchChartsData {
  const entries = areaRecords(a).map(({ area, record }) => ({
    area,
    result: carDependencyMismatch(record, a.records),
    color: areaColor(a.areas.indexOf(area)),
  }));
  const noData = entries.filter(e => e.result === null).map(e => e.area.name);
  const selectedIds = new Set(a.areas.map(area => area.areaId));
  const plot = scatterPlotSize(chartWidth);

  const charts = SETTINGS.flatMap((setting): MismatchChart[] => {
    const inSetting = entries.filter(e => e.result?.fit.setting === setting);
    if (inSetting.length === 0) return [];
    const { fit, usable } = inSetting[0].result!;
    const text = SETTING_TEXT[setting];
    const base = {
      setting,
      heading: text.heading,
      subtitle: `R² ${fit.r2.toFixed(2)} · n = ${fit.n}`,
      othersLabel: `Other ${text.group}`,
      fit,
      xTitle: text.xTitle,
    };
    if (!usable) {
      return [{
        ...base,
        weakMessage: `The relationship in ${text.group} is too weak to estimate an expected value.`,
        xAxis: { lo: 0, hi: 1, ticks: [0, 1] },
        yAxis: { lo: 0, hi: 1, ticks: [0, 1] },
        fitLine: null,
        bandLines: [],
        others: [],
        selected: [],
        flaggedCount: 0,
        unnamedCount: 0,
      }];
    }

    const others = a.records.flatMap((r): ScatterDot[] => {
      const x = predictorOf(r, setting);
      const y = r.values.car_dependency?.value ?? null;
      if (settingOf(r.areaId) !== setting || selectedIds.has(r.areaId) || x === null || y === null) return [];
      return [{ id: r.areaId, name: r.name, x, y, tooltip: [r.name, carText(y)] }];
    });
    const selected: SelectedDot[] = inSetting.map(({ area, result, color }) => {
      const m = result!;
      const flagged = Math.abs(m.z) >= MISMATCH_FLAG_Z;
      return {
        id: area.areaId,
        name: area.name,
        x: m.x,
        y: m.actual,
        color,
        expected: m.expected,
        residual: m.residual,
        z: m.z,
        flagged,
        label: wrapLabel(area.name, SCATTER_NAME_CHARS, 1)[0],
        placement: null,
        tooltip: [area.name, carText(m.actual), `Expected ${formatValue(CAR, m.expected)}`, residualText(m.residual, m.z)],
      };
    });

    const dots = [...others, ...selected];
    const [minX, maxX] = [Math.min(...dots.map(d => d.x)), Math.max(...dots.map(d => d.x))];
    const [minY, maxY] = [Math.min(...dots.map(d => d.y)), Math.max(...dots.map(d => d.y))];
    const xAxis = setting === 'metro' ? niceAxis(minX, maxX, { floor: 0, cap: 100 }) : populationAxis(minX, maxX);
    const yAxis = niceAxis(minY, maxY, { floor: 0, cap: 100 });

    // Names go first to flagged dots, then in selection order (the sort is stable)
    const byNamingPriority = selected.map((_, i) => i)
      .sort((i, j) => (selected[j].flagged ? Math.abs(selected[j].z) : 0) - (selected[i].flagged ? Math.abs(selected[i].z) : 0));
    const named = new Set(labelledIds(byNamingPriority.map(i => selected[i].id)));
    const anchors: LabelAnchor[] = byNamingPriority.map(i => {
      const d = selected[i];
      return {
        x: ((d.x - xAxis.lo) / (xAxis.hi - xAxis.lo)) * plot.width,
        y: (1 - (d.y - yAxis.lo) / (yAxis.hi - yAxis.lo)) * plot.height,
        width: named.has(d.id) ? Math.min(d.label.length, SCATTER_NAME_CHARS) * NAME_PX_PER_CHAR : null,
        radius: d.flagged ? RING_RADIUS : SELECTED_RADIUS,
      };
    });
    const placements = placePointLabels(anchors, plot);
    byNamingPriority.forEach((i, k) => { selected[i].placement = placements[k]; });

    const line = (offset: number) => clipLine(fit.intercept + offset, fit.slope, [minX, maxX], [yAxis.lo, yAxis.hi]);
    return [{
      ...base,
      weakMessage: null,
      xAxis,
      yAxis,
      fitLine: line(0),
      bandLines: [line(fit.residualSd), line(-fit.residualSd)].flatMap(l => (l ? [l] : [])),
      others,
      selected,
      flaggedCount: selected.filter(d => d.flagged).length,
      unnamedCount: selected.filter(d => d.placement === null).length,
    }];
  });

  let message: string | null = null;
  if (charts.length === 0) {
    const members = a.mode === 'combined' ? a.memberIds : [];
    message = new Set(members.map(settingOf)).size > 1
      ? 'The combined area spans metropolitan and non-metropolitan LGAs, which have separate models, so no expected car dependency is shown.'
      : 'No car dependency data for the selected areas.';
  }
  return { charts, noData, message };
}

// Trend small multiples

export type TrendPanelId = 'car_dependency' | 'crash_rate' | 'population';

export interface TrendSeries {
  key: string;
  name: string;
  color: string;
  /** actual: solid; projected: dashed (DPE projection to 2041); median(-projected): the comparison group, dotted grey. */
  kind: 'actual' | 'projected' | 'median' | 'median-projected';
}

export interface TrendPanel {
  id: TrendPanelId;
  title: string;
  /** The metric as it reads in "No {trendName} trend: …". */
  trendName: string;
  /** What the panel shows, under its title. */
  note: string;
  /** Caveats under the chart. */
  notes: string[];
  xDomain: [number, number];
  xTicks: number[];
  yAxis: NiceAxis;
  /** One row per x, with a value under each series key that has a point there. */
  rows: Array<Record<string, number>>;
  series: TrendSeries[];
  /** Selected areas with no trend for this metric. */
  noData: string[];
}

export interface TrendData {
  panels: TrendPanel[];
  /** An entry per selected area when few enough to tell apart by colour; null when all are drawn in one colour. */
  areaLegend: Array<{ name: string; color: string }> | null;
  /** The comparison groups whose median is drawn, and how many further groups are not. */
  medianLegend: Array<{ name: string }>;
  omittedMedians: number;
  /** Some area has a projection to 2041. */
  hasProjection: boolean;
  /** Shown instead of the panels when there are none. */
  message: string | null;
}

/** The Trends figure's subtitle; the page passes it to the figure's wrapper (the component cannot set it). */
export const TREND_FIGURE_SUBTITLE = 'Selected LGAs against the median of the comparison group.';

/** Under the car dependency and crash panels: the line is not the statistic the findings quote (R49). */
export const MEDIAN_CHANGE_NOTE =
  "The findings quote the median of each LGA's own change, which can differ from the change in this line.";

/** Under the car dependency panel. */
export const LOCKDOWN_NOTE =
  "The 2021 Census was held during Sydney's COVID-19 lockdown, so 2021 car dependency is not directly comparable with earlier years.";

/** "Median of NSW LGAs in each year": the legend and series name of a comparison group's median line. */
const medianName = (universeLabel: string) => `Median of ${universeLabel} in each year`;

/** Median lines: grey, set apart from the area colours. */
export const MEDIAN_COLOR = '#6b7280';
/** The colour of every selected area when there are too many to tell apart. */
export const MANY_AREAS_COLOR = areaColor(0);
/** Most median lines drawn; each is one comparison group. */
export const MAX_MEDIAN_LINES = 3;

const POPULATION_TICKS = [2021, 2025, 2030, 2035, 2041];
const TREND_Y_TICKS = 5;

/** A record's points on one panel: ERP years / crash years / Census years, and a projection to 2041 (population). */
interface AreaPoints { actual: Pt[]; projected: Pt[] }
type PointsOf = (record: SeriesRecord) => AreaPoints;

const toIndex = (population: number, base: number) => (population / base) * 100;

const POINTS: Record<TrendPanelId, PointsOf> = {
  car_dependency: record => ({
    actual: record.series.carDependencyByYear.map(p => ({ x: p.year, y: p.value })),
    projected: [],
  }),
  // Each year's crashes on that year's ERP, as the crash_rate indicator and the trend sentence (R46)
  crash_rate: record => ({
    actual: record.series.crashesByYear.flatMap(c => {
      const rate = crashRate(record.series, c.year);
      return rate === null ? [] : [{ x: c.year, y: rate }];
    }),
    projected: [],
  }),
  // Index of 2021 = 100 (R39): ERP years, and the DPE projection as the line from the 2021 base to 2041
  population: record => {
    const base = populationIn(record.series, BASE_YEAR);
    if (base === null) return { actual: [], projected: [] };
    const projected = record.series.population2041;
    return {
      actual: record.series.populationHistory
        .filter(p => p.year >= BASE_YEAR && p.population > 0)
        .map(p => ({ x: p.year, y: toIndex(p.population, base) })),
      projected: projected !== null && projected > 0
        ? [{ x: BASE_YEAR, y: 100 }, { x: PROJECTION_YEAR, y: toIndex(projected, base) }]
        : [],
    };
  },
};

/** A trend needs two points to be a line; the projection counts as the second point of an index. */
const hasTrend = (p: AreaPoints) => p.actual.length + (p.projected.length > 0 ? 1 : 0) >= 2;

const PANEL_TEXT: Record<TrendPanelId, { title: string; trendName: string; note: string; notes: string[] }> = {
  car_dependency: {
    title: 'Car dependency',
    trendName: 'car dependency',
    note: 'Share of people who travelled to work who went by car (Census; work from home excluded)',
    notes: [LOCKDOWN_NOTE, MEDIAN_CHANGE_NOTE],
  },
  crash_rate: {
    title: 'Road crashes per 10,000 residents',
    trendName: 'crash rate',
    note: "Each year's crashes on that year's population (ABS ERP)",
    notes: [MEDIAN_CHANGE_NOTE],
  },
  population: {
    title: 'Population (2021 = 100)',
    trendName: 'population',
    note: 'Solid: ABS ERP. Dashed: NSW DPE projection to 2041.',
    notes: [],
  },
};

/** A trend value as the indicator shows it ("83.8%", "20.4 per 10,000"); an index to one decimal. */
export function formatTrendValue(id: TrendPanelId, value: number): string {
  if (id === 'car_dependency') return formatValue(CAR, value);
  if (id === 'crash_rate') return formatValue(CRASH, value);
  return value.toFixed(1);
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length / 2;
  return sorted.length % 2 === 1 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * One small chart per metric that some selected area has a trend for: car dependency (Census years), crashes
 * per 10,000 (each year on its own ERP, R46) and a population index with 2021 = 100 to 2041 (R39). Each
 * selected area is a line; the median of each comparison group (at most `MAX_MEDIAN_LINES`) is drawn over a
 * fixed set of its LGAs, those with a value in every year the panel shows, so the line's change is not the effect
 * of LGAs entering or leaving the median (R49).
 */
export function trendData(a: NeedsAssessment): TrendData {
  const areas = areaRecords(a);
  const uniform = a.areas.length > AREA_PALETTE_SIZE;

  // One median line per distinct comparison group, in the order the areas first name one
  const groups: Array<{ label: string; records: SeriesRecord[] }> = [];
  for (const { area } of areas) {
    if (!groups.some(g => g.label === area.universeLabel)) {
      groups.push({ label: area.universeLabel, records: universeRecords(a.records, area.universe, area) });
    }
  }
  const medianGroups = groups.slice(0, MAX_MEDIAN_LINES);

  const panels = (Object.keys(POINTS) as TrendPanelId[]).flatMap((id): TrendPanel[] => {
    const own = areas.map(({ area, record }) => ({ area, points: POINTS[id](record), slot: a.areas.indexOf(area) }));
    const shown = own.filter(o => hasTrend(o.points));
    if (shown.length === 0) return [];

    const rows = new Map<number, Record<string, number>>();
    const put = (key: string, p: Pt) => {
      const row = rows.get(p.x) ?? { x: p.x };
      row[key] = p.y;
      rows.set(p.x, row);
    };
    const series: TrendSeries[] = [];

    for (const { area, points, slot } of shown) {
      const color = uniform ? MANY_AREAS_COLOR : areaColor(slot);
      series.push({ key: `a${slot}`, name: area.name, color, kind: 'actual' });
      points.actual.forEach(p => put(`a${slot}`, p));
      if (points.projected.length > 0) {
        series.push({ key: `a${slot}p`, name: area.name, color, kind: 'projected' });
        points.projected.forEach(p => put(`a${slot}p`, p));
      }
    }

    const xs = Array.from(rows.keys());
    medianGroups.forEach((group, g) => {
      const name = medianName(group.label);
      const valueAt = (p: AreaPoints, x: number) => (p.actual.find(q => q.x === x) ?? p.projected.find(q => q.x === x))?.y;
      // The same LGAs in every year: those with a value in each year shown
      const fixed = group.records.map(POINTS[id]).filter(p => xs.every(x => valueAt(p, x) !== undefined));
      const at = (pick: (p: AreaPoints) => Pt[], x: number) =>
        fixed.flatMap(p => pick(p).filter(q => q.x === x).map(q => q.y));
      const actualXs = xs.filter(x => at(p => p.actual, x).length > 0);
      if (actualXs.length > 0) series.push({ key: `m${g}`, name, color: MEDIAN_COLOR, kind: 'median' });
      actualXs.forEach(x => put(`m${g}`, { x, y: medianOf(at(p => p.actual, x)) }));
      if (shown.some(o => o.points.projected.length > 0)) {
        const end = at(p => p.projected, PROJECTION_YEAR);
        if (end.length > 0) {
          series.push({ key: `m${g}p`, name, color: MEDIAN_COLOR, kind: 'median-projected' });
          put(`m${g}p`, { x: BASE_YEAR, y: 100 });
          put(`m${g}p`, { x: PROJECTION_YEAR, y: medianOf(end) });
        }
      }
    });

    const sorted = Array.from(rows.values()).sort((p, q) => p.x - q.x);
    const values = sorted.flatMap(row => Object.entries(row).filter(([key]) => key !== 'x').map(([, v]) => v));
    const [min, max] = [Math.min(...values), Math.max(...values)];
    const ticks = id === 'population'
      ? (series.some(s => s.kind === 'projected') ? POPULATION_TICKS : sorted.map(r => r.x))
      : sorted.map(r => r.x);
    return [{
      id,
      ...PANEL_TEXT[id],
      xDomain: [ticks[0], ticks[ticks.length - 1]],
      xTicks: ticks,
      // Few ticks: a panel is short, and Recharts hides the ones that crowd (leaving an uneven axis)
      yAxis: niceAxis(min, max, { floor: min >= 0 ? 0 : undefined, cap: id === 'car_dependency' ? 100 : undefined }, TREND_Y_TICKS),
      rows: sorted,
      series,
      noData: own.filter(o => !hasTrend(o.points)).map(o => o.area.name),
    }];
  });

  return {
    panels,
    areaLegend: uniform ? null : areas.map(({ area }) => ({ name: area.name, color: areaColor(a.areas.indexOf(area)) })),
    medianLegend: medianGroups.map(g => ({ name: medianName(g.label) })),
    omittedMedians: groups.length - medianGroups.length,
    hasProjection: panels.some(p => p.series.some(s => s.kind === 'projected')),
    message: panels.length === 0 ? 'No trend data for the selected areas.' : null,
  };
}

// Growth against service

export interface GrowthRow {
  id: string;
  name: string;
  now: number;
  in2041: number;
  nowText: string;
  in2041Text: string;
}

export interface GrowthChartData {
  /** The larger departures per 1,000 today first. */
  rows: GrowthRow[];
  noData: string[];
  /** "Today (2025 population)": the series name for the first bar. */
  nowLabel: string;
  axis: NiceAxis;
  height: number;
  /** Shown instead of the chart when there are no rows. */
  message: string | null;
}

export const GROWTH_BAR_PX = 14;
export const GROWTH_BAR_GAP_PX = 2;
export const GROWTH_CATEGORY_GAP_PX = 14;
const GROWTH_GROUP_PX = 2 * GROWTH_BAR_PX + GROWTH_BAR_GAP_PX + GROWTH_CATEGORY_GAP_PX;

/**
 * AM-peak departures per 1,000 residents today (the latest ERP year) and in 2041 at today's service, for each
 * selected area that has both (`growthVsService`).
 */
export function growthServiceChartData(a: NeedsAssessment): GrowthChartData {
  const entries = areaRecords(a).map(({ area, record }) => ({ area, record, g: growthVsService(record) }));
  const rows = entries
    .flatMap(({ area, g }): GrowthRow[] => (g ? [{
      id: area.areaId,
      name: area.name,
      now: g.per1000Now,
      in2041: g.per1000In2041,
      nowText: g.per1000Now.toFixed(DEPARTURES.decimals),
      in2041Text: g.per1000In2041.toFixed(DEPARTURES.decimals),
    }] : []))
    // Array.prototype.sort is stable: equal rates keep the selection order.
    .sort((x, y) => y.now - x.now);

  const years = Array.from(new Set(entries.flatMap(({ record, g }) => (g ? [latestPopulation(record.series)!.year] : []))));
  const max = Math.max(0, ...rows.flatMap(r => [r.now, r.in2041]));
  return {
    rows,
    noData: entries.filter(e => e.g === null).map(e => e.area.name),
    nowLabel: years.length === 1 ? `Today (${years[0]} population)` : 'Today (latest population estimate)',
    axis: niceAxis(0, max, { floor: 0 }),
    height: rowsHeight(rows.length, GROWTH_GROUP_PX, 90, 220),
    message: rows.length === 0 ? 'No AM-peak service or 2041 population projection data for the selected LGAs.' : null,
  };
}

// Jobs-housing balance

export interface JobsRow {
  id: string;
  name: string;
  /** Position from the top, 0-based. */
  index: number;
  y2021: number;
  y2041: number;
  text2021: string;
  text2041: string;
}

export interface JobsChartData {
  /** The highest jobs per resident in 2021 first. */
  rows: JobsRow[];
  noData: string[];
  /** The footnote counting the selected areas without TZP24 data; null when there are none. */
  note: string | null;
  xAxis: NiceAxis;
  height: number;
  message: string | null;
}

export const JOBS_ROW_PX = 28;

/** TZP24 jobs per resident in 2021 and 2041 for each selected area that has both (`jobsHousing`). */
export function jobsHousingChartData(a: NeedsAssessment): JobsChartData {
  const entries = areaRecords(a).map(({ area, record }) => ({ area, j: jobsHousing(record) }));
  const sorted = entries
    .flatMap(({ area, j }) => (j ? [{ area, j }] : []))
    .sort((x, y) => y.j.jobsPerResident2021 - x.j.jobsPerResident2021);
  const rows: JobsRow[] = sorted.map(({ area, j }, i) => ({
    id: area.areaId,
    name: area.name,
    index: i,
    y2021: j.jobsPerResident2021,
    y2041: j.jobsPerResident2041,
    text2021: j.jobsPerResident2021.toFixed(2),
    text2041: j.jobsPerResident2041.toFixed(2),
  }));
  const noData = entries.filter(e => e.j === null).map(e => e.area.name);
  const max = Math.max(0, ...rows.flatMap(r => [r.y2021, r.y2041]));
  return {
    rows,
    noData,
    note: rows.length > 0 ? noDataNote(noData, entries.length, 'TZP24 job projections') : null,
    xAxis: niceAxis(0, max, { floor: 0 }),
    height: rowsHeight(rows.length, JOBS_ROW_PX, 110, 200),
    message: rows.length === 0 ? 'No TZP24 job projections for the selected LGAs.' : null,
  };
}
