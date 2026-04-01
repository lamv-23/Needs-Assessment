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
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend />
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
