import { domainChartAreas, stripData } from './chart-data';
import { displayScore } from './format';
import { DOMAIN_LABELS, INDICATORS, INDICATOR_BY_ID, NEED_DOMAINS } from './indicators';
import {
  growthServiceChartData, jobsHousingChartData, mismatchChartData, trendData, type TrendPanelId, type TrendSeries,
} from './insight-chart-data';
import { mapScores } from './map-data';
import { inNeedQuadrant, quadrantPanels, radarData, typicalLabel, type QuadrantSpec } from './project-need';
import { needPercentile } from './scoring';
import type { AreaAssessment, IndicatorDef, IndicatorId, NeedsAssessment } from './types';

/**
 * The Excel data of every figure on /needs (R64), built from the same data shapers as the figures, as numbers rather
 * than formatted text. Values are rounded as the page shows them (an indicator's decimals; percentiles and scores
 * floored), so a number pasted from the sheet matches the page. Missing values are blank cells (null), never 0.
 */

export type ExcelCell = string | number | null;

/** ChartWrapper's Excel props: the records, the first column, the other columns in order, and their headers. */
export interface FigureExcel {
  /** One record per row; every record has every column. */
  data: Array<Record<string, ExcelCell>>;
  xAxisKey: string;
  dataKeys: string[];
  headerLabels: Record<string, string>;
}

export interface ExcelColumn<R> { key: string; header: string; value: (row: R) => ExcelCell }

/** A sheet of `rows` with `columns`, the first column being the row label. Every record carries every column. */
export function excelOf<R>(rows: R[], columns: ExcelColumn<R>[]): FigureExcel {
  return {
    data: rows.map(row => Object.fromEntries(columns.map(c => [c.key, c.value(row)]))),
    xAxisKey: columns[0].key,
    dataKeys: columns.slice(1).map(c => c.key),
    headerLabels: Object.fromEntries(columns.map(c => [c.key, c.header])),
  };
}

const roundTo = (value: number | null | undefined, decimals: number): number | null => (
  value === null || value === undefined || !Number.isFinite(value) ? null : Number(value.toFixed(decimals))
);
const floored = (value: number | null | undefined): number | null => (
  value === null || value === undefined ? null : displayScore(value)
);
const yesNo = (flag: boolean): 'Y' | 'N' => (flag ? 'Y' : 'N');
/** An indicator as a column heading: "Car dependency (%)". */
const withUnit = (def: IndicatorDef) => `${def.label} (${def.unit})`;

// Indicator table and heatmap

/**
 * Every indicator (domain, label, unit), then for each selected area, Greater Sydney and NSW: the value, the need
 * percentile (floored), and whether the value is approximate, partial or not ranked; then the source. The heatmap's
 * cells are these.
 */
export function indicatorTableExcel(a: NeedsAssessment): FigureExcel {
  const columns: AreaAssessment[] = [...a.areas, a.benchmarks.gsyd, a.benchmarks.nsw];
  const scoreOf = (area: AreaAssessment, id: IndicatorId) => area.indicators.find(s => s.id === id);
  return excelOf(INDICATORS, [
    { key: 'domain', header: 'Domain', value: def => DOMAIN_LABELS[def.domain] },
    { key: 'indicator', header: 'Indicator', value: def => (def.scored ? def.label : `${def.label} (context)`) },
    { key: 'unit', header: 'Unit', value: def => def.unit },
    ...columns.flatMap((area, i): ExcelColumn<IndicatorDef>[] => [
      { key: `c${i}_value`, header: `${area.name} value`, value: def => roundTo(scoreOf(area, def.id)?.value, def.decimals) },
      { key: `c${i}_percentile`, header: `${area.name} percentile`, value: def => floored(scoreOf(area, def.id)?.percentile) },
      { key: `c${i}_approximate`, header: `${area.name} approximate (Y/N)`, value: def => yesNo(!!scoreOf(area, def.id)?.approximate) },
      { key: `c${i}_partial`, header: `${area.name} partial (Y/N)`, value: def => yesNo(!!scoreOf(area, def.id)?.partial) },
      { key: `c${i}_unranked`, header: `${area.name} not ranked (Y/N)`, value: def => yesNo(!!scoreOf(area, def.id)?.unranked) },
    ]),
    { key: 'source', header: 'Source', value: def => def.source.short },
  ]);
}

// Need map

/** Every NSW LGA with its overall need score (floored) and band against the universe used, or why it has none. */
export function needMapExcel(a: NeedsAssessment): FigureExcel {
  const scores = mapScores(a);
  return excelOf(a.records, [
    { key: 'lga', header: 'LGA', value: r => r.name },
    { key: 'score', header: 'Overall need score', value: r => floored(scores.get(r.areaId)?.score) },
    { key: 'band', header: 'Band', value: r => scores.get(r.areaId)?.band ?? null },
    { key: 'reason', header: 'Not scored because', value: r => scores.get(r.areaId)?.noScoreReason ?? null },
  ]);
}

// Domain scores

/** The domain chart's areas (and Greater Sydney where it is drawn), each with its domain scores floored. */
export function domainScoresExcel(a: NeedsAssessment): FigureExcel {
  return excelOf(domainChartAreas(a), [
    { key: 'area', header: 'Area', value: area => area.name },
    ...NEED_DOMAINS.map((domain): ExcelColumn<AreaAssessment> => ({
      key: domain,
      header: DOMAIN_LABELS[domain],
      value: area => floored(area.domains.find(d => d.domain === domain)?.score),
    })),
  ]);
}

// Need profile radar

/** One row per axis: each drawn series' need percentile (floored; blank for a gap) and the typical LGA's 50. */
export function radarExcel(a: NeedsAssessment): FigureExcel {
  const { rows, series } = radarData(a);
  return excelOf(rows, [
    { key: 'axis', header: 'Axis', value: row => row.axis },
    ...series.map((s): ExcelColumn<(typeof rows)[number]> => ({
      key: s.key, header: s.name, value: row => floored(row[s.key] as number | null),
    })),
    { key: 'typical', header: typicalLabel(a), value: row => row.typical },
  ]);
}

// Quadrant scatters

interface QuadrantRow {
  group: string;
  area: string;
  point: 'Selected area' | 'Other LGA' | 'Greater Sydney';
  x: number | null;
  y: number | null;
  medians: { x: number; y: number };
}

/**
 * Every point of every panel drawn: the selected areas, Greater Sydney where it is marked and the other LGAs of the
 * group, with whether each is in the need quadrant and the group's medians.
 */
export function quadrantExcel(a: NeedsAssessment, spec: QuadrantSpec): FigureExcel {
  const xDef = INDICATOR_BY_ID[spec.x];
  const yDef = INDICATOR_BY_ID[spec.y];
  const rows = quadrantPanels(a, spec).panels.flatMap(({ group, data }): QuadrantRow[] => [
    ...data.selected.map(s => ({ group: group.label, area: s.name, point: 'Selected area' as const, x: s.x, y: s.y, medians: data.medians })),
    ...(data.greaterSydney
      ? [{ group: group.label, area: a.benchmarks.gsyd.name, point: 'Greater Sydney' as const, ...data.greaterSydney, medians: data.medians }]
      : []),
    ...data.points.map(p => ({ group: group.label, area: p.name, point: 'Other LGA' as const, x: p.x, y: p.y, medians: data.medians })),
  ]);
  return excelOf(rows, [
    { key: 'group', header: 'Comparison group', value: r => r.group },
    { key: 'area', header: 'Area', value: r => r.area },
    { key: 'point', header: 'Point', value: r => r.point },
    { key: 'x', header: withUnit(xDef), value: r => roundTo(r.x, xDef.decimals) },
    { key: 'y', header: withUnit(yDef), value: r => roundTo(r.y, yDef.decimals) },
    {
      key: 'inQuadrant',
      header: 'In need quadrant (Y/N)',
      value: r => yesNo(r.x !== null && r.y !== null && inNeedQuadrant(spec, r.x, r.y, r.medians)),
    },
    { key: 'medianX', header: `Group median: ${xDef.label}`, value: r => roundTo(r.medians.x, xDef.decimals) },
    { key: 'medianY', header: `Group median: ${yDef.label}`, value: r => roundTo(r.medians.y, yDef.decimals) },
  ]);
}

// Strip plots

/**
 * One indicator across NSW: the selected areas, Greater Sydney, NSW and every other LGA with a value, each with its need
 * percentile among the NSW LGAs with data (floored), the scale the strip is drawn on.
 */
export function stripExcel(a: NeedsAssessment, id: IndicatorId): FigureExcel {
  const def = INDICATOR_BY_ID[id];
  const { selected, references, others } = stripData(a, id);
  const distribution = a.records.flatMap(r => (r.values[id]?.value ?? null) === null ? [] : [r.values[id].value as number]);
  const rows = [
    ...selected.map(p => ({ area: p.name, point: 'Selected area', x: p.x })),
    ...references.map(r => ({ area: r.name, point: r.name, x: r.x })),
    ...others.map(p => ({ area: p.name, point: 'Other LGA', x: p.x })),
  ];
  return excelOf(rows, [
    { key: 'area', header: 'Area', value: r => r.area },
    { key: 'point', header: 'Point', value: r => r.point },
    { key: 'value', header: withUnit(def), value: r => roundTo(r.x, def.decimals) },
    {
      key: 'percentile',
      header: 'Need percentile among NSW LGAs with data',
      value: r => (distribution.length > 0 ? floored(needPercentile(r.x, distribution, def.direction)) : null),
    },
  ]);
}

// Car dependency against expected

const CAR = INDICATOR_BY_ID.car_dependency;
const STOPS = INDICATOR_BY_ID.frequent_stop_share;
const SETTING_NAMES = { metro: 'Metropolitan', non_metro: 'Non-metropolitan' } as const;

/**
 * Every LGA on each chart whose model is strong enough to draw: its car dependency, the expected value, the residual
 * and z, with the predictor (frequent-stop share in Sydney; elsewhere the population, the model being on its log).
 */
export function mismatchExcel(a: NeedsAssessment): FigureExcel {
  const rows = mismatchChartData(a).charts.filter(chart => chart.weakMessage === null).flatMap(chart => {
    const { fit, setting } = chart;
    const expectedAt = (x: number) => fit.intercept + fit.slope * x;
    const z = (residual: number) => (fit.residualSd > 0 ? residual / fit.residualSd : 0);
    return [
      ...chart.selected.map(d => ({ setting, name: d.name, selected: true, x: d.x, actual: d.y, expected: d.expected, residual: d.residual, z: d.z })),
      ...chart.others.map(d => {
        const expected = expectedAt(d.x);
        return { setting, name: d.name, selected: false, x: d.x, actual: d.y, expected, residual: d.y - expected, z: z(d.y - expected) };
      }),
    ];
  });
  return excelOf(rows, [
    { key: 'setting', header: 'Setting', value: r => SETTING_NAMES[r.setting] },
    { key: 'lga', header: 'LGA', value: r => r.name },
    { key: 'selected', header: 'Selected (Y/N)', value: r => yesNo(r.selected) },
    { key: 'stopShare', header: withUnit(STOPS), value: r => (r.setting === 'metro' ? roundTo(r.x, STOPS.decimals) : null) },
    { key: 'population', header: 'Population', value: r => (r.setting === 'non_metro' ? Math.round(Math.exp(r.x)) : null) },
    { key: 'actual', header: withUnit(CAR), value: r => roundTo(r.actual, CAR.decimals) },
    { key: 'expected', header: `Expected car dependency (${CAR.unit})`, value: r => roundTo(r.expected, CAR.decimals) },
    { key: 'residual', header: 'Residual (pp)', value: r => roundTo(r.residual, CAR.decimals) },
    { key: 'z', header: 'z', value: r => roundTo(r.z, 1) },
  ]);
}

// Trends

const LINE_NAMES: Record<TrendSeries['kind'], string> = {
  actual: 'Actual',
  projected: 'Projected (NSW DPE)',
  median: 'Median',
  'median-projected': 'Median (projected)',
};
/** Car dependency and crash rates at their indicators' decimals; the population index to one decimal, as drawn. */
const TREND_DECIMALS: Record<TrendPanelId, number> = { car_dependency: 1, crash_rate: 1, population: 1 };

/** A row per metric, year and line: each selected area (actual, and the projection to 2041) and each group median. */
export function trendsExcel(a: NeedsAssessment): FigureExcel {
  const rows = trendData(a).panels.flatMap(panel => panel.rows.flatMap(row => panel.series.flatMap(s => (
    row[s.key] === undefined
      ? []
      : [{ metric: panel.title, year: row.x, series: s.name, line: LINE_NAMES[s.kind], value: roundTo(row[s.key], TREND_DECIMALS[panel.id]) }]
  ))));
  return excelOf(rows, [
    { key: 'metric', header: 'Metric', value: r => r.metric },
    { key: 'year', header: 'Year', value: r => r.year },
    { key: 'series', header: 'Series', value: r => r.series },
    { key: 'line', header: 'Line', value: r => r.line },
    { key: 'value', header: 'Value', value: r => r.value },
  ]);
}

// Growth against service, jobs-housing balance

const DEPARTURES = INDICATOR_BY_ID.am_peak_departures_per_1000;

/** The chart's rows: AM-peak departures per 1,000 residents today and in 2041 at today's service. */
export function growthServiceExcel(a: NeedsAssessment): FigureExcel {
  const { rows, nowLabel } = growthServiceChartData(a);
  return excelOf(rows, [
    { key: 'area', header: 'Area', value: r => r.name },
    { key: 'now', header: `AM-peak departures per 1,000 residents: ${nowLabel}`, value: r => roundTo(r.now, DEPARTURES.decimals) },
    {
      key: 'in2041',
      header: "AM-peak departures per 1,000 residents: 2041 at today's service",
      value: r => roundTo(r.in2041, DEPARTURES.decimals),
    },
  ]);
}

/** The chart's rows: TZP24 local jobs per resident in 2021 and 2041, to two decimals as drawn. */
export function jobsHousingExcel(a: NeedsAssessment): FigureExcel {
  return excelOf(jobsHousingChartData(a).rows, [
    { key: 'area', header: 'Area', value: r => r.name },
    { key: 'y2021', header: 'Local jobs per resident, 2021', value: r => roundTo(r.y2021, 2) },
    { key: 'y2041', header: 'Local jobs per resident, 2041', value: r => roundTo(r.y2041, 2) },
  ]);
}
