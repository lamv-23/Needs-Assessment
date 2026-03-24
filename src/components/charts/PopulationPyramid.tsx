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

export default function PopulationPyramid({
  data,
  height = 500,
  maleColor = '#3b82f6',
  femaleColor = '#ec4899',
}: PopulationPyramidProps) {
  // Transform data: male values become negative for left-side rendering
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
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          type="number"
          domain={[-maxValue * 1.1, maxValue * 1.1]}
          tickFormatter={formatTick}
        />
        <YAxis
          type="category"
          dataKey="ageGroup"
          width={80}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          formatter={(value: number, name: string) => [
            formatNumber(Math.abs(value)),
            name.charAt(0).toUpperCase() + name.slice(1),
          ]}
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
          }}
        />
        <Legend
          formatter={(value: string) =>
            value.charAt(0).toUpperCase() + value.slice(1)
          }
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
