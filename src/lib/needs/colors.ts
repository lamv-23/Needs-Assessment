import { CHART_COLORS } from '@/lib/utils';

/**
 * Sequential need scale, lowest to highest need: five steps, one per 20 percentile points. Light
 * blue to dark red through amber, so the high-need end stays distinct when printed in greyscale.
 */
export const NEED_SCALE: readonly string[] = ['#eff6ff', '#bfdbfe', '#fcd34d', '#f97316', '#b91c1c'];

/** An indicator with no value. Never part of the need scale. */
export const NO_DATA_COLOR = '#e5e7eb';

/** Cells that are not shaded by need: benchmark columns and context-only indicators. */
export const NEUTRAL_FILL = '#f3f4f6';

const DARK_TEXT = '#111827';
const LIGHT_TEXT = '#ffffff';

/** Index into `NEED_SCALE` for a percentile; out-of-range values clamp to the end steps. */
function scaleIndex(percentile: number): number {
  return Math.min(NEED_SCALE.length - 1, Math.max(0, Math.floor(percentile / 20)));
}

/** Fill for a need percentile: [0,20) is the first step ... [80,100] the last; null (no data) is grey. */
export function needColor(percentile: number | null): string {
  if (percentile === null || Number.isNaN(percentile)) return NO_DATA_COLOR;
  return NEED_SCALE[scaleIndex(percentile)];
}

/** Readable text colour on `needColor(percentile)`: white only on the darkest step. */
export function needTextColor(percentile: number | null): string {
  if (percentile === null || Number.isNaN(percentile)) return DARK_TEXT;
  return scaleIndex(percentile) === NEED_SCALE.length - 1 ? LIGHT_TEXT : DARK_TEXT;
}

/** Most selected areas that are named on a chart; the rest are plotted unnamed. */
export const MAX_LABELLED = 12;

/** The selected areas that get a name on the chart: the first `MAX_LABELLED`, in selection order. */
export function labelledIds(selected: string[]): string[] {
  return selected.slice(0, MAX_LABELLED);
}

/** An area's colour on every needs chart, by its position in the selection. */
export function areaColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/** Benchmark series and reference lines. Dashes, not hue, tell Greater Sydney from NSW. */
export const BENCHMARK_COLOR = '#475569';
