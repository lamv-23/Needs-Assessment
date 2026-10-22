'use client';

import useSWR from 'swr';
import type { Sa2NeedsFile } from '@/lib/needs/types';

/** Every NSW SA2's indicators (scripts/build-sa2-needs.ts), about 570 KB, served as a static file. */
export const SA2_NEEDS_URL = '/data/sa2-needs.json';

async function fetchSa2Needs(url: string): Promise<Sa2NeedsFile> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<Sa2NeedsFile>;
}

/**
 * The SA2 needs file for the drill-down on /needs. It is fetched once and kept: the file only changes with a rebuild,
 * so it is not revalidated on focus or reconnect. `isLoading` is true until the first response. A failed request is
 * not retried (the page asks for a reload): `error` is set and `file` stays null, so the page can show the rest of the
 * assessment without the SA2s, and the Word export does not wait on retries.
 */
export function useSa2Needs(): { file: Sa2NeedsFile | null; error: Error | null; isLoading: boolean } {
  const { data, error, isLoading } = useSWR<Sa2NeedsFile, Error>(SA2_NEEDS_URL, fetchSa2Needs, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  });
  return { file: data ?? null, error: error ?? null, isLoading };
}
