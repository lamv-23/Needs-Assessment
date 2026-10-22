'use client';

import { useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { PROJECTED_COLOR, TODAY_COLOR } from '@/lib/needs/colors';
import { jobsHousingChartData, tickDecimals, type JobsRow } from '@/lib/needs/insight-chart-data';
import { CHART_TICK_STYLE, CHART_TOOLTIP_STYLE } from '@/lib/utils';
import type { NeedsAssessment } from '@/lib/needs/types';
import {
  AXIS_TITLE_STYLE, ChartEmpty, ChartNotes, DARK_TEXT, DiamondSwatch, DotSwatch, GRID_STROKE, Legend, LegendItem,
  ROW_AXIS_WIDTH, RowNameTick,
} from './insightChartParts';

const TICK_STYLE = { ...CHART_TICK_STYLE, fontSize: 12 };
const CONNECTOR = { stroke: '#94a3b8', strokeWidth: 3 };
const DOT_R = 6;
const DIAMOND_R = 5.5;
/** Room right of the plot for the values at the end of each row. */
const MARGIN = { top: 8, right: 120, bottom: 8, left: 8 };

interface EndPoint {
  x: number;
  y: number;
  year: 2021 | 2041;
  row: JobsRow;
  /** The end of the row that is further right carries the row's values. */
  last: boolean;
}

interface ShapeProps { cx?: number; cy?: number; payload?: EndPoint }

/**
 * One end of a row's dumbbell: a circle for 2021 and a smaller diamond for 2041 drawn on top of it, so both
 * show when the two values coincide. The right-hand end also states both values.
 */
function EndShape({ cx = 0, cy = 0, payload }: ShapeProps) {
  if (!payload) return null;
  const { year, row, last } = payload;
  return (
    <g>
      {year === 2041
        ? (
          <polygon
            points={`${cx},${cy - DIAMOND_R} ${cx + DIAMOND_R},${cy} ${cx},${cy + DIAMOND_R} ${cx - DIAMOND_R},${cy}`}
            fill={PROJECTED_COLOR}
            stroke="#ffffff"
            strokeWidth={1.25}
          />
        )
        : <circle cx={cx} cy={cy} r={DOT_R} fill={TODAY_COLOR} stroke="#ffffff" strokeWidth={1.25} />}
      {last && (
        <text x={cx + DOT_R + 8} y={cy + 4} fontSize={11} fill={DARK_TEXT}>
          {row.text2021} → {row.text2041}
        </text>
      )}
    </g>
  );
}

function JobsTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: EndPoint }> }) {
  const row = active ? payload?.[0]?.payload.row : undefined;
  if (!row) return null;
  return (
    <div style={CHART_TOOLTIP_STYLE} className="p-2">
      <div className="font-semibold">{row.name}</div>
      <div>2021: {row.text2021} jobs per resident</div>
      <div>2041: {row.text2041} jobs per resident</div>
    </div>
  );
}

/** A row's two ends, the 2021 one first so the 2041 diamond is drawn on top of it. */
function endPoints(row: JobsRow): EndPoint[] {
  const last2041 = row.y2041 >= row.y2021;
  return [
    { x: row.y2021, y: row.index, year: 2021, row, last: !last2041 },
    { x: row.y2041, y: row.index, year: 2041, row, last: last2041 },
  ];
}

/**
 * TZP24 jobs per resident in 2021 and in 2041 for each selected area that has job projections: a dumbbell per
 * area, its values stated at the right-hand end.
 */
export default function JobsHousingChart({ assessment }: { assessment: NeedsAssessment }) {
  const data = useMemo(() => jobsHousingChartData(assessment), [assessment]);
  if (assessment.areas.length === 0) return null;
  if (data.message) return <ChartEmpty>{data.message}</ChartEmpty>;
  const { rows, xAxis } = data;
  const names = rows.map(r => r.name);

  return (
    <div>
      <ResponsiveContainer width="100%" height={data.height}>
        <ScatterChart margin={MARGIN}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            dataKey="x"
            domain={[xAxis.lo, xAxis.hi]}
            ticks={xAxis.ticks}
            tick={TICK_STYLE}
            tickFormatter={v => v.toFixed(tickDecimals(xAxis.ticks))}
            height={44}
            label={{ value: 'TZP24 jobs per resident', position: 'insideBottom', offset: 0, style: AXIS_TITLE_STYLE }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[-0.5, rows.length - 0.5]}
            ticks={rows.map(r => r.index)}
            reversed
            interval={0}
            width={ROW_AXIS_WIDTH}
            tick={<RowNameTick names={names} />}
          />
          <Tooltip content={<JobsTooltip />} cursor={false} />
          {rows.map(row => (
            <Scatter key={row.id} name={row.name} data={endPoints(row)} line={CONNECTOR} shape={<EndShape />} isAnimationActive={false} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      <Legend label="Key to the jobs and housing chart">
        <LegendItem swatch={<DotSwatch color={TODAY_COLOR} />}>2021</LegendItem>
        <LegendItem swatch={<DiamondSwatch color={PROJECTED_COLOR} />}>2041 (projected)</LegendItem>
      </Legend>
      <ChartNotes>
        <p>
          Jobs per resident: TfNSW TZP24 jobs divided by the ABS 2021 population estimate (2021) or the NSW DPE 2041
          population projection (2041).
        </p>
        {data.note && <p>{data.note}</p>}
      </ChartNotes>
    </div>
  );
}
