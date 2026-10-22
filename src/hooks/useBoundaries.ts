'use client';

import useSWR from 'swr';
import type { FeatureCollection } from 'geojson';
import { loadBoundaries } from '@/lib/needs/boundaries';

/**
 * A boundary file of the /needs maps (`loadBoundaries`), or nothing while `url` is null. Loaded once and kept, like the
 * SA2 file: not revalidated, and a failed request is not retried (`error` is set and `boundaries` stays null). The page
 * holds the boundaries, not the maps, so the Word export can wait for them and leave out a map whose boundaries could
 * not be loaded instead of picturing a placeholder (P2-R19).
 */
export function useBoundaries(url: string | null): {
  boundaries: FeatureCollection | null;
  error: Error | null;
  isLoading: boolean;
} {
  const { data, error, isLoading } = useSWR<FeatureCollection, Error>(url, loadBoundaries, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    onError: (error) => console.error(`Failed to load map boundaries (${url}):`, error),
  });
  return { boundaries: data ?? null, error: error ?? null, isLoading };
}
