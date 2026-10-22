import type { FeatureCollection } from 'geojson';

/** The simplified boundary files the /needs maps draw. */
export const LGA_BOUNDARIES_URL = '/geo/lga-nsw-simple.json';
export const SA2_BOUNDARIES_URL = '/geo/sa2-nsw-simple.json';

const requests = new Map<string, Promise<FeatureCollection>>();

/**
 * A boundary file, fetched and parsed once per page load from one cache keyed by URL, so every caller (the page's
 * `useBoundaries`, for the need map and the SA2 map) shares one request per file. A failed request is dropped from the
 * cache, so the next caller tries again.
 */
export function loadBoundaries(url: string): Promise<FeatureCollection> {
  let request = requests.get(url);
  if (!request) {
    request = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return res.json() as Promise<FeatureCollection>;
      })
      .catch((error) => {
        requests.delete(url);
        throw error;
      });
    requests.set(url, request);
  }
  return request;
}
