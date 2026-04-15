type ModeShare = { name: string; value: number };
type DistributionShare = { name: string; value: number };

function normaliseLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function getModeValue(
  journeyToWork: ModeShare[],
  matchers: string[]
): number {
  const normalisedMatchers = matchers.map(normaliseLabel);
  return journeyToWork
    .filter((item) => normalisedMatchers.includes(normaliseLabel(item.name)))
    .reduce((sum, item) => sum + item.value, 0);
}

/**
 * Returns Car (driver) mode share percentage by name lookup.
 * Safer than hardcoded array index which breaks if array is reordered.
 */
export function getCarModeShare(journeyToWork: ModeShare[]): number {
  return getModeValue(journeyToWork, ['Car (driver)']);
}

/**
 * Returns total public transport mode share (Train + Bus + Ferry) by name lookup.
 * Includes Ferry — the old index-based approach missed it.
 */
export function getPTModeShare(journeyToWork: ModeShare[]): number {
  return getModeValue(journeyToWork, ['Train', 'Bus', 'Ferry', 'Light rail', 'Light Rail', 'Tram']);
}

export function getActiveModeShare(journeyToWork: ModeShare[]): number {
  return getModeValue(journeyToWork, ['Cycling', 'Walking']);
}

export function getVehicleOwnershipShare(
  vehicleOwnership: DistributionShare[],
  matcher: 'zero-car' | 'multi-car'
): number {
  return vehicleOwnership.find((item) => {
    const label = normaliseLabel(item.name);
    if (matcher === 'zero-car') {
      return label.includes('no vehicle') || label.includes('0 vehicles') || label.includes('0 vehicle');
    }
    return label.includes('3+') || label.includes('3 or more');
  })?.value ?? 0;
}
