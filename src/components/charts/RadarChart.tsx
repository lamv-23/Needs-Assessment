'use client';

import {
  RadarChart as RechartsRadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { CHART_COLORS, CHART_TOOLTIP_STYLE } from '@/lib/utils';

export interface RadarDataPoint {
  axis: string;
  value: number;
  benchmark?: number;
}

interface RadarChartProps {
  data: RadarDataPoint[];
  subjectLabel?: string;
  benchmarkLabel?: string;
  height?: number;
}

export default function NeedsRadarChart({
  data,
  subjectLabel = 'Selected LGA',
  benchmarkLabel = 'Greater Sydney Avg',
  height = 400,
}: RadarChartProps) {
  const hasBenchmark = data.some((d) => d.benchmark !== undefined);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsRadarChart data={data} margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif', fill: '#475569' }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={{ fontSize: 9, fill: '#94a3b8' }}
          tickCount={5}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(v: number) => [`${v.toFixed(0)}/100`, '']}
        />
        <Radar
          name={subjectLabel}
          dataKey="value"
          stroke={CHART_COLORS[0]}
          fill={CHART_COLORS[0]}
          fillOpacity={0.35}
          strokeWidth={2}
        />
        {hasBenchmark && (
          <Radar
            name={benchmarkLabel}
            dataKey="benchmark"
            stroke="#94a3b8"
            fill="#94a3b8"
            fillOpacity={0.12}
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
        )}
        <Legend wrapperStyle={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }} />
      </RechartsRadarChart>
    </ResponsiveContainer>
  );
}
