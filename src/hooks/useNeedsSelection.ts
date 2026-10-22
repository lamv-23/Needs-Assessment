'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  issueSelection, parseNeedsParams, serializeNeedsParams, settleSelection,
  type NeedsParams, type PendingSelection, type SelectionState,
} from '@/lib/needs/selection';
import type { NeedsMode, Universe } from '@/lib/needs/types';

export type NeedsSelection = NeedsParams & {
  setAreaIds(ids: string[]): void;
  setMode(mode: NeedsMode): void;
  setUniverse(universe: Universe): void;
};

/**
 * The /needs selection, held in the URL (`?lgas=a,b&mode=combined&universe=gsyd`) so a view can be shared.
 * Uses `useSearchParams`, so the page must render it inside a `<Suspense>` boundary.
 *
 * `router.replace` is async: `useSearchParams` keeps returning the old query until the navigation commits.
 * Until then the hook returns the selection the user just made, so a second click builds on the first
 * instead of the stale URL. A setter rewrites the URL from the valid ids only, which drops any `invalidIds`.
 */
export function useNeedsSelection(): NeedsSelection {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const parsed = useMemo(() => parseNeedsParams(new URLSearchParams(query)), [query]);

  // The ref lets setters called in one tick compose; the state re-renders consumers with the optimistic value.
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const pendingRef = useRef<PendingSelection | null>(null);

  useEffect(() => {
    const settled = settleSelection(pendingRef.current, parsed);
    if (settled !== pendingRef.current) {
      pendingRef.current = settled;
      setPending(settled);
    }
  }, [parsed]);

  const update = useCallback((patch: Partial<SelectionState>) => {
    const next = issueSelection(parsed, pendingRef.current, patch);
    pendingRef.current = next;
    setPending(next);
    const qs = serializeNeedsParams(next.value);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, parsed]);

  const setAreaIds = useCallback((areaIds: string[]) => update({ areaIds }), [update]);
  const setMode = useCallback((mode: NeedsMode) => update({ mode }), [update]);
  const setUniverse = useCallback((universe: Universe) => update({ universe }), [update]);

  const shown = pending?.value ?? parsed;
  return {
    areaIds: shown.areaIds,
    mode: shown.mode,
    universe: shown.universe,
    invalidIds: parsed.invalidIds,
    setAreaIds,
    setMode,
    setUniverse,
  };
}
