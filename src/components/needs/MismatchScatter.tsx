'use client';

import { useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { formatDiff } from '@/lib/needs/format';
import { INDICATOR_BY_ID } from '@/lib/needs/indicators';
import {
  DEFAULT_SCATTER_WIDTH, RING_RADIUS, SCATTER_HEIGHT, SCATTER_MARGIN, SCATTER_X_AXIS_HEIGHT, SCATTER_Y_AXIS_WIDTH,
  SELECTED_RADIUS, labelGeometry, mismatchChartData, predictorTickLabel,
  type MismatchChart, type ScatterDot, type SelectedDot,
} from '@/lib/needs/insight-chart-data';
import { BENCHMARK_COLOR } from '@/lib/needs/colors';
import { CHART_TICK_STYLE, CHART_TOOLTIP_STYLE } from '@/lib/utils';
import type { NeedsAssessment } from '@/lib/needs/types';
import {
  AXIS_TITLE_STYLE, ChartEmpty, ChartNotes, DARK_TEXT, DotSwatch, GRID_STROKE, Legend, LegendItem, LineSwatch,
} from './insightChartParts';

const CAR = INDICATOR_BY_ID.car_dependency;
const TICK_STYLE = { ...CHART_TICK_STYLE, fontSize: 12 };
const OTHER_R = 4.5;
const GREY = '#9ca3af';
const FIT_STYLE = { stroke: DARK_TEXT, strokeWidth: 2 };
const BAND_STYLE = { stroke: BENCHMARK_COLOR, strokeWidth: 1.25, strokeDasharray: '5 4' };
/** The two end points of a line are not dots. */
const NO_SHAPE = () => <g />;

interface DotProps<T> { cx?: number; cy?: number; payload?: T }

/** Every other LGA of the setting: small and translucent, so crowded stretches show up darker. */
function GreyDot({ cx = 0, cy = 0 }: DotProps<ScatterDot>) {
  return <circle cx={cx} cy={cy} r={OTHER_R} fill={GREY} fillOpacity={0.5} />;
}

/** A selected area: a coloured dot, ringed when its residual is at least one residual SD, named where a name fits. */
function SelectedShape({ cx = 0, cy = 0, payload }: DotProps<SelectedDot>) {
  if (!payload) return null;
  const { color, flagged, label, placement } = payload;
  const name = placement ? labelGeometry(placement, 0, flagged ? RING_RADIUS : SELECTED_RADIUS) : null;
  return (
    <g>
      {flagged && <circle cx={cx} cy={cy} r={RING_RADIUS} fill="none" stroke={DARK_TEXT} strokeWidth={1.5} />}
      <circle cx={cx} cy={cy} r={SELECTED_RADIUS} fill={color} stroke="#ffffff" strokeWidth={2} />
      {name && (
        <text
          x={cx + name.dx}
          y={cy + name.dy}
          textAnchor={name.anchor}
          fontSize={11}
          fontWeight={600}
          fill={DARK_TEXT}
          stroke="#ffffff"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {label}
        </text>
      )}
    </g>
  );
}

function DotTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterDot }> }) {
  const dot = active ? payload?.[0]?.payload : undefined;
  if (!dot?.tooltip) return null;
  return (
    <div style={CHART_TOOLTIP_STYLE} className="p-2">
      {dot.tooltip.map((line, i) => <div key={i} className={i === 0 ? 'font-semibold' : undefined}>{line}</div>)}
    </div>
  );
}

function MismatchPlot({ chart, onWidth }: { chart: MismatchChart; onWidth: (width: number) => void }) {
  const { setting, xAxis, yAxis } = chart;
  return (
    <ResponsiveContainer width="100%" height={SCATTER_HEIGHT} onResize={onWidth}>
      <ScatterChart margin={SCATTER_MARGIN}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="x"
          domain={[xAxis.lo, xAxis.hi]}
          ticks={xAxis.ticks}
          tick={TICK_STYLE}
          tickFormatter={v => predictorTickLabel(setting, v)}
          height={SCATTER_X_AXIS_HEIGHT}
          label={{ value: chart.xTitle, position: 'insideBottom', offset: 0, style: AXIS_TITLE_STYLE }}
        />
        <YAxis
          type="number"
          dataKey="y"
          domain={[yAxis.lo, yAxis.hi]}
          ticks={yAxis.ticks}
          tick={TICK_STYLE}
          tickFormatter={v => `${v}%`}
          width={SCATTER_Y_AXIS_WIDTH}
          label={{ value: `${CAR.label} (%)`, angle: -90, position: 'insideLeft', offset: 4, style: { ...AXIS_TITLE_STYLE, textAnchor: 'middle' } }}
        />
        <Tooltip content={<DotTooltip />} cursor={false} />
        {chart.bandLines.map((line, i) => (
          <Scatter key={`band-${i}`} data={line} line={BAND_STYLE} shape={NO_SHAPE} legendType="none" isAnimationActive={false} />
        ))}
        {chart.fitLine && (
          <Scatter data={chart.fitLine} line={FIT_STYLE} shape={NO_SHAPE} legendType="none" isAnimationActive={false} />
        )}
        <Scatter name={chart.othersLabel} data={chart.others} shape={<GreyDot />} isAnimationActive={false} />
        <Scatter name="Selected" data={chart.selected} shape={<SelectedShape />} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/**
 * Car dependency against what the model expects for the LGA's setting: metropolitan LGAs by their share of
 * stops with frequent AM-peak service, the others by population. The other LGAs are grey, the fitted line and
 * the band of one residual SD either side are drawn, and the selected areas are coloured (the first few named)
 * and ringed when their residual is at least one residual SD.
 */
export default function MismatchScatter({ assessment }: { assessment: NeedsAssessment }) {
  // Names are fitted to the plot's measured width, so they re-fit when the chart is resized.
  const [width, setWidth] = useState(DEFAULT_SCATTER_WIDTH);
  const { charts, noData, message } = useMemo(() => mismatchChartData(assessment, width), [assessment, width]);
  if (assessment.areas.length === 0) return null;
  if (message) return <ChartEmpty>{message}</ChartEmpty>;

  return (
    <div className="space-y-8">
      {charts.map(chart => (
        <section key={chart.setting} aria-label={chart.heading}>
          <h4 className="text-sm font-semibold text-gray-900">{chart.heading}</h4>
          <p className="mb-1 text-xs text-gray-600">{chart.subtitle}</p>
          {chart.weakMessage ? <ChartEmpty>{chart.weakMessage}</ChartEmpty> : (
            <>
              <MismatchPlot chart={chart} onWidth={setWidth} />
              <Legend label={`Key to the ${chart.heading.toLowerCase()} chart`}>
                <LegendItem swatch={<DotSwatch color={GREY} opacity={0.5} />}>{chart.othersLabel} ({chart.others.length})</LegendItem>
                <LegendItem swatch={<DotSwatch color={chart.selected[0]?.color ?? DARK_TEXT} />}>Selected area</LegendItem>
                <LegendItem swatch={<DotSwatch color={DARK_TEXT} ring />}>
                  Ringed: {formatDiff(CAR, chart.fit.residualSd)} or more from expected (one residual SD)
                </LegendItem>
                <LegendItem swatch={<LineSwatch color={FIT_STYLE.stroke} width={FIT_STYLE.strokeWidth} />}>Expected car dependency</LegendItem>
                <LegendItem swatch={<LineSwatch color={BAND_STYLE.stroke} width={BAND_STYLE.strokeWidth} dash={BAND_STYLE.strokeDasharray} />}>
                  One residual SD either side
                </LegendItem>
              </Legend>
              {chart.unnamedCount > 0 && (
                <ChartNotes>
                  <p>
                    {chart.unnamedCount} selected {chart.unnamedCount === 1 ? 'area is' : 'areas are'} shown without a name;
                    hover over a dot to see it.
                  </p>
                </ChartNotes>
              )}
            </>
          )}
        </section>
      ))}
      <ChartNotes>
        <p>Car dependency is the share of people who travelled to work who went by car; work from home is excluded (2021 Census).</p>
        {noData.length > 0 && <p>No car dependency data: {noData.join(', ')}.</p>}
      </ChartNotes>
    </div>
  );
}
