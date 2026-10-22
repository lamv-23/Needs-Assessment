'use client';

import { useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import {
  DEFAULT_STRIP_PLOT_PX, LABEL_DY, STRIP_NAME_CHARS, axisFraction, labelSide, stripData, wrapLabel,
  type StripPoint, type StripReference,
} from '@/lib/needs/chart-data';
import { BENCHMARK_COLOR } from '@/lib/needs/colors';
import { CHART_TICK_STYLE, CHART_TOOLTIP_STYLE } from '@/lib/utils';
import type { IndicatorId, NeedsAssessment } from '@/lib/needs/types';

const FONT = 'Inter, system-ui, sans-serif';
const CHART_HEIGHT = 300;
const MARGIN = { top: 28, right: 100, bottom: 58, left: 100 };
const DOT_R = 4;
const SELECTED_R = 7;
/** A named dot sits this far off the strip toward its name, so dots with the same value do not hide each other. */
const NUDGE = 5;

interface DotProps { cx?: number; cy?: number; payload?: StripPoint }

/** Every other NSW LGA: small and translucent so dense stretches of the strip show up darker. */
function GreyDot({ cx = 0, cy = 0, payload }: DotProps) {
  return <circle cx={cx} cy={cy} r={DOT_R} fill={payload?.color} fillOpacity={0.45} />;
}

/** A selected area: a coloured dot, named on a staggered level with a leader line when it has a level. */
function SelectedDot({ cx = 0, cy = 0, payload }: DotProps) {
  if (!payload) return null;
  const { level, color, name } = payload;
  const dy = level === null ? null : LABEL_DY[level];
  const above = dy !== null && dy < 0;
  const dotY = cy + (dy === null ? 0 : above ? -NUDGE : NUDGE);
  return (
    <g>
      {dy !== null && (
        <>
          <line x1={cx} x2={cx} y1={dotY + (above ? -SELECTED_R : SELECTED_R)} y2={cy + dy + (above ? 3 : -11)} stroke={color} strokeWidth={1} />
          <text
            x={cx}
            y={cy + dy}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill="#111827"
            stroke="#ffffff"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {wrapLabel(name, STRIP_NAME_CHARS, 1)[0]}
          </text>
        </>
      )}
      <circle cx={cx} cy={dotY} r={SELECTED_R} fill={color} stroke="#ffffff" strokeWidth={2} />
    </g>
  );
}

interface ReferenceLabelProps {
  viewBox?: { x?: number; y?: number; height?: number };
  reference: StripReference;
  /** Which side of its line the label goes. */
  side: 'left' | 'right';
}

/** Greater Sydney's label sits at the top of its line and NSW's at the bottom, clear of the area names. */
function ReferenceLabel({ viewBox, reference, side }: ReferenceLabelProps) {
  const x = viewBox?.x ?? 0;
  const top = viewBox?.y ?? 0;
  const y = reference.key === 'gsyd' ? top + 12 : top + (viewBox?.height ?? 0) - 6;
  return (
    <text
      x={x + (side === 'left' ? -5 : 5)}
      y={y}
      textAnchor={side === 'left' ? 'end' : 'start'}
      fontSize={11}
      fontWeight={600}
      fill={BENCHMARK_COLOR}
      stroke="#ffffff"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {reference.name} {reference.text}
    </text>
  );
}

function StripTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: StripPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div style={CHART_TOOLTIP_STYLE} className="p-2">
      <div className="font-semibold">{point.name}</div>
      <div>{point.text}</div>
    </div>
  );
}

/**
 * One indicator across all NSW LGAs as a single strip: other LGAs in grey, the selected areas in
 * colour (the first few named), Greater Sydney and NSW as reference lines. More need is always to
 * the right.
 */
export default function IndicatorStripPlot({ assessment, indicatorId }: { assessment: NeedsAssessment; indicatorId: IndicatorId }) {
  // Names are fitted to the plot's measured width, so they re-fit when the chart is resized.
  const [width, setWidth] = useState(DEFAULT_STRIP_PLOT_PX + MARGIN.left + MARGIN.right);
  if (assessment.areas.length === 0) return null;
  const { def, reversed, others, selected, references, axis, noData, unnamedCount, notes } = stripData(
    assessment, indicatorId, Math.max(width - MARGIN.left - MARGIN.right, 100),
  );

  if (others.length === 0 && selected.length === 0) {
    return <p className="text-sm text-gray-600">No data for {def.label.toLowerCase()}.</p>;
  }

  const sideOf = (reference: StripReference) => {
    const other = references.find(r => r !== reference);
    return labelSide(
      axisFraction(axis, reversed, reference.x),
      other ? axisFraction(axis, reversed, other.x) : null,
    );
  };
  const tick = (v: number) => {
    return def.unit === '%' ? `${v}%` : String(v);
  };
  // Labels such as "Road crashes per 10,000 residents" already carry their unit.
  const axisLabel = `${def.label}${def.label.includes(def.unit) ? '' : ` (${def.unit})`}: more need →`;

  return (
    <div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT} onResize={w => setWidth(w)}>
        <ScatterChart margin={MARGIN}>
          <XAxis
            type="number"
            dataKey="x"
            reversed={reversed}
            domain={[axis.lo, axis.hi]}
            ticks={axis.ticks}
            tick={{ ...CHART_TICK_STYLE, fontSize: 12 }}
            tickFormatter={tick}
            label={{ value: axisLabel, position: 'bottom', offset: 16, style: { fontSize: 12, fontFamily: FONT, fill: '#111827' } }}
          />
          <YAxis type="number" dataKey="y" domain={[-1, 1]} hide />
          {references.map(reference => (
            <ReferenceLine
              key={reference.key}
              x={reference.x}
              stroke={BENCHMARK_COLOR}
              strokeWidth={1.5}
              strokeDasharray={reference.key === 'gsyd' ? '6 3' : '2 3'}
              label={<ReferenceLabel reference={reference} side={sideOf(reference)} />}
            />
          ))}
          <Tooltip content={<StripTooltip />} cursor={false} />
          <Scatter name="Other LGAs" data={others.map(p => ({ ...p, y: 0 }))} shape={<GreyDot />} isAnimationActive={false} />
          <Scatter name="Selected" data={selected.map(p => ({ ...p, y: 0 }))} shape={<SelectedDot />} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-2 space-y-1 text-xs text-gray-600">
        <p>
          Grey dots: the other {others.length} NSW LGAs with data. Dashed line: Greater Sydney; dotted line: NSW.
        </p>
        {unnamedCount > 0 && (
          <p>{unnamedCount} selected {unnamedCount === 1 ? 'area is' : 'areas are'} shown without a name; hover over a dot to see it.</p>
        )}
        {noData.length > 0 && <p>No data for this indicator: {noData.join(', ')}.</p>}
        {notes.map(note => <p key={note}>{note}</p>)}
      </div>
    </div>
  );
}
