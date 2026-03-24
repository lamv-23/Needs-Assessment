'use client';

import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from '@/lib/utils';

interface LineChartProps {
  data: Array<Record<string, string | number>>;
  dataKeys: string[];
  colors?: string[];
  xAxisKey?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  height?: number;
}

export default function LineChart({
  data,
  dataKeys,
  colors = CHART_COLORS,
  xAxisKey = 'name',
  xAxisLabel,
  yAxisLabel,
  height = 400,
}: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: xAxisLabel ? 30 : 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey={xAxisKey}
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
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
          }}
        />
        <Legend />
        {dataKeys.map((key, index) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
