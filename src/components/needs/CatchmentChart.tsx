'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import {
  axisFraction, catchmentChartData, type CatchmentBar, type CatchmentPanel, type NiceAxis,
  type StripReference,
} from '@/lib/needs/chart-data';
import { BENCHMARK_COLOR, TODAY_COLOR } from '@/lib/needs/colors';
import { CATCHMENT_NOTE } from '@/lib/needs/indicators';
import { nameList } from '@/lib/needs/insight-chart-data';
import { CHART_TICK_STYLE, CHART_TOOLTIP_STYLE } from '@/lib/utils';
import type { NeedsAssessment } from '@/lib/needs/types';
import {
  AXIS_TITLE_STYLE, BarSwatch, ChartNotes, DARK_TEXT, GRID_STROKE, Legend, LegendItem, LineSwatch, ROW_AXIS_WIDTH, RowNameTick,
} from './insightChartParts';

const BAR_COLOR = TODAY_COLOR;
const TICK_STYLE = { ...CHART_TICK_STYLE, fontSize: 12 };
// The top margin holds the two reference labels, one row each, above the bars.
const MARGIN = { top: 36, right: 56, left: 8, bottom: 8 };
const GSYD_DASH = '6 3';
const NSW_DASH = '2 3';
const NO_DATA = 'No data';

interface ValueLabelProps { x?: number; y?: number; width?: number; height?: number; value?: string }

/** The share at the end of its bar; "No data" where the bars start when the area has none. */
function ValueLabel({ x, y = 0, width = 0, height = 0, value }: ValueLabelProps) {
  const missing = value === NO_DATA;
  const at = missing || x === undefined ? MARGIN.left + ROW_AXIS_WIDTH : x + Math.max(width, 0);
  return (
    <text
      x={at + 6}
      y={y + height / 2}
      dy={4}
      fontSize={11}
      fill={missing ? '#6b7280' : DARK_TEXT}
      fontStyle={missing ? 'italic' : 'normal'}
      stroke="#ffffff"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {value}
    </text>
  );
}

interface ReferenceLabelProps {
  viewBox?: { x?: number; y?: number };
  reference: StripReference;
  side: 'left' | 'right';
}

/** Above the bars: Greater Sydney on the upper row and NSW on the lower, beside their lines. */
function ReferenceLabel({ viewBox, reference, side }: ReferenceLabelProps) {
  const x = viewBox?.x ?? 0;
  const top = viewBox?.y ?? 0;
  return (
    <text
      x={x + (side === 'left' ? -5 : 5)}
      y={top - (reference.key === 'gsyd' ? 20 : 6)}
      textAnchor={side === 'left' ? 'end' : 'start'}
      fontSize={11}
      fontWeight={600}
      fill={BENCHMARK_COLOR}
    >
      {reference.name} {reference.text}
    </text>
  );
}

function BarTooltip({ active, payload, title }: { active?: boolean; payload?: Array<{ payload: CatchmentBar }>; title: string }) {
  const bar = active ? payload?.[0]?.payload : undefined;
  if (!bar) return null;
  return (
    <div style={CHART_TOOLTIP_STYLE} className="p-2">
      <div className="font-semibold">{bar.name}</div>
      <div>{title}: {bar.text}</div>
    </div>
  );
}

function Panel({ panel, axis, height }: { panel: CatchmentPanel; axis: NiceAxis; height: number }) {
  // The two labels are on rows of their own, so each goes where there is room: left of its line past the middle.
  const sideOf = (reference: StripReference) => (axisFraction(axis, false, reference.x) > 0.5 ? 'left' : 'right');
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-800">{panel.title}</h4>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={panel.bars} layout="vertical" barCategoryGap={8} margin={MARGIN}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            domain={[axis.lo, axis.hi]}
            ticks={axis.ticks}
            tickFormatter={(v: number) => `${v}%`}
            tick={TICK_STYLE}
            height={44}
            label={{ value: 'Share of residents', position: 'insideBottom', offset: 0, style: AXIS_TITLE_STYLE }}
          />
          <YAxis type="category" dataKey="name" width={ROW_AXIS_WIDTH} interval={0} tick={<RowNameTick />} />
          <Tooltip content={<BarTooltip title={panel.title} />} cursor={{ fill: '#f1f5f9' }} />
          {panel.references.map(reference => (
            <ReferenceLine
              key={reference.key}
              x={reference.x}
              stroke={BENCHMARK_COLOR}
              strokeWidth={1.5}
              strokeDasharray={reference.key === 'gsyd' ? GSYD_DASH : NSW_DASH}
              label={<ReferenceLabel reference={reference} side={sideOf(reference)} />}
            />
          ))}
          <Bar dataKey="value" fill={BAR_COLOR} isAnimationActive={false}>
            <LabelList dataKey="text" content={<ValueLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * The share of residents within a straight-line walk of frequent, and of any, AM-peak public transport for each assessed
 * area, one panel per measure, against Greater Sydney and NSW as reference lines.
 */
export default function CatchmentChart({ assessment }: { assessment: NeedsAssessment }) {
  const data = useMemo(() => catchmentChartData(assessment), [assessment]);
  if (assessment.areas.length === 0) return null;

  return (
    <div>
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
        {data.panels.map(panel => <Panel key={panel.id} panel={panel} axis={data.axis} height={data.height} />)}
      </div>
      <Legend label="Key to the catchment chart">
        <LegendItem swatch={<BarSwatch color={BAR_COLOR} />}>Selected areas</LegendItem>
        <LegendItem swatch={<LineSwatch color={BENCHMARK_COLOR} dash={GSYD_DASH} />}>Greater Sydney</LegendItem>
        <LegendItem swatch={<LineSwatch color={BENCHMARK_COLOR} dash={NSW_DASH} />}>NSW</LegendItem>
      </Legend>
      <ChartNotes>
        <p>{CATCHMENT_NOTE}</p>
        {data.noData.length > 0 && <p>No catchment data for {nameList(data.noData)}.</p>}
        {data.notes.map(note => <p key={note}>{note}</p>)}
      </ChartNotes>
    </div>
  );
}
