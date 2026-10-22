'use client';

import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend, Tooltip, ResponsiveContainer,
} from 'recharts';
import { MAX_RADAR_AREAS, radarData } from '@/lib/needs/chart-data';
import { displayScore } from '@/lib/needs/format';
import { CHART_TOOLTIP_STYLE } from '@/lib/utils';
import type { NeedsAssessment } from '@/lib/needs/types';

const FONT = 'Inter, system-ui, sans-serif';

function andList(names: string[]): string {
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The three domain scores (0-100, higher = more need) for the first few areas, with Greater Sydney. */
export default function NeedsRadar({ assessment }: { assessment: NeedsAssessment }) {
  if (assessment.areas.length === 0) return null;
  const { rows, series, hiddenCount, omitted } = radarData(assessment);

  return (
    <div>
      {series.length > 0 && (
        <ResponsiveContainer width="100%" height={400}>
          <RadarChart data={rows} margin={{ top: 24, right: 110, bottom: 16, left: 110 }}>
            <PolarGrid stroke="#cbd5e1" />
            <PolarAngleAxis dataKey="axis" tickSize={24} tick={{ fontSize: 12, fontFamily: FONT, fill: '#111827' }} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value, name) => [typeof value === 'number' ? `${displayScore(value)} / 100` : 'No data', name]}
            />
            {series.map(s => (
              <Radar
                key={s.key}
                name={s.name}
                dataKey={s.key}
                stroke={s.color}
                fill={s.color}
                fillOpacity={s.benchmark ? 0.06 : 0.14}
                strokeWidth={s.benchmark ? 2 : 2.5}
                strokeDasharray={s.benchmark ? '6 4' : undefined}
                isAnimationActive={false}
              />
            ))}
            {/* after the series so the scale labels are drawn over the shapes */}
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tickCount={6}
              tick={{ fontSize: 10, fill: '#334155', stroke: '#ffffff', strokeWidth: 3, paintOrder: 'stroke' }}
            />
            <Legend wrapperStyle={{ fontFamily: FONT, fontSize: 12 }} />
          </RadarChart>
        </ResponsiveContainer>
      )}
      {(hiddenCount > 0 || omitted.length > 0 || series.length === 0) && (
        <div className="mt-2 space-y-1 text-xs text-gray-600">
          {hiddenCount > 0 && (
            <p>
              Showing the first {MAX_RADAR_AREAS} of {assessment.areas.length} selected areas; the other {hiddenCount} are in
              the heatmap and domain score chart.
            </p>
          )}
          {omitted.length > 0 && (
            <p>
              Not plotted because a domain score is not available (too few indicators with data): {andList(omitted)}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
