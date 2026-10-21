import { formatPercent } from '@/lib/utils';

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

export interface FrequencyBenchmark {
  label: 'Greater Sydney' | 'NSW';
  share: number; // % of stops with 4+ departures/hr, 7–9am
}

/** Greater Sydney LGAs are compared with Greater Sydney; all others with NSW. */
export function pickFrequencyBenchmark(
  benchmarks: { greaterSydneyFrequentStopShare: number; nswFrequentStopShare: number } | undefined,
  region: string | undefined,
): FrequencyBenchmark | null {
  if (!benchmarks) return null;
  return region === 'Greater Sydney'
    ? { label: 'Greater Sydney', share: benchmarks.greaterSydneyFrequentStopShare }
    : { label: 'NSW', share: benchmarks.nswFrequentStopShare };
}

const LOW_PT_SHARE = 15;      // % — below this, PT plays a minor role
const FREQUENCY_MARGIN = 5;   // percentage points below benchmark before calling a gap

/** Plain-language reading of stop supply, service frequency and PT use. */
export function describeStopsVsUse(input: {
  areaName: string;
  stops: number;
  ptShare: number;
  ptShareLabel: string;
  frequentStopShare: number | null;
  benchmark: FrequencyBenchmark | null;
}): string {
  const { areaName, stops, ptShare, ptShareLabel, frequentStopShare, benchmark } = input;
  const pt = `${formatPercent(ptShare)} ${ptShareLabel}`;

  if (frequentStopShare !== null && benchmark) {
    const frequent = `${formatPercent(frequentStopShare)} of stops have a combined service every 15 minutes or better at 7–9am (${benchmark.label} ${formatPercent(benchmark.share)})`;
    const frequencyGap = frequentStopShare < benchmark.share - FREQUENCY_MARGIN;
    const lowUse = ptShare < LOW_PT_SHARE;
    if (frequencyGap && lowUse) {
      return `⚠️ In ${areaName}, only ${frequent}, and public transport carries ${pt}: evidence of a service frequency gap rather than a lack of stops (${stops.toLocaleString()} stops).`;
    }
    if (!frequencyGap && lowUse) {
      return `⚠️ In ${areaName}, ${frequent}, yet public transport carries only ${pt}: frequency is not the main barrier. Look at the destinations served, travel times and reliability.`;
    }
    if (frequencyGap) {
      return `In ${areaName}, only ${frequent}, but public transport still carries ${pt}: there is demand that a more frequent network could serve better.`;
    }
    return `In ${areaName}, ${frequent}, and public transport carries ${pt}.`;
  }

  if (stops > 200 && ptShare < 20) {
    return `⚠️ ${areaName} has high PT stop coverage (${stops} stops) but low mode share (${pt}), suggesting a service frequency or reliability gap rather than a coverage gap.`;
  }
  if (stops < 50 && ptShare < LOW_PT_SHARE) {
    return `⚠️ ${areaName} has low PT stop coverage (${stops} stops) and low mode share, indicating a supply gap — additional stops and routes are needed.`;
  }
  return `${areaName} has ${stops} PT stops serving ${pt}.`;
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
