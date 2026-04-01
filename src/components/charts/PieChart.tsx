'use client';

import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from '@/lib/utils';

interface PieChartDataItem {
  name: string;
  value: number;
}

interface PieChartProps {
  data: PieChartDataItem[];
  colors?: string[];
  showLabels?: boolean;
  innerRadius?: number;
  height?: number;
}

interface LabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}

const RADIAN = Math.PI / 180;

const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  fontSize: 12,
  fontFamily: 'Inter, system-ui, sans-serif',
};

function renderCustomLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: LabelProps) {
  if (percent < 0.03) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={13}
      fontWeight={600}
      fontFamily="Inter, system-ui, sans-serif"
    >
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  );
}

export default function PieChart({
  data,
  colors = CHART_COLORS,
  showLabels = true,
  innerRadius = 0,
  height = 400,
}: PieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsPieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius="80%"
          dataKey="value"
          nameKey="name"
          label={showLabels ? renderCustomLabel : false}
          labelLine={false}
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={colors[index % colors.length]}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => value.toLocaleString()}
          contentStyle={TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }} />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}
