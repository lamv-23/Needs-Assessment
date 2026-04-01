'use client';

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS, CHART_TICK_STYLE, CHART_LABEL_STYLE, CHART_TOOLTIP_STYLE } from '@/lib/utils';

interface BarChartProps {
  data: Array<Record<string, string | number>>;
  dataKeys: string[];
  colors?: string[];
  layout?: 'vertical' | 'horizontal';
  xAxisLabel?: string;
  yAxisLabel?: string;
  height?: number;
}

export default function BarChart({
  data,
  dataKeys,
  colors = CHART_COLORS,
  layout = 'horizontal',
  xAxisLabel,
  yAxisLabel,
  height = 400,
}: BarChartProps) {
  const isVertical = layout === 'vertical';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        layout={isVertical ? 'vertical' : 'horizontal'}
        margin={{ top: 5, right: 30, left: 20, bottom: xAxisLabel ? 30 : 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.8} />
        {isVertical ? (
          <>
            <XAxis
              type="number"
              tick={CHART_TICK_STYLE}
              label={
                xAxisLabel
                  ? { value: xAxisLabel, position: 'bottom', offset: 10, style: CHART_LABEL_STYLE }
                  : undefined
              }
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={CHART_TICK_STYLE}
              label={
                yAxisLabel
                  ? { value: yAxisLabel, angle: -90, position: 'insideLeft', offset: -10, style: CHART_LABEL_STYLE }
                  : undefined
              }
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey="name"
              tick={CHART_TICK_STYLE}
              label={
                xAxisLabel
                  ? { value: xAxisLabel, position: 'bottom', offset: 10, style: CHART_LABEL_STYLE }
                  : undefined
              }
            />
            <YAxis
              tick={CHART_TICK_STYLE}
              label={
                yAxisLabel
                  ? { value: yAxisLabel, angle: -90, position: 'insideLeft', offset: -10, style: CHART_LABEL_STYLE }
                  : undefined
              }
            />
          </>
        )}
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }} />
        {dataKeys.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            fill={colors[index % colors.length]}
            radius={[3, 3, 0, 0]}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
