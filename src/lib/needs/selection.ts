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

export type SelectionState = Pick<NeedsParams, 'areaIds' | 'mode' | 'universe'>;

/**
 * A selection the user has made that the URL has not caught up with yet. `router.replace` is async, so
 * `useSearchParams` keeps returning the old query until the navigation commits; the next click must start
 * from `value`, not from that stale query.
 */
export interface PendingSelection {
  value: SelectionState;
  /** Queries of the navigations still in flight, oldest first. */
  issued: string[];
}

/** Applies `patch` on top of the pending selection (or, with none, the committed one) and records its query. */
export function issueSelection(
  committed: SelectionState,
  pending: PendingSelection | null,
  patch: Partial<SelectionState>,
): PendingSelection {
  const base = pending?.value ?? { areaIds: committed.areaIds, mode: committed.mode, universe: committed.universe };
  const value = { ...base, ...patch };
  return { value, issued: [...(pending?.issued ?? []), serializeNeedsParams(value)] };
}

/**
 * Called when the committed URL changes. Keeps the pending selection while one of our later navigations
 * is still in flight, and drops it once the last has landed or when the URL changed some other way
 * (back button, a link).
 */
export function settleSelection(pending: PendingSelection | null, committed: SelectionState): PendingSelection | null {
  if (!pending) return null;
  const landed = pending.issued.indexOf(serializeNeedsParams(committed));
  if (landed === -1 || landed === pending.issued.length - 1) return null;
  return { ...pending, issued: pending.issued.slice(landed + 1) };
}
