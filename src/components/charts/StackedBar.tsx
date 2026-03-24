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
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        {isVertical ? (
          <>
            <XAxis
              type="number"
              label={
                xAxisLabel
                  ? { value: xAxisLabel, position: 'bottom', offset: 10 }
                  : undefined
              }
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              label={
                yAxisLabel
                  ? {
                      value: yAxisLabel,
                      angle: -90,
                      position: 'insideLeft',
                      offset: -10,
                    }
                  : undefined
              }
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey="name"
              label={
                xAxisLabel
                  ? { value: xAxisLabel, position: 'bottom', offset: 10 }
                  : undefined
              }
            />
            <YAxis
              label={
                yAxisLabel
                  ? {
                      value: yAxisLabel,
                      angle: -90,
                      position: 'insideLeft',
                      offset: -10,
                    }
                  : undefined
              }
            />
          </>
        )}
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
          }}
        />
        <Legend />
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
