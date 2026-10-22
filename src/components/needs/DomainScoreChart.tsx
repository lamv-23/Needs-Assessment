'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { domainChartData, wrapLabel } from '@/lib/needs/chart-data';
import { displayScore } from '@/lib/needs/format';
import { CHART_TICK_STYLE, CHART_TOOLTIP_STYLE } from '@/lib/utils';
import type { NeedsAssessment } from '@/lib/needs/types';

const TICK_STYLE = { ...CHART_TICK_STYLE, fontSize: 12 };
const NO_SCORE = 'No score';
const LEGEND_STYLE = { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, paddingTop: 10 };

/** Area names on the axis of the by-area layout: wrapped to two lines, Greater Sydney in bold. */
const AREA_NAME_CHARS = 24;
const AREA_AXIS_WIDTH = 176;

// Score bands (Moderate 40, High 60, Very high 80), marked so a bar can be read against them.
const BAND_LINES = [
  { score: 40, label: 'Moderate' },
  { score: 60, label: 'High' },
  { score: 80, label: 'Very high' },
];

interface LabelProps {
  x?: number; y?: number; width?: number; height?: number; value?: number | string | null; fontSize?: number;
}

/**
 * Score at the end of a bar, floored like every shown score; "No score" when the domain has none (too few of its
 * indicators have a value, or are ranked: R58).
 */
function ScoreLabel({ x = 0, y = 0, width = 0, height = 0, value, fontSize = 11 }: LabelProps) {
  const missing = typeof value !== 'number';
  return (
    <text
      x={x + Math.max(width, 0) + 6}
      y={y + height / 2}
      dy={fontSize / 3}
      fontSize={fontSize}
      fill={missing ? '#6b7280' : '#111827'}
      fontStyle={missing ? 'italic' : 'normal'}
    >
      {missing ? NO_SCORE : displayScore(value)}
    </text>
  );
}

interface AreaTickProps { x?: number; y?: number; payload?: { value: string }; benchmarkName: string | null }

function AreaTick({ x = 0, y = 0, payload, benchmarkName }: AreaTickProps) {
  const name = payload?.value ?? '';
  const lines = wrapLabel(name, AREA_NAME_CHARS, 2);
  const benchmark = name === benchmarkName;
  return (
    <text x={x - 8} textAnchor="end" fontSize={12} fontWeight={benchmark ? 700 : 400} fill="#374151">
      {lines.map((line, i) => (
        <tspan key={i} x={x - 8} y={y + 4 + (i - (lines.length - 1) / 2) * 13}>{line}</tspan>
      ))}
    </text>
  );
}

/**
 * Domain scores (0-100, higher = more need). Up to 10 areas: one group per domain with a bar per
 * area and Greater Sydney as a reference. More areas: one row per area, named on the axis, with a
 * bar per domain, so each bar can be identified without a legend of repeated colours.
 */
export default function DomainScoreChart({ assessment }: { assessment: NeedsAssessment }) {
  if (assessment.areas.length === 0) return null;
  const { layout, rows, series, bar, benchmarkName, height } = domainChartData(assessment);
  const byArea = layout === 'by-area';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={rows}
        layout="vertical"
        barSize={bar.size}
        barGap={bar.gap}
        barCategoryGap={bar.categoryGap}
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
        {byArea ? (
          <YAxis
            type="category"
            dataKey="name"
            width={AREA_AXIS_WIDTH}
            interval={0}
            tick={<AreaTick benchmarkName={benchmarkName} />}
          />
        ) : (
          <YAxis type="category" dataKey="name" width={200} tick={TICK_STYLE} />
        )}
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
          formatter={(value, name) => [typeof value === 'number' ? `${displayScore(value)} / 100` : NO_SCORE, name]}
        />
        <Legend verticalAlign="bottom" wrapperStyle={LEGEND_STYLE} />
        {series.map(s => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} isAnimationActive={false}>
            <LabelList dataKey={s.key} content={<ScoreLabel fontSize={byArea ? 10 : 11} />} />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
