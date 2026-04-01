type ModeShare = { name: string; value: number };

/**
 * Returns Car (driver) mode share percentage by name lookup.
 * Safer than hardcoded array index which breaks if array is reordered.
 */
export function getCarModeShare(journeyToWork: ModeShare[]): number {
  return journeyToWork.find(m => m.name === 'Car (driver)')?.value ?? 0;
}

/**
 * Returns total public transport mode share (Train + Bus + Ferry) by name lookup.
 * Includes Ferry — the old index-based approach missed it.
 */
export function getPTModeShare(journeyToWork: ModeShare[]): number {
  return journeyToWork
    .filter(m => ['Train', 'Bus', 'Ferry'].includes(m.name))
    .reduce((sum, m) => sum + m.value, 0);
}
