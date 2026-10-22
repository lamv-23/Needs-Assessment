import { wrapLabel } from '@/lib/needs/chart-data';
import { CHART_TOOLTIP_STYLE } from '@/lib/utils';

/** Pieces the insight charts and the quadrant scatters share: legend swatches, scatter dots, notes, the empty state and row names on an axis. */

export const FONT = 'Inter, system-ui, sans-serif';
export const AXIS_TITLE_STYLE = { fontSize: 12, fontFamily: FONT, fill: '#111827' } as const;
export const GRID_STROKE = '#e5e7eb';
export const DARK_TEXT = '#111827';

/** The other LGAs of a comparison group on a scatter: small and translucent, so crowded stretches show up darker. */
export const OTHER_DOT_COLOR = '#9ca3af';
export const OTHER_DOT_OPACITY = 0.5;
const OTHER_DOT_RADIUS = 4.5;

export function OtherDot({ cx = 0, cy = 0 }: { cx?: number; cy?: number }) {
  return <circle cx={cx} cy={cy} r={OTHER_DOT_RADIUS} fill={OTHER_DOT_COLOR} fillOpacity={OTHER_DOT_OPACITY} />;
}

/** The tooltip of a scatter dot: the lines its data carry, the first in bold. */
export function DotTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { tooltip?: string[] } }> }) {
  const dot = active ? payload?.[0]?.payload : undefined;
  if (!dot?.tooltip) return null;
  return (
    <div style={CHART_TOOLTIP_STYLE} className="p-2">
      {dot.tooltip.map((line, i) => <div key={i} className={i === 0 ? 'font-semibold' : undefined}>{line}</div>)}
    </div>
  );
}

/** Shown inside the figure when there is nothing to draw, so the page can mount every figure in a fixed order (R48). */
export function ChartEmpty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-600">{children}</p>;
}

export function ChartNotes({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 space-y-1 text-xs text-gray-600">{children}</div>;
}

export function Legend({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-700">
      {children}
    </ul>
  );
}

export function LegendItem({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="whitespace-nowrap">
      {swatch}
      <span className="ml-1.5 align-middle">{children}</span>
    </li>
  );
}

const SWATCH_W = 26;
const SWATCH_H = 14;

function Swatch({ children }: { children: React.ReactNode }) {
  return (
    <svg width={SWATCH_W} height={SWATCH_H} viewBox={`0 0 ${SWATCH_W} ${SWATCH_H}`} aria-hidden="true" className="inline-block align-middle">
      {children}
    </svg>
  );
}

export function DotSwatch({ color, opacity = 1, ring }: { color: string; opacity?: number; ring?: boolean }) {
  return (
    <Swatch>
      {ring && <circle cx={SWATCH_W / 2} cy={SWATCH_H / 2} r={6.5} fill="none" stroke={DARK_TEXT} strokeWidth={1.5} />}
      <circle cx={SWATCH_W / 2} cy={SWATCH_H / 2} r={ring ? 3.5 : 4.5} fill={color} fillOpacity={opacity} />
    </Swatch>
  );
}

export function DiamondSwatch({ color }: { color: string }) {
  const [cx, cy, r] = [SWATCH_W / 2, SWATCH_H / 2, 6];
  return (
    <Swatch>
      <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} fill={color} />
    </Swatch>
  );
}

export function LineSwatch({ color, dash, width = 2 }: { color: string; dash?: string; width?: number }) {
  return (
    <Swatch>
      <line x1={1} x2={SWATCH_W - 1} y1={SWATCH_H / 2} y2={SWATCH_H / 2} stroke={color} strokeWidth={width} strokeDasharray={dash} />
    </Swatch>
  );
}

export function BarSwatch({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return (
    <Swatch>
      <rect x={4} y={2} width={18} height={10} fill={color} fillOpacity={opacity} />
    </Swatch>
  );
}

/** Longest line of a row name on an axis, in characters. */
export const ROW_NAME_CHARS = 24;
export const ROW_AXIS_WIDTH = 176;

interface RowNameTickProps {
  x?: number;
  y?: number;
  payload?: { value: string | number };
  /** Names by row index, for an axis whose ticks are row positions rather than names. */
  names?: string[];
}

/** An area's name on the axis, wrapped to two lines. */
export function RowNameTick({ x = 0, y = 0, payload, names }: RowNameTickProps) {
  const name = names ? names[Number(payload?.value)] ?? '' : String(payload?.value ?? '');
  const lines = wrapLabel(name, ROW_NAME_CHARS, 2);
  return (
    <text x={x - 8} textAnchor="end" fontSize={12} fill="#374151">
      {lines.map((line, i) => (
        <tspan key={i} x={x - 8} y={y + 4 + (i - (lines.length - 1) / 2) * 13}>{line}</tspan>
      ))}
    </text>
  );
}
