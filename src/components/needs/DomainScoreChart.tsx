'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { DOMAIN_BAR, domainChartData } from '@/lib/needs/chart-data';
import { displayScore } from '@/lib/needs/format';
import { CHART_TICK_STYLE, CHART_TOOLTIP_STYLE } from '@/lib/utils';
import type { NeedsAssessment } from '@/lib/needs/types';

const TICK_STYLE = { ...CHART_TICK_STYLE, fontSize: 12 };
const LEGEND_STYLE = { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, paddingTop: 10 };

// Score bands (Moderate 40, High 60, Very high 80), marked so a bar can be read against them.
const BAND_LINES = [
  { score: 40, label: 'Moderate' },
  { score: 60, label: 'High' },
  { score: 80, label: 'Very high' },
];

interface LabelProps { x?: number; y?: number; width?: number; height?: number; value?: number | string | null }

/** Score at the end of a bar, floored like every shown score; "No data" when the domain has no score. */
function ScoreLabel({ x = 0, y = 0, width = 0, height = 0, value }: LabelProps) {
  const missing = typeof value !== 'number';
  return (
    <text x={x + Math.max(width, 0) + 6} y={y + height / 2} dy={4} fontSize={11} fill={missing ? '#6b7280' : '#111827'} fontStyle={missing ? 'italic' : 'normal'}>
      {missing ? 'No data' : displayScore(value)}
    </text>
  );
}

/** Domain scores (0-100, higher = more need) for each selected area, with Greater Sydney as a reference. */
export default function DomainScoreChart({ assessment }: { assessment: NeedsAssessment }) {
  if (assessment.areas.length === 0) return null;
  const { rows, series, height } = domainChartData(assessment);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={rows}
        layout="vertical"
        barSize={DOMAIN_BAR.size}
        barGap={DOMAIN_BAR.gap}
        barCategoryGap={DOMAIN_BAR.categoryGap}
        margin={{ top: 28, right: 48, left: 8, bottom: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          ticks={[0, 20, 40, 60, 80, 100]}
          tick={TICK_STYLE}
          height={52}
          label={{ value: 'Need score (0-100, higher = more need)', position: 'insideBottom', offset: 0, style: { fontSize: 12, fill: '#111827' } }}
        />
        <YAxis type="category" dataKey="name" width={200} tick={TICK_STYLE} />
        {BAND_LINES.map(({ score, label }) => (
          <ReferenceLine
            key={score}
            x={score}
            stroke="#94a3b8"
            strokeDasharray="4 3"
            label={{ value: label, position: 'top', fontSize: 11, fill: '#475569' }}
          />
        ))}
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          cursor={{ fill: '#f1f5f9' }}
          formatter={(value, name) => [typeof value === 'number' ? `${displayScore(value)} / 100` : 'No data', name]}
        />
        <Legend verticalAlign="bottom" wrapperStyle={LEGEND_STYLE} />
        {series.map(s => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} isAnimationActive={false}>
            <LabelList dataKey={s.key} content={<ScoreLabel />} />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
