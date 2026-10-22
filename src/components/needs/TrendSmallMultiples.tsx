'use client';

import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  MANY_AREAS_COLOR, MEDIAN_COLOR, formatTrendValue, trendData,
  type TrendData, type TrendPanel, type TrendSeries,
} from '@/lib/needs/insight-chart-data';
import { PROJECTION_YEAR } from '@/lib/needs/insights';
import { CHART_TICK_STYLE, CHART_TOOLTIP_STYLE } from '@/lib/utils';
import type { NeedsAssessment } from '@/lib/needs/types';
import { ChartEmpty, ChartNotes, GRID_STROKE, Legend, LegendItem, LineSwatch } from './insightChartParts';

const TICK_STYLE = { ...CHART_TICK_STYLE, fontSize: 12 };
const PANEL_HEIGHT = 250;
const PROJECTED_DASH = '7 5';
const MEDIAN_DASH = '2 3';
/** The tooltip lists at most this many series, highest first, then counts the rest. */
const MAX_TOOLTIP_ROWS = 10;
/** Drawing order, underneath first: medians, then projections, then actual lines; crowded areas go under the medians. */
const SERIES_ORDER: Record<TrendSeries['kind'], number> = { median: 0, 'median-projected': 0, projected: 1, actual: 2 };
const CROWDED_SERIES_ORDER: Record<TrendSeries['kind'], number> = { median: 3, 'median-projected': 3, projected: 1, actual: 2 };

interface DotProps { cx?: number; cy?: number; payload?: { x: number } }

/**
 * A series is drawn solid, dashed (projection) or dotted grey (a comparison group's median). When there are too
 * many areas to tell apart the area lines are thin and translucent and have no points, so that where they
 * crowd together shows darker.
 */
function lineProps(s: TrendSeries, crowded: boolean) {
  const opacity = crowded ? 0.55 : 1;
  switch (s.kind) {
    case 'actual':
      return crowded
        ? { strokeWidth: 1.5, strokeOpacity: opacity, dot: false as const }
        : { strokeWidth: 2.5, dot: { r: 3.5, fill: s.color, stroke: '#ffffff', strokeWidth: 1 } };
    case 'projected':
      // Only the 2041 end of the dashed line is a point; its 2021 start is the actual line's
      return {
        strokeWidth: crowded ? 1.5 : 2,
        strokeOpacity: opacity,
        strokeDasharray: PROJECTED_DASH,
        dot: crowded
          ? (false as const)
          : ({ cx = 0, cy = 0, payload }: DotProps) => (payload?.x === PROJECTION_YEAR
            ? <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill="#ffffff" stroke={s.color} strokeWidth={2} />
            : <g key={`${cx}-${cy}`} />),
      };
    default:
      return { strokeWidth: crowded ? 2.5 : 1.75, strokeDasharray: MEDIAN_DASH, dot: false as const };
  }
}

interface TooltipEntry { dataKey?: string | number; value?: number | string }

function TrendTooltip({
  active, payload, label, panel,
}: { active?: boolean; payload?: TooltipEntry[]; label?: number; panel: TrendPanel }) {
  if (!active || !payload?.length) return null;
  const byKey = new Map(panel.series.map(s => [s.key, s]));
  const entries = payload.flatMap(p => {
    const s = byKey.get(String(p.dataKey));
    // A projection starts from the base year's point, which the actual line already shows
    const base = (s?.kind === 'projected' || s?.kind === 'median-projected') && label === panel.xDomain[0];
    return s && typeof p.value === 'number' && !base ? [{ s, value: p.value }] : [];
  }).sort((a, b) => b.value - a.value);
  if (entries.length === 0) return null;
  const projection = entries.every(e => e.s.kind === 'projected' || e.s.kind === 'median-projected');
  const shown = entries.slice(0, MAX_TOOLTIP_ROWS);
  return (
    <div style={CHART_TOOLTIP_STYLE} className="p-2">
      <div className="font-semibold">{label}{projection ? ' (projection)' : ''}</div>
      {shown.map(({ s, value }) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
          <span>{s.name}: {formatTrendValue(panel.id, value)}</span>
        </div>
      ))}
      {entries.length > shown.length && <div className="text-gray-500">and {entries.length - shown.length} more</div>}
    </div>
  );
}

function TrendPanelChart({ panel, crowded }: { panel: TrendPanel; crowded: boolean }) {
  const { xDomain, xTicks, yAxis } = panel;
  const order = crowded ? CROWDED_SERIES_ORDER : SERIES_ORDER;
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900">{panel.title}</h4>
      <p className="mb-1 min-h-[2rem] text-xs text-gray-600">{panel.note}</p>
      <ResponsiveContainer width="100%" height={PANEL_HEIGHT}>
        <LineChart data={panel.rows} margin={{ top: 8, right: 14, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
          <XAxis
            type="number"
            dataKey="x"
            domain={xDomain}
            ticks={xTicks}
            tick={TICK_STYLE}
            allowDecimals={false}
            padding={{ left: 10, right: 10 }}
          />
          <YAxis
            type="number"
            domain={[yAxis.lo, yAxis.hi]}
            ticks={yAxis.ticks}
            tick={TICK_STYLE}
            tickFormatter={v => (panel.id === 'car_dependency' ? `${v}%` : String(v))}
            width={44}
          />
          <Tooltip content={<TrendTooltip panel={panel} />} />
          {[...panel.series].sort((a, b) => order[a.kind] - order[b.kind]).map(s => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              connectNulls
              isAnimationActive={false}
              {...lineProps(s, crowded)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendLegend({ data }: { data: TrendData }) {
  return (
    <Legend label="Key to the trend charts">
      {data.areaLegend
        ? data.areaLegend.map(a => <LegendItem key={a.name} swatch={<LineSwatch color={a.color} width={2.5} />}>{a.name}</LegendItem>)
        : <LegendItem swatch={<LineSwatch color={MANY_AREAS_COLOR} width={2.5} />}>Selected areas</LegendItem>}
      {data.medianLegend.map(m => (
        <LegendItem key={m.name} swatch={<LineSwatch color={MEDIAN_COLOR} width={1.75} dash={MEDIAN_DASH} />}>{m.name}</LegendItem>
      ))}
      {data.hasProjection && (
        <LegendItem swatch={<LineSwatch color="#374151" dash={PROJECTED_DASH} />}>Projection to 2041 (dashed)</LegendItem>
      )}
    </Legend>
  );
}

/**
 * Small charts of the trends behind the findings: car dependency (Census years), road crashes per 10,000
 * residents (each year on its own population) and population against the DPE projection (2021 = 100). Selected
 * areas are coloured lines, each comparison group's median a dotted grey one.
 */
export default function TrendSmallMultiples({ assessment }: { assessment: NeedsAssessment }) {
  const data = useMemo(() => trendData(assessment), [assessment]);
  if (assessment.areas.length === 0) return null;
  if (data.message) return <ChartEmpty>{data.message}</ChartEmpty>;

  const missing = data.panels.filter(p => p.noData.length > 0);
  return (
    <div>
      <TrendLegend data={data} />
      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
        {data.panels.map(panel => <TrendPanelChart key={panel.id} panel={panel} crowded={data.areaLegend === null} />)}
      </div>
      <ChartNotes>
        {!data.areaLegend && <p>The selected areas are all drawn in one colour; hover over a line to see their values.</p>}
        {data.omittedMedians > 0 && (
          <p>
            Medians are drawn for the first {data.medianLegend.length} comparison groups; {data.omittedMedians} further
            {data.omittedMedians === 1 ? ' group is' : ' groups are'} not drawn.
          </p>
        )}
        {missing.map(p => <p key={p.id}>No {p.trendName} trend: {p.noData.join(', ')}.</p>)}
      </ChartNotes>
    </div>
  );
}
