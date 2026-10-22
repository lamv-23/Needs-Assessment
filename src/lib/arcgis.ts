/**
 * Minimal client for ABS / NSW ArcGIS FeatureServer layers (e.g.
 * https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SA2/FeatureServer/0).
 *
 * queryFeatureServer() pages a query by resultOffset until the layer is
 * exhausted, so a 112,738-feature mesh-block layer comes back as one array.
 * Build scripts only — nothing in the app bundle imports this.
 *
 * Server quirks this works around (checked against geo.abs.gov.au, 2026-10-22):
 *  - f=geojson silently drops the centroid: with returnGeometry=false &
 *    returnCentroid=true the features come back with geometry null. The
 *    centroid is only present in f=json, so a centroid query is made as f=json
 *    and each feature is rebuilt as a GeoJSON Point.
 *  - maxRecordCount is 2,000, but the server can return a shorter page (it also
 *    caps by geometry size), so the offset advances by the features actually
 *    received, never by the requested page size.
 *  - Failures can arrive as HTTP 200 with an `error` body ({ error: { code } }).
 */

export const ARCGIS_PAGE_SIZE = 2000;

export interface FeatureServerQuery {
  where: string;
  outFields: string[];
  returnGeometry: boolean;
  /**
   * Return each feature's centroid (lng/lat) as a GeoJSON Point instead of its
   * geometry. Requires returnGeometry false.
   */
  returnCentroid?: boolean;
}

export interface FeatureServerOptions {
  pageSize?: number;
  /** Retries per page for transient failures (network errors, HTTP 408/429/5xx). */
  retries?: number;
  /** First retry waits this long; each further retry doubles it (plus jitter). */
  retryBaseMs?: number;
  /** Abort a single request after this long. */
  timeoutMs?: number;
}

const DEFAULT_RETRIES = 5;
const DEFAULT_RETRY_BASE_MS = 1000;
const DEFAULT_TIMEOUT_MS = 120_000;
// Guard against a server that never stops paging: 500 pages is 1M features at 2,000 a page.
const MAX_PAGES = 500;

/** A failure retrying cannot fix (bad query, malformed response); anything else is retried. */
class FatalArcGisError extends Error {}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface EsriJsonFeature {
  attributes?: Record<string, unknown>;
  centroid?: { x: number; y: number };
}

interface PageResult {
  features: GeoJSON.Feature[];
  /** The server's exceededTransferLimit flag, or undefined when it did not send one. */
  exceeded: boolean | undefined;
}

function parsePage(body: unknown, asCentroids: boolean): PageResult {
  const payload = body as {
    error?: { code?: number; message?: string; details?: string[] };
    features?: unknown[];
    exceededTransferLimit?: boolean;
    properties?: { exceededTransferLimit?: boolean };
  };

  if (payload.error) {
    const { code, message, details } = payload.error;
    const text = `ArcGIS error ${code ?? '?'}: ${message ?? 'unknown'}${details?.length ? ` (${details.join('; ')})` : ''}`;
    if (typeof code === 'number' && isTransientStatus(code)) throw new Error(text);
    throw new FatalArcGisError(text);
  }
  if (!Array.isArray(payload.features)) throw new FatalArcGisError('ArcGIS response has no features array');

  const exceeded = payload.exceededTransferLimit ?? payload.properties?.exceededTransferLimit;

  if (!asCentroids) return { features: payload.features as GeoJSON.Feature[], exceeded };

  const features = (payload.features as EsriJsonFeature[]).map((f): GeoJSON.Feature => {
    const c = f.centroid;
    if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) {
      throw new FatalArcGisError('ArcGIS feature has no centroid');
    }
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.x, c.y] },
      properties: f.attributes ?? {},
    };
  });
  return { features, exceeded };
}

async function fetchPage(
  url: string,
  form: URLSearchParams,
  asCentroids: boolean,
  retries: number,
  retryBaseMs: number,
  timeoutMs: number,
): Promise<PageResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(retryBaseMs * 2 ** (attempt - 1) * (1 + Math.random() * 0.25));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const text = `ArcGIS HTTP ${res.status} ${res.statusText}`.trim();
        throw isTransientStatus(res.status) ? new Error(text) : new FatalArcGisError(text);
      }
      return parsePage(await res.json(), asCentroids);
    } catch (err) {
      // Network failures, timeouts and truncated (unparseable) bodies are worth another go.
      if (err instanceof FatalArcGisError) throw err;
      lastError = err;
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`ArcGIS request failed after ${retries + 1} attempts: ${reason}`);
}

/**
 * Query a FeatureServer layer and return every matching feature as GeoJSON in
 * WGS84 (outSR=4326), paging by resultOffset (2,000 per page) in objectid order.
 *
 * @param layerUrl e.g. https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SA2/FeatureServer/0
 */
export async function queryFeatureServer(
  layerUrl: string,
  params: FeatureServerQuery,
  options: FeatureServerOptions = {},
): Promise<GeoJSON.Feature[]> {
  const { where, outFields, returnGeometry, returnCentroid = false } = params;
  if (returnCentroid && returnGeometry) {
    throw new Error('queryFeatureServer: returnCentroid requires returnGeometry false');
  }
  const pageSize = options.pageSize ?? ARCGIS_PAGE_SIZE;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const url = `${layerUrl.replace(/\/+$/, '')}/query`;
  const all: GeoJSON.Feature[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const form = new URLSearchParams({
      where,
      outFields: outFields.join(','),
      returnGeometry: String(returnGeometry),
      outSR: '4326',
      // A stable order is what makes resultOffset paging safe.
      orderByFields: 'objectid',
      resultOffset: String(all.length),
      resultRecordCount: String(pageSize),
      f: returnCentroid ? 'json' : 'geojson',
    });
    if (returnCentroid) form.set('returnCentroid', 'true');

    const { features, exceeded } = await fetchPage(url, form, returnCentroid, retries, retryBaseMs, timeoutMs);
    all.push(...features);

    // The server's flag is authoritative when it sends one. Without it, a full page means there may be more.
    // An empty page always ends the loop, so a server that keeps flagging a limit cannot spin forever.
    const more = exceeded ?? features.length >= pageSize;
    if (features.length === 0 || !more) return all;
  }
  throw new Error(`ArcGIS query did not finish within ${MAX_PAGES} pages`);
}
