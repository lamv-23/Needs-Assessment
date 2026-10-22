import { axisFraction, niceAxis, wrapLabel, type NiceAxis } from './chart-data';
import { areaColor, labelledIds } from './colors';
import { formatValue } from './format';
import { INDICATOR_BY_ID } from './indicators';
import {
  DEFAULT_SCATTER_WIDTH, NAME_PX_PER_CHAR, SCATTER_NAME_CHARS, SELECTED_RADIUS, nameList, noDataNote, placePointLabels,
  scatterPlotSize, type LabelAnchor, type LabelPlacement,
} from './insight-chart-data';
import { groupLabel, quadrantData, type QuadrantSpec } from './project-need';
import type { IndicatorDef, NeedsAssessment } from './types';

/**
 * The quadrant scatters as drawn: axes, the shaded need quadrant, tooltips and where the names go. Kept apart from
 * `project-need.ts` because name placement builds on the Part B insight charts, which build on the insights, which
 * use `project-need.ts`.
 */

/** Radius of the Greater Sydney marker. */
export const GREATER_SYDNEY_RADIUS = 7;

export interface QuadrantDot {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Tooltip lines. */
  tooltip: string[];
}

export interface QuadrantSelectedDot extends QuadrantDot {
  color: string;
  inNeedQuadrant: boolean;
  /** The name as drawn. */
  label: string;
  /** Where the name goes, or null when the dot is unnamed. */
  placement: LabelPlacement | null;
}

export interface QuadrantMarker extends QuadrantDot {
  placement: LabelPlacement | null;
}

export interface QuadrantChart {
  spec: QuadrantSpec;
  xTitle: string;
  yTitle: string;
  xReversed: boolean;
  xAxis: NiceAxis;
  yAxis: NiceAxis;
  /** The comparison group's medians, in data units and as shown; null when the group has none. */
  medians: { x: number; y: number; xText: string; yText: string } | null;
  /** The shaded need quadrant, in data units (the median to the end of the axis on the "more need" side); null without medians. */
  quadrant: { x1: number; x2: number; y1: number; y2: number } | null;
  /** The comparison group(s), as in a sentence: "NSW LGAs". */
  groupLabel: string;
  /** The group's LGAs with both values, less the selected areas. */
  others: QuadrantDot[];
  selected: QuadrantSelectedDot[];
  greaterSydney: QuadrantMarker | null;
  /** "2 of 5 selected LGAs have no ... and are not shown: A and B."; null when every selected area is plotted. */
  noDataText: string | null;
  /** Which of the selected areas are in the need quadrant, as a sentence for the note under the chart. */
  inQuadrantText: string;
  /** Plotted areas drawn without a name. */
  unnamedCount: number;
  /** Shown instead of the plot when there is nothing to plot. */
  message: string | null;
}

const X_TITLES: Record<QuadrantSpec['id'], string> = {
  'growth-service': `${INDICATOR_BY_ID.pop_growth_2041.label} (%): more growth →`,
  'disadvantage-service': 'SEIFA disadvantage (IRSD) score: more disadvantage →',
};

/** What a selected area is missing, as it reads in "has no {what}". */
const MISSING: Record<QuadrantSpec['id'], string> = {
  'growth-service': 'population growth or AM-peak service data',
  'disadvantage-service': 'SEIFA or AM-peak service data',
};

/** "A and B are in the shaded group." / "None of the selected areas is in the shaded group." */
function inQuadrantText(names: string[]): string {
  if (names.length === 0) return 'None of the selected areas is in the shaded group.';
  return `${nameList(names)} ${names.length === 1 ? 'is' : 'are'} in the shaded group.`;
}

/** The part of `axis` on the "more need" side of `median` for `def`. */
function moreNeedBounds(def: IndicatorDef, median: number, axis: NiceAxis): [number, number] {
  return def.direction === 'higher' ? [median, axis.hi] : [axis.lo, median];
}

/** A value as the tooltip shows it: indicator units for x, a bare number of departures for y. */
const bareValue = (def: IndicatorDef, value: number) => value.toFixed(def.decimals);

/**
 * One quadrant scatter for `chartWidth` pixels: the comparison group in grey, the selected areas coloured (selection
 * order) with the first `MAX_LABELLED` named where a name fits (areas in the need quadrant first), the group's medians
 * and the need quadrant, and Greater Sydney as a marker. The x axis is reversed for SEIFA, so more need is always to
 * the right and low service is always at the bottom.
 */
export function quadrantChartData(a: NeedsAssessment, spec: QuadrantSpec, chartWidth = DEFAULT_SCATTER_WIDTH): QuadrantChart {
  const data = quadrantData(a, spec);
  const [xDef, yDef] = [INDICATOR_BY_ID[spec.x], INDICATOR_BY_ID[spec.y]];
  const tooltip = (name: string, x: number, y: number, approximate = false) => [
    name,
    `${xDef.label}: ${approximate ? '≈ ' : ''}${formatValue(xDef, x)}`,
    `${yDef.label}: ${bareValue(yDef, y)}`,
  ];

  const others: QuadrantDot[] = data.points.map(p => ({ id: p.areaId, name: p.name, x: p.x, y: p.y, tooltip: tooltip(p.name, p.x, p.y) }));
  const plotted = data.selected.flatMap((s, index) => {
    if (s.x === null || s.y === null) return [];
    const approximate = a.areas[index].indicators.find(score => score.id === spec.x)?.approximate ?? false;
    return [{
      id: s.areaId,
      name: s.name,
      x: s.x,
      y: s.y,
      color: areaColor(index),
      inNeedQuadrant: s.inNeedQuadrant,
      label: wrapLabel(s.name, SCATTER_NAME_CHARS, 1)[0],
      placement: null as LabelPlacement | null,
      tooltip: tooltip(s.name, s.x, s.y, approximate),
    }];
  });
  const gsyd = data.greaterSydney;
  const medians = Number.isFinite(data.medians.x) && Number.isFinite(data.medians.y) ? data.medians : null;

  const base = {
    spec,
    xTitle: X_TITLES[spec.id],
    yTitle: yDef.label,
    xReversed: data.xReversed,
    groupLabel: groupLabel(a.areas),
    noDataText: noDataNote(
      data.selected.filter(s => s.x === null || s.y === null).map(s => s.name),
      a.areas.length,
      MISSING[spec.id],
    ),
  };

  const xs = [...others, ...plotted].map(d => d.x).concat(gsyd ? [gsyd.x] : [], medians ? [medians.x] : []);
  const ys = [...others, ...plotted].map(d => d.y).concat(gsyd ? [gsyd.y] : [], medians ? [medians.y] : []);
  if (xs.length === 0) {
    return {
      ...base,
      xAxis: { lo: 0, hi: 1, ticks: [0, 1] },
      yAxis: { lo: 0, hi: 1, ticks: [0, 1] },
      medians: null,
      quadrant: null,
      others: [],
      selected: [],
      greaterSydney: null,
      inQuadrantText: inQuadrantText([]),
      unnamedCount: 0,
      message: `There is no ${MISSING[spec.id]} to plot for the selected areas.`,
    };
  }

  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const xAxis = niceAxis(minX, maxX, { floor: minX >= 0 ? 0 : undefined });
  const yAxis = niceAxis(Math.min(...ys), Math.max(...ys), { floor: 0 });

  // Names go first to the areas in the need quadrant, then in selection order (the sort is stable)
  const byNamingPriority = plotted.map((_, i) => i)
    .sort((i, j) => Number(plotted[j].inNeedQuadrant) - Number(plotted[i].inNeedQuadrant));
  const named = new Set(labelledIds(byNamingPriority.map(i => plotted[i].id)));
  const plot = scatterPlotSize(chartWidth);
  const anchorAt = (x: number, y: number, width: number | null, radius: number): LabelAnchor => ({
    x: axisFraction(xAxis, data.xReversed, x) * plot.width,
    y: (1 - (y - yAxis.lo) / (yAxis.hi - yAxis.lo)) * plot.height,
    width,
    radius,
  });
  const gsydName = a.benchmarks.gsyd.name;
  const placements = placePointLabels([
    ...byNamingPriority.map(i => {
      const d = plotted[i];
      return anchorAt(d.x, d.y, named.has(d.id) ? Math.min(d.label.length, SCATTER_NAME_CHARS) * NAME_PX_PER_CHAR : null, SELECTED_RADIUS);
    }),
    ...(gsyd ? [anchorAt(gsyd.x, gsyd.y, gsydName.length * NAME_PX_PER_CHAR, GREATER_SYDNEY_RADIUS)] : []),
  ], plot);
  byNamingPriority.forEach((i, k) => { plotted[i].placement = placements[k]; });

  let quadrant: QuadrantChart['quadrant'] = null;
  if (medians) {
    const [x1, x2] = moreNeedBounds(xDef, medians.x, xAxis);
    const [y1, y2] = moreNeedBounds(yDef, medians.y, yAxis);
    quadrant = { x1, x2, y1, y2 };
  }

  return {
    ...base,
    xAxis,
    yAxis,
    medians: medians && {
      ...medians,
      xText: formatValue(xDef, medians.x),
      yText: bareValue(yDef, medians.y),
    },
    quadrant,
    others,
    selected: plotted,
    greaterSydney: gsyd && {
      id: a.benchmarks.gsyd.areaId,
      name: gsydName,
      x: gsyd.x,
      y: gsyd.y,
      tooltip: tooltip(gsydName, gsyd.x, gsyd.y),
      placement: placements[placements.length - 1],
    },
    inQuadrantText: inQuadrantText(plotted.filter(d => d.inNeedQuadrant).map(d => d.name)),
    unnamedCount: plotted.filter(d => d.placement === null).length,
    message: null,
  };
}
