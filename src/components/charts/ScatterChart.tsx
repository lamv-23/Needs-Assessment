'use client';

import {
  ScatterChart as RechartsScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { CHART_COLORS, CHART_TICK_STYLE, CHART_TOOLTIP_STYLE } from '@/lib/utils';

interface ScatterPoint {
  x: number;
  y: number;
  name?: string;
  highlighted?: boolean;
}

interface ScatterChartProps {
  data: ScatterPoint[];
  highlightedData?: ScatterPoint[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  height?: number;
  xUnit?: string;
  yUnit?: string;
  showTrendline?: boolean;
}

function linearRegression(points: ScatterPoint[]): { slope: number; intercept: number } | null {
  if (points.length < 2) return null;
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: ScatterPoint;
}

function CustomDot({ cx = 0, cy = 0, payload }: CustomDotProps) {
  if (!payload) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={payload.highlighted ? 8 : 5}
      fill={payload.highlighted ? CHART_COLORS[5] : CHART_COLORS[0]}
      stroke={payload.highlighted ? '#fff' : 'none'}
      strokeWidth={2}
      opacity={0.8}
    />
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ScatterPoint }>;
  xUnit?: string;
  yUnit?: string;
}

function CustomTooltip({ active, payload, xUnit = '', yUnit = '' }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={CHART_TOOLTIP_STYLE} className="p-2">
      {p.name && <div className="font-semibold mb-1">{p.name}</div>}
      <div>{xUnit ? `X: ${p.x}${xUnit}` : `X: ${p.x}`}</div>
      <div>{yUnit ? `Y: ${p.y}${yUnit}` : `Y: ${p.y}`}</div>
    </div>
  );
}

export default function NeedsScatterChart({
  data,
  highlightedData = [],
  xAxisLabel,
  yAxisLabel,
  height = 400,
  xUnit = '',
  yUnit = '',
  showTrendline = true,
}: ScatterChartProps) {
  const allPoints = [...data, ...highlightedData];
  const regression = showTrendline ? linearRegression(data) : null;

  const xs = allPoints.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);

  const trendPoints =
    regression
      ? [
          { x: minX, y: regression.slope * minX + regression.intercept },
          { x: maxX, y: regression.slope * maxX + regression.intercept },
        ]
      : [];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsScatterChart margin={{ top: 10, right: 30, left: 20, bottom: xAxisLabel ? 30 : 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.8} />
        <XAxis
          type="number"
          dataKey="x"
          name={xAxisLabel}
          tick={CHART_TICK_STYLE}
          label={xAxisLabel ? { value: xAxisLabel, position: 'bottom', offset: 10, style: { fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif', fill: '#64748b' } } : undefined}
        />
        <YAxis
          type="number"
          dataKey="y"
          name={yAxisLabel}
          tick={CHART_TICK_STYLE}
          label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft', offset: -10, style: { fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif', fill: '#64748b' } } : undefined}
        />
        <Tooltip content={<CustomTooltip xUnit={xUnit} yUnit={yUnit} />} />
        {regression && trendPoints.length === 2 && (
          <ReferenceLine
            segment={trendPoints as [{ x: number; y: number }, { x: number; y: number }]}
            stroke={CHART_COLORS[3]}
            strokeDasharray="6 3"
            strokeWidth={2}
            label={{ value: 'Trend', fill: CHART_COLORS[3], fontSize: 10 }}
            ifOverflow="extendDomain"
          />
        )}
        <Scatter
          name="All LGAs"
          data={data}
          shape={<CustomDot />}
        />
        {highlightedData.length > 0 && (
          <Scatter
            name="Selected LGA"
            data={highlightedData}
            shape={<CustomDot />}
          />
        )}
        <Legend wrapperStyle={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }} />
      </RechartsScatterChart>
    </ResponsiveContainer>
  );
}
