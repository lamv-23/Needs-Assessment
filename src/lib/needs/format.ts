import type { IndicatorDef } from './types';

const NO_DATA = 'No data';

/** `toFixed` without a "-0.0" for small negatives. */
function fixed(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  return Number(text) === 0 ? text.replace('-', '') : text;
}

/**
 * A need score as shown: rounded down. Band thresholds are whole numbers, so floor(score) >= T exactly
 * when score >= T, and a shown score never contradicts its band (59.9 is "59", not "60", and Moderate).
 */
export function displayScore(score: number): number {
  return Math.floor(score);
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

/** A difference with an explicit sign, "+1.2 pp" or "−0.4 per 10,000"; null when it shows as zero. */
export function formatSignedDiff(def: IndicatorDef, diff: number): string | null {
  if (Number(Math.abs(diff).toFixed(def.decimals)) === 0) return null;
  return `${diff > 0 ? '+' : '−'}${formatDiff(def, Math.abs(diff))}`;
}

/** "Blacktown's", "Blue Mountains'". */
export function possessive(name: string): string {
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

/** A label inside a sentence: "Car dependency" becomes "car dependency", but "SEIFA ..." and "AM-peak ..." keep their capitals. */
export function inSentence(label: string): string {
  const firstWord = label.split(' ')[0];
  return /[A-Z]/.test(firstWord.slice(1)) ? label : label.charAt(0).toLowerCase() + label.slice(1);
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
