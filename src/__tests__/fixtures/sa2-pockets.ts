/**
 * A hand-built SA2 needs file for the pockets-of-need tests. The names are real SA2 names, but the values are made up so
 * that the ranking is known: every SA2 has a need level, and each indicator moves with it (a higher value for an
 * indicator where higher means more need, a lower value for the others), so the overall scores run in level order.
 *
 * There are 50 ranked SA2s, so the highest-need 10% are ranks 1-5 (P2-R15):
 *   1-4  Mount Druitt - Whalan, Lethbridge Park - Tregear, Blackett - Dharruk, Bidwill - Hebersham - Emerton (Blacktown)
 *   5    St Marys - North St Marys (Penrith)
 *   6    Colyton - Oxley Park (Penrith): just outside the 10%
 * Prospect Reservoir (Blacktown) has the most extreme values of all but only 12 residents, so it is not ranked. Mosman's
 * two SA2s are near the bottom. Toongabbie - West straddles Blacktown and Cumberland.
 */

import { INDICATOR_BY_ID } from '@/lib/needs/indicators';
import { SA2_INDICATOR_IDS } from '@/lib/needs/sa2';
import type { IndicatorId, IndicatorValue, Sa2NeedsFile, Sa2Record } from '@/lib/needs/types';

type Shares = Array<[lgaId: string, share: number]>;

const values = (level: number): Partial<Record<IndicatorId, IndicatorValue>> => Object.fromEntries(
  SA2_INDICATOR_IDS.map(id => [id, { value: INDICATOR_BY_ID[id].direction === 'higher' ? level : 100 - level }]),
);

function sa2(sa2Code: string, name: string, level: number, shares: Shares, population = 10000): Sa2Record {
  return {
    sa2Code,
    name,
    population,
    lowPopulation: population < 100,
    nonSpatial: false,
    primaryLgaId: shares[0]?.[0] ?? null,
    lgaShares: shares.map(([lgaId, share]) => ({ lgaId, share })),
    values: values(level),
  };
}

const BLACKTOWN: Shares = [['lga_blacktown', 1]];
const PENRITH: Shares = [['lga_penrith', 1]];
const MOSMAN: Shares = [['lga_mosman', 1]];
const ELSEWHERE: Shares = [['lga_dubbo', 1]];

const NAMED: Sa2Record[] = [
  sa2('116031317', 'Mount Druitt - Whalan', 50, BLACKTOWN),
  sa2('116031315', 'Lethbridge Park - Tregear', 49, BLACKTOWN),
  sa2('116031312', 'Blackett - Dharruk', 48, BLACKTOWN),
  sa2('116031313', 'Bidwill - Hebersham - Emerton', 47, BLACKTOWN),
  sa2('124031463', 'St Marys - North St Marys', 46, PENRITH),
  sa2('124031458', 'Colyton - Oxley Park', 45, PENRITH),
  sa2('116011304', 'Toongabbie - West', 44, [['lga_blacktown', 0.7146], ['lga_cumberland', 0.2854]]),
  sa2('121041415', 'Mosman - North', 2, MOSMAN),
  sa2('121041416', 'Mosman - South', 1, MOSMAN),
  sa2('116031316', 'Prospect Reservoir', 99, BLACKTOWN, 12),
];

/** 41 SA2s elsewhere at levels 3 to 43, so that 50 SA2s are ranked. */
const FILLERS: Sa2Record[] = Array.from({ length: 41 }, (_, i) => sa2(`9000000${String(i).padStart(2, '0')}`, `Filler ${i + 1}`, i + 3, ELSEWHERE));

export const SA2_POCKETS_FILE: Sa2NeedsFile = {
  generatedAt: '2026-10-23T00:00:00.000Z',
  records: [...NAMED, ...FILLERS].sort((a, b) => (a.sa2Code < b.sa2Code ? -1 : 1)),
};
