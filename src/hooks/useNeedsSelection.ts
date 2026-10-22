'use client';

import { useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { parseNeedsParams, serializeNeedsParams, type NeedsParams } from '@/lib/needs/selection';
import type { NeedsMode, Universe } from '@/lib/needs/types';

export type NeedsSelection = NeedsParams & {
  setAreaIds(ids: string[]): void;
  setMode(mode: NeedsMode): void;
  setUniverse(universe: Universe): void;
};

/**
 * The /needs selection, held in the URL (`?lgas=a,b&mode=combined&universe=gsyd`) so a view can be shared.
 * Uses `useSearchParams`, so the page must render it inside a `<Suspense>` boundary.
 * A setter rewrites the URL from the valid ids only, which drops any `invalidIds`.
 */
export function useNeedsSelection(): NeedsSelection {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const parsed = useMemo(() => parseNeedsParams(new URLSearchParams(query)), [query]);

  // Two setters called in one tick would each start from the same stale URL; the ref carries the first one's change.
  const latest = useRef(parsed);
  latest.current = parsed;

  const update = useCallback((change: Partial<Pick<NeedsParams, 'areaIds' | 'mode' | 'universe'>>) => {
    const next = { ...latest.current, ...change };
    latest.current = next;
    const qs = serializeNeedsParams(next);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname]);

  const setAreaIds = useCallback((areaIds: string[]) => update({ areaIds }), [update]);
  const setMode = useCallback((mode: NeedsMode) => update({ mode }), [update]);
  const setUniverse = useCallback((universe: Universe) => update({ universe }), [update]);

  return { ...parsed, setAreaIds, setMode, setUniverse };
}
