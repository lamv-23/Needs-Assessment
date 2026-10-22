import { GREATER_SYDNEY_GCCSA_AREA_IDS } from '@/lib/data/sample-areas';
import type { PeerGroup } from './types';

export const PEER_GROUP_LABELS: Record<PeerGroup, string> = {
  metro_inner: 'Inner metropolitan',
  metro_middle: 'Middle metropolitan',
  metro_outer: 'Outer metropolitan',
  regional_city: 'Regional city',
  regional_town: 'Regional town',
  rural: 'Rural and remote',
};

/** Plural, lower-case form for sentences ("among inner metropolitan LGAs"). */
export const PEER_GROUP_PLURALS: Record<PeerGroup, string> = {
  metro_inner: 'inner metropolitan LGAs',
  metro_middle: 'middle metropolitan LGAs',
  metro_outer: 'outer metropolitan LGAs',
  regional_city: 'regional cities',
  regional_town: 'regional towns',
  rural: 'rural and remote LGAs',
};

// People per km² of boundary area (metropolitan LGAs) and residents (all other LGAs).
// The metro thresholds were set against real boundary-area density (about 7 / 13 / 14 LGAs).
const METRO_INNER_DENSITY = 4000;
const METRO_MIDDLE_DENSITY = 1700;
const REGIONAL_CITY_POPULATION = 50000;
const REGIONAL_TOWN_POPULATION = 15000;

/**
 * Peer group by the spec's rules. Metropolitan means the LGA is in the ABS
 * Greater Sydney GCCSA (so Central Coast is outer metropolitan) and is split by
 * density; every other LGA is split by population.
 */
export function peerGroupFor(input: { areaId: string; population: number; densityPerKm2: number }): PeerGroup {
  if (GREATER_SYDNEY_GCCSA_AREA_IDS.includes(input.areaId)) {
    if (input.densityPerKm2 >= METRO_INNER_DENSITY) return 'metro_inner';
    if (input.densityPerKm2 >= METRO_MIDDLE_DENSITY) return 'metro_middle';
    return 'metro_outer';
  }
  if (input.population >= REGIONAL_CITY_POPULATION) return 'regional_city';
  if (input.population >= REGIONAL_TOWN_POPULATION) return 'regional_town';
  return 'rural';
}
