import * as XLSX from 'xlsx';

import { LGA_CODE_MAP } from '@/lib/abs-fetchers';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import { getLiveDataRepository, getSeedWriteRepository } from '@/lib/repositories';

const TFNSW_TRAFFIC_VOLUME_URL = 'https://api.transport.nsw.gov.au/v1/traffic_volume';
const TFNSW_PATRONAGE_ALL_MODES_RESOURCE =
  'https://opendata.transport.nsw.gov.au/data/dataset/public-transport-trips-all-modes/resource/ebe86b09-0c3c-49b8-b176-ad70ec8a1afd';
const TFNSW_PATRONAGE_SYDNEY_CBD_RESOURCE =
  'https://opendata.transport.nsw.gov.au/data/dataset/public-transport-trips-sydney-cbd/resource/6ce837bb-4011-442b-b253-460f36a42385';
const NSW_CRASH_DATA_XLSX_URL =
  'https://opendata.transport.nsw.gov.au/data/dataset/06f9cf3d-0a9d-4098-b0f0-fa9efbdd3921/resource/c6351d27-b1b0-48e9-93a6-a612cba88f99/download/nsw_road_crash_data_2020-2024_crash.xlsx';

const TRAFFIC_CACHE_DATASET = 'TRAFFIC_COUNTS_LIVE';
const CRASH_CACHE_DATASET = 'CRASH_SUMMARY_LIVE';
const PATRONAGE_CACHE_DATASET = 'PATRONAGE_SOURCE_LIVE';
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

type JsonRow = Record<string, unknown>;

export interface TfNSWPatronageSourceInfo {
  datasetUrl: string;
  viewUrl: string;
  source: 'tfnsw_tableau';
  structuredDataAvailable: false;
  lastCheckedAt: string;
}

export interface TfNSWTrafficTrendPoint {
  year: number;
  avgDailyVehicles: number;
  stationCount: number;
}

export interface TfNSWCrashTrendPoint {
  year: number;
  totalCrashes: number;
  fatalCrashes: number;
  injuryCrashes: number;
}

export interface TfNSWLiveTransportData {
  patronageSource: TfNSWPatronageSourceInfo | null;
  trafficTrend: TfNSWTrafficTrendPoint[] | null;
  crashTrend: TfNSWCrashTrendPoint[] | null;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function isFresh(fetchedAt: string): boolean {
  return Date.now() - new Date(fetchedAt).getTime() < CACHE_MAX_AGE_MS;
}

function parseCachedJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractRows(payload: unknown): JsonRow[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is JsonRow => typeof row === 'object' && row !== null);
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const objectPayload = payload as Record<string, unknown>;
  for (const key of ['rows', 'records', 'result', 'results', 'data']) {
    const candidate = objectPayload[key];
    if (Array.isArray(candidate)) {
      return candidate.filter((row): row is JsonRow => typeof row === 'object' && row !== null);
    }
  }

  const features = objectPayload.features;
  if (Array.isArray(features)) {
    return features
      .map((feature) => {
        if (!feature || typeof feature !== 'object') return null;
        const properties = (feature as Record<string, unknown>).properties;
        return properties && typeof properties === 'object' ? (properties as JsonRow) : null;
      })
      .filter((row): row is JsonRow => row !== null);
  }

  return [];
}

function getAreaName(areaId: string): string {
  return SAMPLE_AREAS.find((area) => area.id === areaId)?.name ?? areaId;
}

export function getTfNSWLgaAliases(areaId: string, areaName = getAreaName(areaId)): string[] {
  const candidates = new Set<string>([areaName]);
  const withoutPrefixes = areaName
    .replace(/^City of\s+/i, '')
    .replace(/^The\s+/i, '')
    .replace(/^Municipality of\s+/i, '')
    .replace(/^Council of\s+/i, '')
    .replace(/^Shire of\s+/i, '')
    .trim();

  if (withoutPrefixes) candidates.add(withoutPrefixes);

  const withoutSuffixes = withoutPrefixes
    .replace(/\s+Regional$/i, '')
    .replace(/\s+Shire$/i, '')
    .replace(/\s+Council$/i, '')
    .trim();

  if (withoutSuffixes) candidates.add(withoutSuffixes);
  if (withoutSuffixes.includes('-')) candidates.add(withoutSuffixes.replace(/-/g, ' '));
  if (withoutSuffixes.includes(' and ')) candidates.add(withoutSuffixes.replace(/ and /gi, ' & '));

  if (areaId === 'lga_sydney') candidates.add('Sydney');
  if (areaId === 'lga_parramatta') candidates.add('Parramatta');
  if (areaId === 'lga_hills') candidates.add('The Hills');

  return Array.from(candidates).filter(Boolean);
}

function matchesAlias(value: unknown, aliases: string[]): boolean {
  if (typeof value !== 'string') return false;
  const normalizedValue = normalizeText(value);
  return aliases.some((alias) => normalizedValue === normalizeText(alias));
}

function findHeader(headers: string[], matchers: Array<(normalized: string) => boolean>): string | null {
  for (const header of headers) {
    const normalized = normalizeText(header).replace(/\s+/g, '_');
    if (matchers.some((matcher) => matcher(normalized))) {
      return header;
    }
  }
  return null;
}

async function readFreshCache<T>(lgaCode: string, dataset: string): Promise<T | null> {
  const cached = await getLiveDataRepository().getTfNSWCacheEntry(lgaCode, dataset);
  if (!cached || !isFresh(cached.fetchedAt)) return null;
  return parseCachedJson<T>(cached.dataJson);
}

async function writeCache(lgaCode: string, dataset: string, data: unknown, dataYear: number): Promise<void> {
  await getSeedWriteRepository().upsertTfNSWCache(lgaCode, dataset, data, dataYear);
}

async function fetchTfNSWTrafficJson(query: string): Promise<JsonRow[]> {
  const apiKey = process.env.TFNSW_API_KEY;
  if (!apiKey) return [];

  const url = new URL(TFNSW_TRAFFIC_VOLUME_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('q', query);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `apikey ${apiKey}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Traffic volume API request failed with status ${response.status}`);
  }

  return extractRows(await response.json());
}

async function fetchTrafficTrendFromApi(aliases: string[]): Promise<TfNSWTrafficTrendPoint[] | null> {
  const escapedAliases = aliases.map((alias) => `'${escapeSqlLiteral(alias)}'`).join(', ');
  const stations = await fetchTfNSWTrafficJson(
    `SELECT DISTINCT station_key FROM road_traffic_counts_station_reference WHERE LOWER(lga) IN (${escapedAliases.toLowerCase()})`
  );

  const stationKeys = Array.from(
    new Set(
      stations
        .map((row) => row.station_key)
        .map((value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : null))
        .filter((value): value is string => Boolean(value))
    )
  );

  if (stationKeys.length === 0) {
    return null;
  }

  const stationKeyList = stationKeys.map((stationKey) => `'${escapeSqlLiteral(stationKey)}'`).join(', ');
  const yearlyRows = await fetchTfNSWTrafficJson(
    `SELECT year, AVG(traffic_count) AS avg_daily_vehicles FROM road_traffic_counts_yearly_summary WHERE station_key IN (${stationKeyList}) AND UPPER(COALESCE(period, '')) LIKE '%ALL DAY%' AND UPPER(COALESCE(classification_type, '')) LIKE '%ALL VEHICLE%' GROUP BY year ORDER BY year`
  );

  const trend = yearlyRows
    .map((row) => {
      const year = toNumber(row.year);
      const avgDailyVehicles = toNumber(row.avg_daily_vehicles ?? row.avg ?? row.traffic_count);
      if (!year || avgDailyVehicles === null) return null;
      return {
        year,
        avgDailyVehicles: Math.round(avgDailyVehicles),
        stationCount: stationKeys.length,
      } satisfies TfNSWTrafficTrendPoint;
    })
    .filter((row): row is TfNSWTrafficTrendPoint => row !== null);

  return trend.length > 0 ? trend : null;
}

function parseCrashWorkbook(buffer: ArrayBuffer, aliases: string[]): TfNSWCrashTrendPoint[] | null {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return null;

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  if (rows.length === 0) return null;

  const headers = Object.keys(rows[0]);
  const lgaHeader = findHeader(headers, [
    (key) => key === 'lga_name',
    (key) => key.endsWith('_lga') && !key.includes('code'),
    (key) => key === 'lga',
  ]);
  const yearHeader = findHeader(headers, [
    (key) => key === 'crash_year',
    (key) => key === 'year',
    (key) => key.endsWith('_year'),
  ]);
  const severityHeader = findHeader(headers, [
    (key) => key.includes('degree_of_injury'),
    (key) => key.includes('injury_severity'),
    (key) => key === 'severity',
  ]);

  if (!lgaHeader || !yearHeader) return null;

  const summary = new Map<number, TfNSWCrashTrendPoint>();

  for (const row of rows) {
    if (!matchesAlias(row[lgaHeader], aliases)) continue;

    const year = toNumber(row[yearHeader]);
    if (!year) continue;

    const severity = typeof row[severityHeader ?? ''] === 'string'
      ? normalizeText(String(row[severityHeader ?? '']))
      : '';

    const current = summary.get(year) ?? {
      year,
      totalCrashes: 0,
      fatalCrashes: 0,
      injuryCrashes: 0,
    };

    current.totalCrashes += 1;
    if (severity.includes('fatal')) current.fatalCrashes += 1;
    if (severity.includes('injur')) current.injuryCrashes += 1;

    summary.set(year, current);
  }

  const trend = Array.from(summary.values()).sort((a, b) => a.year - b.year);
  return trend.length > 0 ? trend : null;
}

async function fetchCrashTrendFromWorkbook(aliases: string[]): Promise<TfNSWCrashTrendPoint[] | null> {
  const response = await fetch(NSW_CRASH_DATA_XLSX_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Crash workbook request failed with status ${response.status}`);
  }

  return parseCrashWorkbook(await response.arrayBuffer(), aliases);
}

function extractTableauViewUrl(html: string): string | null {
  const iframeMatch = html.match(/<iframe[^>]+src="([^"]+tableau[^"]+)"/i);
  return iframeMatch?.[1] ?? null;
}

async function detectPatronageSourceFromResource(resourceUrl: string): Promise<TfNSWPatronageSourceInfo | null> {
  const response = await fetch(resourceUrl, { cache: 'no-store' });
  if (!response.ok) return null;

  const html = await response.text();
  const viewUrl = extractTableauViewUrl(html);
  if (!viewUrl) return null;

  return {
    datasetUrl: resourceUrl,
    viewUrl,
    source: 'tfnsw_tableau',
    structuredDataAvailable: false,
    lastCheckedAt: new Date().toISOString(),
  };
}

async function detectPatronageSource(areaId: string): Promise<TfNSWPatronageSourceInfo | null> {
  if (areaId === 'lga_sydney') {
    return (
      (await detectPatronageSourceFromResource(TFNSW_PATRONAGE_SYDNEY_CBD_RESOURCE)) ??
      (await detectPatronageSourceFromResource(TFNSW_PATRONAGE_ALL_MODES_RESOURCE))
    );
  }

  return detectPatronageSourceFromResource(TFNSW_PATRONAGE_ALL_MODES_RESOURCE);
}

export function isTfNSWConfigured(): boolean {
  return Boolean(process.env.TFNSW_API_KEY);
}

export async function getLiveTfNSWTransportData(areaId: string): Promise<TfNSWLiveTransportData> {
  const lgaCode = LGA_CODE_MAP[areaId];
  if (!lgaCode) {
    return {
      patronageSource: null,
      trafficTrend: null,
      crashTrend: null,
    };
  }

  const aliases = getTfNSWLgaAliases(areaId);
  const [cachedTraffic, cachedCrash, cachedPatronage] = await Promise.all([
    readFreshCache<TfNSWTrafficTrendPoint[]>(lgaCode, TRAFFIC_CACHE_DATASET),
    readFreshCache<TfNSWCrashTrendPoint[]>(lgaCode, CRASH_CACHE_DATASET),
    readFreshCache<TfNSWPatronageSourceInfo>(lgaCode, PATRONAGE_CACHE_DATASET),
  ]);

  let trafficTrend = cachedTraffic;
  let crashTrend = cachedCrash;
  let patronageSource = cachedPatronage;

  if (!trafficTrend && isTfNSWConfigured()) {
    trafficTrend = await fetchTrafficTrendFromApi(aliases);
    if (trafficTrend) {
      await writeCache(lgaCode, TRAFFIC_CACHE_DATASET, trafficTrend, trafficTrend[trafficTrend.length - 1]?.year ?? new Date().getFullYear());
    }
  }

  if (!crashTrend) {
    crashTrend = await fetchCrashTrendFromWorkbook(aliases);
    if (crashTrend) {
      await writeCache(lgaCode, CRASH_CACHE_DATASET, crashTrend, crashTrend[crashTrend.length - 1]?.year ?? new Date().getFullYear());
    }
  }

  if (!patronageSource) {
    patronageSource = await detectPatronageSource(areaId);
    if (patronageSource) {
      await writeCache(lgaCode, PATRONAGE_CACHE_DATASET, patronageSource, new Date().getFullYear());
    }
  }

  return {
    patronageSource,
    trafficTrend,
    crashTrend,
  };
}

export async function fetchTrafficByLGA(lgaCode: string): Promise<TfNSWTrafficTrendPoint[] | null> {
  const areaId = Object.entries(LGA_CODE_MAP).find(([, value]) => value === lgaCode)?.[0];
  if (!areaId) return null;
  return (await getLiveTfNSWTransportData(areaId)).trafficTrend;
}

export async function fetchAllTfNSWData(lgaCode: string): Promise<TfNSWLiveTransportData> {
  const areaId = Object.entries(LGA_CODE_MAP).find(([, value]) => value === lgaCode)?.[0];
  if (!areaId) {
    return {
      patronageSource: null,
      trafficTrend: null,
      crashTrend: null,
    };
  }
  return getLiveTfNSWTransportData(areaId);
}

export { parseCrashWorkbook, extractRows };
