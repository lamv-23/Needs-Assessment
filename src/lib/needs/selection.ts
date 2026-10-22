import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import type { NeedsMode, Universe } from './types';

export interface NeedsParams {
  /** Valid LGA ids, in URL order, de-duplicated. */
  areaIds: string[];
  /** Everything else that was asked for (unknown, SA2, suburb, benchmark), in URL order, de-duplicated. */
  invalidIds: string[];
  mode: NeedsMode;
  universe: Universe;
}

export const DEFAULT_MODE: NeedsMode = 'separate';
export const DEFAULT_UNIVERSE: Universe = 'nsw';

const MODES: readonly NeedsMode[] = ['separate', 'combined'];
const UNIVERSES: readonly Universe[] = ['nsw', 'gsyd', 'region', 'peer'];

/** /needs only assesses LGAs. */
const VALID_LGA_IDS: ReadonlySet<string> = new Set(
  SAMPLE_AREAS.filter(a => a.type === 'lga').map(a => a.id),
);

/** Reads `lgas=a,b`, `mode` and `universe`. Never falls back to a default area: an empty selection stays empty. */
export function parseNeedsParams(params: URLSearchParams): NeedsParams {
  const areaIds: string[] = [];
  const invalidIds: string[] = [];
  for (const raw of (params.get('lgas') ?? '').split(',')) {
    const id = raw.trim();
    if (!id) continue;
    const bucket = VALID_LGA_IDS.has(id) ? areaIds : invalidIds;
    if (!bucket.includes(id)) bucket.push(id);
  }
  const mode = params.get('mode');
  const universe = params.get('universe');
  return {
    areaIds,
    invalidIds,
    mode: MODES.find(m => m === mode) ?? DEFAULT_MODE,
    universe: UNIVERSES.find(u => u === universe) ?? DEFAULT_UNIVERSE,
  };
}

/** `lgas=a,b&mode=combined&universe=gsyd`; defaults are omitted. Ids are written unencoded (they are `[a-z0-9_]`). */
export function serializeNeedsParams(p: Pick<NeedsParams, 'areaIds' | 'mode' | 'universe'>): string {
  const parts: string[] = [];
  if (p.areaIds.length > 0) parts.push(`lgas=${p.areaIds.join(',')}`);
  if (p.mode !== DEFAULT_MODE) parts.push(`mode=${p.mode}`);
  if (p.universe !== DEFAULT_UNIVERSE) parts.push(`universe=${p.universe}`);
  return parts.join('&');
}
