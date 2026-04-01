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
  Cell,
} from 'recharts';
import { formatNumber } from '@/lib/utils';

interface PyramidDataItem {
  ageGroup: string;
  male: number;
  female: number;
}

interface PopulationPyramidProps {
  data: PyramidDataItem[];
  height?: number;
  maleColor?: string;
  femaleColor?: string;
}

const TICK_STYLE = { fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif', fill: '#374151' };
const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  fontSize: 12,
  fontFamily: 'Inter, system-ui, sans-serif',
};

export default function PopulationPyramid({
  data,
  height = 500,
  maleColor = '#2563EB',
  femaleColor = '#DC2626',
}: PopulationPyramidProps) {
  const transformedData = data.map((item) => ({
    ageGroup: item.ageGroup,
    male: -Math.abs(item.male),
    female: Math.abs(item.female),
  }));

  const maxValue = Math.max(
    ...data.map((d) => Math.max(d.male, d.female))
  );

  const formatTick = (value: number) => formatNumber(Math.abs(value));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={transformedData}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        barCategoryGap="15%"
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.8} />
        <XAxis
          type="number"
          domain={[-maxValue * 1.1, maxValue * 1.1]}
          tickFormatter={formatTick}
          tick={TICK_STYLE}
        />
        <YAxis
          type="category"
          dataKey="ageGroup"
          width={80}
          tick={TICK_STYLE}
        />
        <Tooltip
          formatter={(value: number, name: string) => [
            formatNumber(Math.abs(value)),
            name.charAt(0).toUpperCase() + name.slice(1),
          ]}
          contentStyle={TOOLTIP_STYLE}
        />
        <Legend
          formatter={(value: string) =>
            value.charAt(0).toUpperCase() + value.slice(1)
          }
          wrapperStyle={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }}
        />
        <Bar dataKey="male" name="male">
          {transformedData.map((_, index) => (
            <Cell key={`male-${index}`} fill={maleColor} />
          ))}
        </Bar>
        <Bar dataKey="female" name="female">
          {transformedData.map((_, index) => (
            <Cell key={`female-${index}`} fill={femaleColor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
