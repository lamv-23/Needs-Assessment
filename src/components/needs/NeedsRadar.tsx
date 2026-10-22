'use client';

import { useMemo } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { wrapLabel } from '@/lib/needs/chart-data';
import { BENCHMARK_COLOR, areaColor } from '@/lib/needs/colors';
import { displayScore } from '@/lib/needs/format';
import { CATCHMENT_NOTE } from '@/lib/needs/indicators';
import { MAX_RADAR_AREAS, TYPICAL_PERCENTILE, groupLabel, radarData, radarGaps, typicalLabel } from '@/lib/needs/project-need';
import { CHART_TOOLTIP_STYLE } from '@/lib/utils';
import type { NeedsAssessment } from '@/lib/needs/types';
import { BarSwatch, ChartNotes, Legend, LegendItem, LineSwatch } from './insightChartParts';

const FONT = 'Inter, system-ui, sans-serif';
const RING = { stroke: '#6b7280', strokeWidth: 1.5, strokeDasharray: '3 4' };
const BENCHMARK = { stroke: BENCHMARK_COLOR, strokeWidth: 2, strokeDasharray: '8 4' };
const AREA_FILL_OPACITY = 0.2;
/** Longest line of an axis name, in characters, so the names fit beside the radar on a narrow screen. */
const AXIS_NAME_CHARS = 16;
const AXIS_LINE_PX = 14;

interface AxisTickProps { x?: number; y?: number; cx?: number; cy?: number; textAnchor?: 'start' | 'middle' | 'end'; payload?: { value: string } }

/** An axis name wrapped to two lines, which stay clear of the radar: above it for the top axis, beside it for the others. */
function AxisTick({ x = 0, y = 0, cy = 0, textAnchor, payload }: AxisTickProps) {
  const lines = wrapLabel(payload?.value ?? '', AXIS_NAME_CHARS, 2);
  const above = y < cy - 5;
  const first = above ? -(lines.length - 1) * AXIS_LINE_PX : -((lines.length - 1) * AXIS_LINE_PX) / 2;
  return (
    <text x={x} y={y} textAnchor={textAnchor} fontSize={12} fontFamily={FONT} fill="#111827">
      {lines.map((line, i) => <tspan key={i} x={x} dy={i === 0 ? first : AXIS_LINE_PX}>{line}</tspan>)}
    </text>
  );
}

function andList(names: string[]): string {
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The need profile: each area's need percentile (0-100, 100 = the most need in its comparison group) on car dependency,
 * the public transport service gap, households without a car, socio-economic disadvantage and population growth to 2041.
 * The dashed ring at 50 is a typical LGA of the group; Greater Sydney is outlined where it is ranked in the same group.
 * A percentile that does not exist is a gap in the outline, never 0.
 */
export default function NeedsRadar({ assessment }: { assessment: NeedsAssessment }) {
  const data = useMemo(() => radarData(assessment), [assessment]);
  if (assessment.areas.length === 0) return null;
  const { rows, series, hiddenAreas } = data;
  const gaps = radarGaps(data);
  const notRanked = radarGaps(data, 'not_ranked');
  const ring = typicalLabel(assessment);
  const areas = series.filter(s => !s.isBenchmark);
  const benchmark = series.find(s => s.isBenchmark);

  return (
    <div>
      <ResponsiveContainer width="100%" height={400}>
        <RadarChart data={rows} outerRadius="80%" margin={{ top: 24, right: 100, bottom: 16, left: 100 }}>
          <PolarGrid stroke="#cbd5e1" />
          <PolarAngleAxis dataKey="axis" tickSize={24} tick={<AxisTick />} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value, name, item) => {
              if (typeof value === 'number') return [`${displayScore(value)} / 100`, name];
              const axis = (item?.payload as { axis?: string } | undefined)?.axis ?? '';
              const notRankedHere = series.some(s => s.name === name && s.notRanked.includes(axis));
              return [notRankedHere ? 'Not ranked' : 'No data', name];
            }}
          />
          <Radar
            name={ring}
            dataKey="typical"
            fill="none"
            {...RING}
            isAnimationActive={false}
          />
          {benchmark && (
            <Radar
              name={benchmark.name}
              dataKey={benchmark.key}
              fill="none"
              {...BENCHMARK}
              isAnimationActive={false}
            />
          )}
          {areas.map((s, i) => (
            <Radar
              key={s.key}
              name={s.name}
              dataKey={s.key}
              stroke={areaColor(i)}
              fill={areaColor(i)}
              fillOpacity={AREA_FILL_OPACITY}
              strokeWidth={2.5}
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
        </RadarChart>
      </ResponsiveContainer>
      <Legend label="Key to the need profile chart">
        {areas.map((s, i) => <LegendItem key={s.key} swatch={<BarSwatch color={areaColor(i)} />}>{s.name}</LegendItem>)}
        {benchmark && (
          <LegendItem swatch={<LineSwatch color={BENCHMARK.stroke} width={BENCHMARK.strokeWidth} dash={BENCHMARK.strokeDasharray} />}>
            {benchmark.name}
          </LegendItem>
        )}
        <LegendItem swatch={<LineSwatch color={RING.stroke} width={RING.strokeWidth} dash={RING.strokeDasharray} />}>{ring}</LegendItem>
      </Legend>
      <ChartNotes>
        <p>
          Each axis is the need percentile within {groupLabel(assessment.areas)}: 100 is the most need, and the dashed ring at{' '}
          {TYPICAL_PERCENTILE} is a typical LGA. A public transport service gap is a low share of residents near frequent
          AM-peak public transport. {CATCHMENT_NOTE}
        </p>
        {hiddenAreas > 0 && (
          <p>
            Showing the first {MAX_RADAR_AREAS} of {assessment.areas.length} selected areas; the other {hiddenAreas} are in
            the heatmap and domain score chart.
          </p>
        )}
        {gaps.length > 0 && (
          <p>
            No data, so left as gaps in the outline: {andList(gaps.map(g => `${g.name} (${g.axes.join(', ')})`))}.
          </p>
        )}
        {notRanked.length > 0 && (
          <p>
            Not ranked, because fewer than 5 LGAs in the comparison group have data, so left as gaps in the
            outline: {andList(notRanked.map(g => `${g.name} (${g.axes.join(', ')})`))}.
          </p>
        )}
      </ChartNotes>
    </div>
  );
}
