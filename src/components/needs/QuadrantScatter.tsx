'use client';

import { useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { BENCHMARK_COLOR, NEED_SCALE } from '@/lib/needs/colors';
import { inSentence } from '@/lib/needs/format';
import { INDICATOR_BY_ID } from '@/lib/needs/indicators';
import {
  DEFAULT_SCATTER_WIDTH, SCATTER_HEIGHT, SCATTER_MARGIN, SCATTER_X_AXIS_HEIGHT, SCATTER_Y_AXIS_WIDTH, SELECTED_RADIUS,
  labelGeometry,
} from '@/lib/needs/insight-chart-data';
import type { QuadrantSpec } from '@/lib/needs/project-need';
import {
  GREATER_SYDNEY_RADIUS, quadrantChartData, type QuadrantChart, type QuadrantMarker, type QuadrantSelectedDot,
} from '@/lib/needs/project-need-chart';
import { CHART_TICK_STYLE } from '@/lib/utils';
import type { NeedsAssessment } from '@/lib/needs/types';
import {
  AXIS_TITLE_STYLE, BarSwatch, ChartEmpty, ChartNotes, DARK_TEXT, DiamondSwatch, DotSwatch, DotTooltip, GRID_STROKE, Legend,
  LegendItem, LineSwatch, OTHER_DOT_COLOR, OTHER_DOT_OPACITY, OtherDot,
} from './insightChartParts';

const TICK_STYLE = { ...CHART_TICK_STYLE, fontSize: 12 };
/** The need quadrant is shaded in the top step of the need scale, and its label is in a darker red. */
const QUADRANT_FILL = NEED_SCALE[NEED_SCALE.length - 1];
const QUADRANT_FILL_OPACITY = 0.09;
const QUADRANT_TEXT = '#991b1b';
const MEDIAN_STYLE = { stroke: BENCHMARK_COLOR, strokeWidth: 1.25, strokeDasharray: '5 4' };
/** A shaded quadrant at least this tall holds its label; a thinner one has the label just above it. */
const LABEL_INSIDE_MIN_PX = 24;

interface ShapeProps<T> { cx?: number; cy?: number; payload?: T }

/** A name beside a dot, with a white halo so it stays readable over grey dots and the shading. */
function PointName({ x, y, anchor, children }: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; children: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={11}
      fontWeight={600}
      fill={DARK_TEXT}
      stroke="#ffffff"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {children}
    </text>
  );
}

/** A selected area: a coloured dot, named where a name fits. */
function SelectedShape({ cx = 0, cy = 0, payload }: ShapeProps<QuadrantSelectedDot>) {
  if (!payload) return null;
  const name = payload.placement ? labelGeometry(payload.placement, 0, SELECTED_RADIUS) : null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={SELECTED_RADIUS} fill={payload.color} stroke="#ffffff" strokeWidth={2} />
      {name && <PointName x={cx + name.dx} y={cy + name.dy} anchor={name.anchor}>{payload.label}</PointName>}
    </g>
  );
}

/** Greater Sydney: a diamond, set apart from the round dots of the LGAs. */
function GreaterSydneyShape({ cx = 0, cy = 0, payload }: ShapeProps<QuadrantMarker>) {
  if (!payload) return null;
  const r = GREATER_SYDNEY_RADIUS;
  const name = payload.placement ? labelGeometry(payload.placement, 0, r) : null;
  return (
    <g>
      <polygon
        points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
        fill={BENCHMARK_COLOR}
        stroke="#ffffff"
        strokeWidth={2}
      />
      {name && <PointName x={cx + name.dx} y={cy + name.dy} anchor={name.anchor}>{payload.name}</PointName>}
    </g>
  );
}

interface AreaLabelProps { viewBox?: { x?: number; y?: number; width?: number; height?: number }; text: string }

/** The need quadrant's name, at the median-line end of its right-hand side; just above the quadrant when it is too thin to hold it. */
function QuadrantLabel({ viewBox, text }: AreaLabelProps) {
  const { x = 0, y = 0, width = 0, height = 0 } = viewBox ?? {};
  return (
    <text
      x={x + width - 8}
      y={height >= LABEL_INSIDE_MIN_PX ? y + 16 : y - 6}
      textAnchor="end"
      fontSize={12}
      fontWeight={700}
      fill={QUADRANT_TEXT}
      stroke="#ffffff"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {text}
    </text>
  );
}

/** One comparison group's scatter, with its own medians, shaded need quadrant and key. */
function Panel({ chart, onWidth }: { chart: QuadrantChart; onWidth: (width: number) => void }) {
  const { spec, xAxis, yAxis, medians, quadrant, greaterSydney } = chart;
  const xDef = INDICATOR_BY_ID[spec.x];
  const yDef = INDICATOR_BY_ID[spec.y];

  return (
    <section aria-label={chart.heading}>
      <h4 className="mb-1 text-sm font-semibold text-gray-900">{chart.heading}</h4>
      <ResponsiveContainer width="100%" height={SCATTER_HEIGHT} onResize={onWidth}>
        <ScatterChart margin={SCATTER_MARGIN}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            reversed={chart.xReversed}
            domain={[xAxis.lo, xAxis.hi]}
            ticks={xAxis.ticks}
            tick={TICK_STYLE}
            tickFormatter={v => (xDef.unit === '%' ? `${v}%` : String(v))}
            height={SCATTER_X_AXIS_HEIGHT}
            label={{ value: chart.xTitle, position: 'insideBottom', offset: 0, style: AXIS_TITLE_STYLE }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[yAxis.lo, yAxis.hi]}
            ticks={yAxis.ticks}
            tick={TICK_STYLE}
            width={SCATTER_Y_AXIS_WIDTH}
            label={{ value: chart.yTitle, angle: -90, position: 'insideLeft', offset: 4, style: { ...AXIS_TITLE_STYLE, textAnchor: 'middle' } }}
          />
          <Tooltip content={<DotTooltip />} cursor={false} />
          {quadrant && (
            <ReferenceArea
              x1={quadrant.x1}
              x2={quadrant.x2}
              y1={quadrant.y1}
              y2={quadrant.y2}
              fill={QUADRANT_FILL}
              fillOpacity={QUADRANT_FILL_OPACITY}
              stroke="none"
              label={<QuadrantLabel text={spec.quadrantLabel} />}
            />
          )}
          {medians && <ReferenceLine x={medians.x} {...MEDIAN_STYLE} />}
          {medians && <ReferenceLine y={medians.y} {...MEDIAN_STYLE} />}
          <Scatter name={`Other ${chart.groupLabel}`} data={chart.others} shape={<OtherDot />} isAnimationActive={false} />
          {greaterSydney && (
            <Scatter name={greaterSydney.name} data={[greaterSydney]} shape={<GreaterSydneyShape />} isAnimationActive={false} />
          )}
          <Scatter name="Selected" data={chart.selected} shape={<SelectedShape />} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
      <Legend label={`Key to the ${chart.heading} panel`}>
        <LegendItem swatch={<DotSwatch color={chart.selected[0]?.color ?? DARK_TEXT} />}>Selected area</LegendItem>
        <LegendItem swatch={<DotSwatch color={OTHER_DOT_COLOR} opacity={OTHER_DOT_OPACITY} />}>
          Other {chart.groupLabel} ({chart.others.length})
        </LegendItem>
        {greaterSydney && <LegendItem swatch={<DiamondSwatch color={BENCHMARK_COLOR} />}>{greaterSydney.name}</LegendItem>}
        {medians && (
          <>
            <LegendItem swatch={<LineSwatch color={MEDIAN_STYLE.stroke} width={MEDIAN_STYLE.strokeWidth} dash={MEDIAN_STYLE.strokeDasharray} />}>
              Median {inSentence(xDef.label)}: {medians.xText}
            </LegendItem>
            <LegendItem swatch={<LineSwatch color={MEDIAN_STYLE.stroke} width={MEDIAN_STYLE.strokeWidth} dash={MEDIAN_STYLE.strokeDasharray} />}>
              Median {inSentence(yDef.label)}: {medians.yText}
            </LegendItem>
          </>
        )}
        {quadrant && (
          <LegendItem swatch={<BarSwatch color={QUADRANT_FILL} opacity={QUADRANT_FILL_OPACITY * 3} />}>{spec.quadrantLabel}</LegendItem>
        )}
      </Legend>
      <ChartNotes>
        {chart.inQuadrantText && <p>{chart.inQuadrantText}</p>}
        {chart.unnamedCount > 0 && (
          <p>
            {chart.unnamedCount} selected {chart.unnamedCount === 1 ? 'area is' : 'areas are'} shown without a name;
            hover over a dot to see it.
          </p>
        )}
        {chart.noDataText && <p>{chart.noDataText}</p>}
      </ChartNotes>
    </section>
  );
}

/**
 * Where the selected areas stand on two measures of need for transport projects, against the rest of their comparison
 * group. Each comparison group present among the selected areas has a panel, because the medians of NSW as a whole are
 * set by rural LGAs with almost no service. A panel shows every other LGA of its group in grey, the selected areas
 * compared with it coloured (the first few named), dashed median lines, and the quadrant that is past both medians on
 * the "more need" side shaded and labelled. Service (AM-peak departures per 1,000 residents) is always up the page,
 * and the x axis is drawn so that more need is to the right.
 */
export default function QuadrantScatter({ assessment, spec }: { assessment: NeedsAssessment; spec: QuadrantSpec }) {
  // Names are fitted to the plot's measured width, so they re-fit when the chart is resized.
  const [width, setWidth] = useState(DEFAULT_SCATTER_WIDTH);
  const { panels, notes } = useMemo(() => quadrantChartData(assessment, spec, width), [assessment, spec, width]);
  if (assessment.areas.length === 0) return null;

  return (
    <div>
      {panels.length === 0 ? (
        <ChartEmpty>No comparison group of the selected areas has enough LGAs to draw.</ChartEmpty>
      ) : (
        <div className="space-y-8">
          {panels.map(panel => <Panel key={panel.key} chart={panel} onWidth={setWidth} />)}
        </div>
      )}
      <ChartNotes>
        <p>
          AM-peak departures are the weekday 7-9am departures from all stops in the area, per 1,000 residents.
          {panels[0]?.xReversed && ' The horizontal axis runs from high to low SEIFA scores, so more disadvantage is to the right.'}
        </p>
        {notes.map(note => <p key={note}>{note}</p>)}
      </ChartNotes>
    </div>
  );
}
