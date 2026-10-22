'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer,
} from 'recharts';
import { PROJECTED_COLOR, TODAY_COLOR } from '@/lib/needs/colors';
import { formatValue } from '@/lib/needs/format';
import { INDICATOR_BY_ID } from '@/lib/needs/indicators';
import {
  GROWTH_BAR_GAP_PX, GROWTH_BAR_PX, GROWTH_CATEGORY_GAP_PX, growthServiceChartData, noDataNote, type GrowthRow,
} from '@/lib/needs/insight-chart-data';
import { CHART_TICK_STYLE, CHART_TOOLTIP_STYLE } from '@/lib/utils';
import type { NeedsAssessment } from '@/lib/needs/types';
import {
  AXIS_TITLE_STYLE, BarSwatch, ChartEmpty, ChartNotes, DARK_TEXT, GRID_STROKE, Legend, LegendItem, ROW_AXIS_WIDTH, RowNameTick,
} from './insightChartParts';

const DEPARTURES = INDICATOR_BY_ID.am_peak_departures_per_1000;
const TICK_STYLE = { ...CHART_TICK_STYLE, fontSize: 12 };
const FUTURE_LABEL = "2041 at today's service";
const VALUE_LABEL_STYLE = { fontSize: 11, fill: DARK_TEXT } as const;

function GrowthTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: GrowthRow }> }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div style={CHART_TOOLTIP_STYLE} className="p-2">
      <div className="font-semibold">{row.name}</div>
      <div>Today: {formatValue(DEPARTURES, row.now)}</div>
      <div>2041 at today&apos;s service: {formatValue(DEPARTURES, row.in2041)}</div>
    </div>
  );
}

/**
 * AM-peak departures per 1,000 residents today and in 2041 if service stays at today's level, for each
 * selected area: the fall is what population growth does to service per resident.
 */
export default function GrowthServiceChart({ assessment }: { assessment: NeedsAssessment }) {
  const data = useMemo(() => growthServiceChartData(assessment), [assessment]);
  if (assessment.areas.length === 0) return null;
  if (data.message) return <ChartEmpty>{data.message}</ChartEmpty>;
  const { rows, axis } = data;
  const missing = noDataNote(data.noData, assessment.areas.length, 'AM-peak service or 2041 population projection data');

  return (
    <div>
      <ResponsiveContainer width="100%" height={data.height}>
        <BarChart
          data={rows}
          layout="vertical"
          barSize={GROWTH_BAR_PX}
          barGap={GROWTH_BAR_GAP_PX}
          barCategoryGap={GROWTH_CATEGORY_GAP_PX}
          margin={{ top: 8, right: 48, left: 8, bottom: 8 }}
        >
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            domain={[axis.lo, axis.hi]}
            ticks={axis.ticks}
            tick={TICK_STYLE}
            height={44}
            label={{ value: `${DEPARTURES.label} (weekday 7-9am)`, position: 'insideBottom', offset: 0, style: AXIS_TITLE_STYLE }}
          />
          <YAxis type="category" dataKey="name" width={ROW_AXIS_WIDTH} interval={0} tick={<RowNameTick />} />
          <Tooltip content={<GrowthTooltip />} cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey="now" name={data.nowLabel} fill={TODAY_COLOR} isAnimationActive={false}>
            <LabelList dataKey="nowText" position="right" style={VALUE_LABEL_STYLE} />
          </Bar>
          <Bar dataKey="in2041" name={FUTURE_LABEL} fill={PROJECTED_COLOR} isAnimationActive={false}>
            <LabelList dataKey="in2041Text" position="right" style={VALUE_LABEL_STYLE} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <Legend label="Key to the growth against service chart">
        <LegendItem swatch={<BarSwatch color={TODAY_COLOR} />}>{data.nowLabel}</LegendItem>
        <LegendItem swatch={<BarSwatch color={PROJECTED_COLOR} />}>{FUTURE_LABEL}</LegendItem>
      </Legend>
      <ChartNotes>
        <p>
          2041 holds today&apos;s weekday 7-9am departures from all stops in the area and divides them by the NSW DPE
          2041 population projection.
        </p>
        {missing && <p>{missing}</p>}
      </ChartNotes>
    </div>
  );
}
