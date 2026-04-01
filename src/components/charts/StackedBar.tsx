'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from '@/lib/utils';

interface StackedBarProps {
  data: Array<Record<string, string | number>>;
  dataKeys: string[];
  colors?: string[];
  layout?: 'vertical' | 'horizontal';
  xAxisLabel?: string;
  yAxisLabel?: string;
  height?: number;
}

const TICK_STYLE = { fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif', fill: '#374151' };
const LABEL_STYLE = { fontWeight: 600, fontSize: 12, fill: '#111827' };
const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  fontSize: 12,
  fontFamily: 'Inter, system-ui, sans-serif',
};

export default function StackedBar({
  data,
  dataKeys,
  colors = CHART_COLORS,
  layout = 'horizontal',
  xAxisLabel,
  yAxisLabel,
  height = 400,
}: StackedBarProps) {
  const isVertical = layout === 'vertical';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={isVertical ? 'vertical' : 'horizontal'}
        margin={{ top: 5, right: 30, left: 20, bottom: xAxisLabel ? 30 : 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.8} />
        {isVertical ? (
          <>
            <XAxis
              type="number"
              tick={TICK_STYLE}
              label={
                xAxisLabel
                  ? { value: xAxisLabel, position: 'bottom', offset: 10, style: LABEL_STYLE }
                  : undefined
              }
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={TICK_STYLE}
              label={
                yAxisLabel
                  ? { value: yAxisLabel, angle: -90, position: 'insideLeft', offset: -10, style: LABEL_STYLE }
                  : undefined
              }
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey="name"
              tick={TICK_STYLE}
              label={
                xAxisLabel
                  ? { value: xAxisLabel, position: 'bottom', offset: 10, style: LABEL_STYLE }
                  : undefined
              }
            />
            <YAxis
              tick={TICK_STYLE}
              label={
                yAxisLabel
                  ? { value: yAxisLabel, angle: -90, position: 'insideLeft', offset: -10, style: LABEL_STYLE }
                  : undefined
              }
            />
          </>
        )}
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }} />
        {dataKeys.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="stack"
            fill={colors[index % colors.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
