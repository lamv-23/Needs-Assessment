'use client';

import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS, CHART_TOOLTIP_STYLE } from '@/lib/utils';

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
  labelMode?: 'percent' | 'value';
  valueSuffix?: string;
}

interface LabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  value: number;
}

const RADIAN = Math.PI / 180;

function renderCustomLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  value,
}: LabelProps, labelMode: 'percent' | 'value', valueSuffix: string) {
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
      {labelMode === 'value' ? `${value.toFixed(1)}${valueSuffix}` : `${(percent * 100).toFixed(1)}%`}
    </text>
  );
}

export default function PieChart({
  data,
  colors = CHART_COLORS,
  showLabels = true,
  innerRadius = 0,
  height = 400,
  labelMode = 'percent',
  valueSuffix = '',
}: PieChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

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
          label={showLabels ? (props: LabelProps) => renderCustomLabel(props, labelMode, valueSuffix) : false}
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
          formatter={(value: number) => {
            if (labelMode === 'percent') {
              const percent = total > 0 ? (value / total) * 100 : 0;
              return `${percent.toFixed(1)}%`;
            }
            return `${value.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: valueSuffix ? 1 : 0 })}${valueSuffix}`;
          }}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }} />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}
