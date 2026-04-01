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
import { CHART_COLORS, CHART_TICK_STYLE, CHART_LABEL_STYLE, CHART_TOOLTIP_STYLE } from '@/lib/utils';

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
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.8} />
        <XAxis
          dataKey={xAxisKey}
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
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }} />
        {dataKeys.map((key, index) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={colors[index % colors.length]}
            strokeWidth={3}
            dot={{ r: 3, strokeWidth: 2 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
