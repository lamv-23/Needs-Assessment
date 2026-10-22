import type { IndicatorDef } from './types';

const NO_DATA = 'No data';

/** `toFixed` without a "-0.0" for small negatives. */
function fixed(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  return Number(text) === 0 ? text.replace('-', '') : text;
}

/** "83.8%", "987", "10.0 per 1,000", "12.3 km"; null (no data) is never shown as 0. */
export function formatValue(def: IndicatorDef, value: number | null): string {
  if (value === null) return NO_DATA;
  const text = fixed(value, def.decimals);
  switch (def.unit) {
    case '%':
      return `${text}%`;
    case 'score':
      return text;
    default:
      return `${text} ${def.unit}`;
  }
}

/** A difference between two values of `def`: percentage points for %, points for scores, else the unit. */
export function formatDiff(def: IndicatorDef, diff: number): string {
  const text = fixed(diff, def.decimals);
  switch (def.unit) {
    case '%':
      return `${text} pp`;
    case 'score':
      return `${text} points`;
    default:
      return `${text} ${def.unit}`;
  }
}
