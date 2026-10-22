/**
 * GTFS Seed Script — TfNSW Open Data
 *
 * Downloads GTFS schedule zips from TfNSW, spatially joins stops to NSW LGA
 * polygons, and stores per-LGA PT coverage metrics in tfnsw_cache.
 *
 * Stored dataset keys: 'GTFS_COVERAGE' (GTFSCoverageData, see interface below)
 *                      'GTFS_FREQUENCY' (GTFSFrequencyData, see src/lib/gtfs-frequency.ts)
 * Also writes every stop's AM-peak departures, location and mode to the
 * gitignored data/build.db (gtfs_stop_frequency), for catchment analysis.
 *
 * Run:  npm run seed:gtfs                       # per-feed API if TFNSW_API_KEY is set,
 *                                                # else the keyless complete bundle (~300 MB)
 *       npm run seed:gtfs -- --zip <path.zip>   # use an already-downloaded complete bundle
 *       npm run seed:gtfs -- --service-date 20261027   # count departures on this date (YYYYMMDD)
 *       npm run seed:gtfs -- --stop-frequency-only     # write ONLY gtfs_stop_frequency to data/build.db;
 *                                                # data/cache.db is only read, to default the service date
 *                                                # to the cached GTFS_FREQUENCY one and to cross-check totals
 */

import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { execFileSync, spawn } from 'child_process';
import { createInterface } from 'readline';
import * as os from 'os';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import Database from 'better-sqlite3';
import { upsertTfNSWCache, upsertGtfsStopsBatch, clearGtfsStops, setConfigValue } from '../src/lib/db';
import type { GtfsStop } from '../src/lib/db';
import { replaceGtfsStopFrequency } from '../src/lib/build-db';
import { LGA_CODE_MAP } from '../src/lib/abs-fetchers';
import { pickServiceDate, activeServiceIds, createPeakDepartureCounter, summariseFrequency, frequencyBenchmarks, toStopFrequencyRows } from '../src/lib/gtfs-frequency';
import { GREATER_SYDNEY_GCCSA_AREA_IDS } from '../src/lib/data/sample-areas';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GTFSCoverageData {
  trainStops: number;
  busStops: number;
  ferryStops: number;
  lightRailStops: number;
  metroStops: number;
  totalStops: number;
  trainRoutes: number;
  busRoutes: number;
  ferryRoutes: number;
  lightRailRoutes: number;
  metroRoutes: number;
  totalRoutes: number;
  feeds: string[];           // which GTFS feeds contributed stops to this LGA
  source: 'tfnsw_gtfs';
}

// GTFS route_type → our mode label
// Standard codes: https://developers.google.com/transit/gtfs/reference#routestxt
// Extended codes: https://developers.google.com/transit/gtfs/reference/extended-route-types
// TfNSW uses: 2=rail, 900=tram/lightrail, 700+=bus, 401=metro
function routeTypeToMode(routeType: number, feedDefault: string): string {
  if (routeType >= 200 && routeType <= 299) return 'busStops'; // coach services
  if (routeType === 2 || (routeType >= 100 && routeType <= 399)) return 'trainStops';
  if (routeType === 1 || (routeType >= 400 && routeType <= 599)) return 'metroStops';
  if (routeType === 3 || (routeType >= 700 && routeType <= 799)) return 'busStops';
  if (routeType === 0 || (routeType >= 900 && routeType <= 999)) return 'lightRailStops';
  if (routeType === 4 || (routeType >= 1000 && routeType <= 1299)) return 'ferryStops';
  if (routeType === 11) return 'busStops';  // Trolleybus
  if (routeType === 12) return 'metroStops'; // Monorail
  return `${feedDefault}Stops`;
}

// Resolve mode key like 'trainStops' → plain mode 'train'
const MODE_PRIORITY = ['metro', 'train', 'lightRail', 'ferry', 'bus'];
function modeKeyToPlain(modeKey: string): string {
  return modeKey.replace('Stops', '');
}
function pickPrimaryMode(modes: Set<string>): string {
  const plains = Array.from(modes).map(modeKeyToPlain);
  for (const m of MODE_PRIORITY) {
    if (plains.includes(m)) return m;
  }
  return plains[0] ?? 'bus';
}

// TfNSW GTFS feeds to download
const GTFS_FEEDS: { name: string; feedId: string; defaultMode: string }[] = [
  { name: 'Sydney Trains',  feedId: 'sydneytrains',  defaultMode: 'train' },
  { name: 'NSW Trains',     feedId: 'nswtrains',     defaultMode: 'train' },
  { name: 'Buses',          feedId: 'buses',          defaultMode: 'bus'   },
  { name: 'Light Rail',     feedId: 'lightrail',      defaultMode: 'lightRail' },
  { name: 'Ferry',          feedId: 'ferries',        defaultMode: 'ferry' },
  { name: 'Metro',          feedId: 'metro',          defaultMode: 'metro' },
];

const TFNSW_GTFS_BASE = 'https://api.transport.nsw.gov.au/v1/gtfs/schedule';
const GEO_PATH = path.join(process.cwd(), 'public', 'geo', 'lga-nsw.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Simple CSV parse (handles quoted fields)
    const values: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        values.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    values.push(cur.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

async function downloadFeed(feedId: string): Promise<Buffer | null> {
  const apiKey = process.env.TFNSW_API_KEY;
  if (!apiKey) {
    console.error('  ✗ TFNSW_API_KEY not set in environment');
    return null;
  }

  const url = `${TFNSW_GTFS_BASE}/${feedId}`;
  console.log(`  Downloading ${feedId} from ${url}...`);

  const res = await fetch(url, {
    headers: { Authorization: `apikey ${apiKey}` },
  });

  if (!res.ok) {
    if (res.status === 404) {
      console.log(`  ↳ ${feedId}: not found (404) — skipping`);
    } else {
      console.warn(`  ↳ ${feedId}: HTTP ${res.status} — skipping`);
    }
    return null;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`  ↳ ${feedId}: ${(buf.length / 1024 / 1024).toFixed(1)} MB downloaded`);
  return buf;
}

// Keyless alternative to the per-feed API: the complete NSW GTFS bundle
// (~300 MB zip, all operators incl. regional) from TfNSW Open Data.
const COMPLETE_GTFS_PACKAGE_URL =
  'https://opendata.transport.nsw.gov.au/data/api/3/action/package_show?id=timetables-complete-gtfs';

async function downloadCompleteBundle(): Promise<string> {
  const pkg = await fetch(COMPLETE_GTFS_PACKAGE_URL);
  if (!pkg.ok) throw new Error(`CKAN package_show failed: HTTP ${pkg.status}`);
  const { result } = await pkg.json() as { result: { resources: { url: string; format: string }[] } };
  const resource = result.resources.find(r => /zip/i.test(r.format) || /\.zip$/i.test(r.url));
  if (!resource) throw new Error('No GTFS zip resource in timetables-complete-gtfs');

  const dest = path.join(os.tmpdir(), 'tfnsw_complete_gtfs.zip');
  console.log(`  Downloading ${resource.url}\n  → ${dest} (~300 MB)...`);
  const res = await fetch(resource.url);
  if (!res.ok || !res.body) throw new Error(`GTFS bundle download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as import('stream/web').ReadableStream), fs.createWriteStream(dest));
  return dest;
}

// ─── Load LGA polygons ────────────────────────────────────────────────────────

interface LGAFeature {
  areaId: string;       // e.g. 'lga_sydney'
  lgaCode: string;      // e.g. '17200'
  feature: GeoJSON.Feature;
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat — cheap pre-filter
}

function featureBbox(feature: GeoJSON.Feature): [number, number, number, number] {
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (coords: unknown): void => {
    if (Array.isArray(coords) && typeof coords[0] === 'number') {
      const [x, y] = coords as number[];
      box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
    } else if (Array.isArray(coords)) {
      coords.forEach(visit);
    }
  };
  visit((feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
  return box;
}

function loadLGAPolygons(): LGAFeature[] {
  const geojson = JSON.parse(fs.readFileSync(GEO_PATH, 'utf-8')) as GeoJSON.FeatureCollection;
  const result: LGAFeature[] = [];
  for (const feature of geojson.features) {
    const areaId = (feature.properties as Record<string, string>)['id'];
    const lgaCode = LGA_CODE_MAP[areaId];
    if (!lgaCode) continue; // benchmark areas without an ABS code
    result.push({ areaId, lgaCode, feature, bbox: featureBbox(feature) });
  }
  return result;
}

// ─── Spatial join ─────────────────────────────────────────────────────────────

/** LGA whose boundary vertex is nearest the point, if within `maxMetres`. */
function nearestLgaWithin(lon: number, lat: number, lgas: LGAFeature[], maxMetres: number): string | null {
  const metresPerDegLat = 111_320;
  const metresPerDegLon = metresPerDegLat * Math.cos((lat * Math.PI) / 180);
  const padLat = maxMetres / metresPerDegLat;
  const padLon = maxMetres / metresPerDegLon;
  let best: { code: string; d: number } | null = null;
  for (const lga of lgas) {
    const [minX, minY, maxX, maxY] = lga.bbox;
    if (lon < minX - padLon || lon > maxX + padLon || lat < minY - padLat || lat > maxY + padLat) continue;
    const visit = (coords: unknown): void => {
      if (Array.isArray(coords) && typeof coords[0] === 'number') {
        const dx = ((coords[0] as number) - lon) * metresPerDegLon;
        const dy = ((coords[1] as number) - lat) * metresPerDegLat;
        const d = Math.hypot(dx, dy);
        if (d <= maxMetres && (!best || d < best.d)) best = { code: lga.lgaCode, d };
      } else if (Array.isArray(coords)) {
        coords.forEach(visit);
      }
    };
    visit((lga.feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
  }
  return best ? (best as { code: string }).code : null;
}

function joinStopsToLGAs(
  stops: { lon: number; lat: number; stopId: string }[],
  lgas: LGAFeature[]
): Map<string, string[]> {
  // Returns: lgaCode → stopId[]
  const lgaStops = new Map<string, string[]>();

  for (const stop of stops) {
    const pt = turfPoint([stop.lon, stop.lat]);
    for (const lga of lgas) {
      if (booleanPointInPolygon(pt, lga.feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>)) {
        const existing = lgaStops.get(lga.lgaCode) ?? [];
        existing.push(stop.stopId);
        lgaStops.set(lga.lgaCode, existing);
        break; // stop is in exactly one LGA
      }
    }
  }

  return lgaStops;
}

// ─── Process a single GTFS feed ───────────────────────────────────────────────

interface FeedResult {
  feedId: string;
  defaultMode: string;
  // stopId → { lat, lon, name }
  stops: Map<string, { lat: number; lon: number; name: string }>;
  // routeId → routeType
  routes: Map<string, number>;
  // stopId → Set<routeId> (derived from stop_times + trips)
  stopRoutes: Map<string, Set<string>>;
  // stopId → weekday AM-peak departures on serviceDate
  peakDepartures: Map<string, number>;
  serviceDate: string | null;
}

// A feed is read either from an in-memory zip (per-feed API download) or from
// a zip on disk via `unzip -p`, which lets the ~450 MB stop_times.txt of the
// complete open bundle be streamed rather than held in memory as one string.
interface FeedReader {
  readText(name: string): Promise<string | null>;
  lines(name: string): AsyncIterable<string> | null;
}

function bufferFeedReader(feedId: string, buf: Buffer): FeedReader | null {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buf);
  } catch (err) {
    console.error(`  ✗ ${feedId}: failed to parse zip:`, err);
    return null;
  }
  const readText = (name: string) => zip.getEntry(name)?.getData().toString('utf-8') ?? null;
  return {
    readText: async (name) => readText(name),
    lines: (name) => {
      const text = readText(name);
      if (text === null) return null;
      return (async function* () { yield* text.split('\n'); })();
    },
  };
}

function fileFeedReader(zipPath: string): FeedReader {
  const entries = new Set(
    execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 }).split('\n').map(l => l.trim()),
  );
  return {
    readText: async (name) => entries.has(name)
      ? execFileSync('unzip', ['-p', zipPath, name], { encoding: 'utf-8', maxBuffer: 512 * 1024 * 1024 })
      : null,
    lines: (name) => {
      if (!entries.has(name)) return null;
      const child = spawn('unzip', ['-p', zipPath, name], { stdio: ['ignore', 'pipe', 'inherit'] });
      return createInterface({ input: child.stdout, crlfDelay: Infinity });
    },
  };
}

// School buses run almost entirely in the AM/PM peaks and are not general
// public service, so they are left out of frequency counts (not coverage).
const SCHOOL_BUS_ROUTE_TYPE = 712;

async function processFeed(
  feedId: string,
  defaultMode: string,
  reader: FeedReader,
  pinnedServiceDate?: string,
): Promise<FeedResult | null> {
  // ── stops.txt ───────────────────────────────────────────────────────────────
  const stopsText = await reader.readText('stops.txt');
  if (stopsText === null) {
    console.warn(`  ↳ ${feedId}: no stops.txt — skipping`);
    return null;
  }
  const stopsRows = parseCSV(stopsText.replace(/^﻿/, ''));
  const stopsMap = new Map<string, { lat: number; lon: number; name: string }>();
  for (const row of stopsRows) {
    const lat = parseFloat(row['stop_lat']);
    const lon = parseFloat(row['stop_lon']);
    if (isNaN(lat) || isNaN(lon)) continue;
    // Skip parent stations (location_type=1) — they're duplicates of child stops
    if (row['location_type'] === '1') continue;
    stopsMap.set(row['stop_id'], { lat, lon, name: row['stop_name'] ?? row['stop_id'] });
  }
  console.log(`  ↳ ${feedId}: ${stopsMap.size} stops`);

  // ── routes.txt ──────────────────────────────────────────────────────────────
  const routesText = await reader.readText('routes.txt');
  const routesMap = new Map<string, number>();
  if (routesText !== null) {
    for (const row of parseCSV(routesText.replace(/^﻿/, ''))) {
      routesMap.set(row['route_id'], parseInt(row['route_type'] ?? '3', 10));
    }
    console.log(`  ↳ ${feedId}: ${routesMap.size} routes`);
  }

  // ── trips.txt ───────────────────────────────────────────────────────────────
  // trip_id → route_id links stop_times → routes; trip_id → service_id drives
  // the frequency count (school bus trips excluded).
  const tripsText = await reader.readText('trips.txt');
  const tripToRoute = new Map<string, string>();
  const tripService = new Map<string, string>();
  if (tripsText !== null) {
    for (const row of parseCSV(tripsText.replace(/^﻿/, ''))) {
      tripToRoute.set(row['trip_id'], row['route_id']);
      if (routesMap.get(row['route_id']) !== SCHOOL_BUS_ROUTE_TYPE) {
        tripService.set(row['trip_id'], row['service_id']);
      }
    }
    console.log(`  ↳ ${feedId}: ${tripToRoute.size} trips`);
  }

  // ── calendar → representative Tuesday for AM-peak frequency ────────────────
  const readOptional = async (name: string) => {
    const text = await reader.readText(name);
    return text === null ? [] : parseCSV(text.replace(/^﻿/, ''));
  };
  const calendarRows = await readOptional('calendar.txt');
  const calendarDateRows = await readOptional('calendar_dates.txt');
  // A pinned date is used as given, but only if the feed runs any service on it.
  const serviceDate = pinnedServiceDate
    ? (activeServiceIds(calendarRows, calendarDateRows, pinnedServiceDate).size > 0 ? pinnedServiceDate : null)
    : pickServiceDate(calendarRows, calendarDateRows);
  const counter = createPeakDepartureCounter(
    tripService,
    serviceDate ? activeServiceIds(calendarRows, calendarDateRows, serviceDate) : new Set(),
  );
  if (!serviceDate) {
    console.warn(`  ↳ ${feedId}: ${pinnedServiceDate ? `no service on ${pinnedServiceDate}` : 'no weekday service date found'} — frequency skipped`);
  }

  // ── stop_times.txt (streamed) ───────────────────────────────────────────────
  // stop_id → Set<route_id>, plus AM-peak departures per stop, in one pass.
  const stopRoutes = new Map<string, Set<string>>();
  const stopTimesLines = tripToRoute.size > 0 ? reader.lines('stop_times.txt') : null;
  if (stopTimesLines) {
    let stopIdIdx = -1;
    let tripIdIdx = -1;
    let isHeader = true;
    for await (const rawLine of stopTimesLines) {
      const line = rawLine.replace(/\r$/, '');
      counter.addLine(line);
      if (isHeader) {
        const headers = line.replace(/^﻿/, '').split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        stopIdIdx = headers.indexOf('stop_id');
        tripIdIdx = headers.indexOf('trip_id');
        isHeader = false;
        if (stopIdIdx < 0 || tripIdIdx < 0) {
          console.warn(`  ↳ ${feedId}: stop_times.txt headers not recognised (got: ${headers.slice(0, 5).join(',')})`);
        }
        continue;
      }
      if (!line || stopIdIdx < 0 || tripIdIdx < 0) continue;
      const cols = line.split(',');
      const stopId = cols[stopIdIdx]?.trim().replace(/^"|"$/g, '');
      const tripId = cols[tripIdIdx]?.trim().replace(/^"|"$/g, '');
      if (!stopId || !tripId) continue;
      const routeId = tripToRoute.get(tripId);
      if (!routeId) continue;
      let set = stopRoutes.get(stopId);
      if (!set) { set = new Set(); stopRoutes.set(stopId, set); }
      set.add(routeId);
    }
    console.log(`  ↳ ${feedId}: stop_times processed (${stopRoutes.size} unique stops with routes)`);
    if (serviceDate) {
      console.log(`  ↳ ${feedId}: ${counter.counts.size} stops with AM-peak departures on ${serviceDate}`);
    }
  }

  return {
    feedId, defaultMode, stops: stopsMap, routes: routesMap, stopRoutes,
    peakDepartures: counter.counts, serviceDate: stopTimesLines ? serviceDate : null,
  };
}

// ─── Per-stop mode, id and AM-peak rows ───────────────────────────────────────

/** Primary mode of a stop: from the routes serving it, else the feed's default. */
function stopMode(feed: FeedResult, stopId: string): string {
  const routesForStop = feed.stopRoutes.get(stopId);
  if (!routesForStop || routesForStop.size === 0) return feed.defaultMode;
  const modeKeys = new Set<string>();
  for (const routeId of routesForStop) {
    const routeType = feed.routes.get(routeId);
    modeKeys.add(routeType !== undefined
      ? routeTypeToMode(routeType, feed.defaultMode)
      : `${feed.defaultMode}Stops`);
  }
  return pickPrimaryMode(modeKeys);
}

/** Id a stop is stored under in gtfs_stops and gtfs_stop_frequency. */
function storedStopId(feed: FeedResult, stopId: string): string {
  return `${feed.feedId}_${stopId}`;
}

/** Every stop in the bundle (also those outside any LGA), in the shape toStopFrequencyRows takes. */
function bundleStopFrequencyRows(feedResults: FeedResult[], serviceDate: string) {
  const stops: { stopId: string; lat: number; lng: number; mode: string }[] = [];
  const departures = new Map<string, number>();
  for (const feed of feedResults) {
    for (const [stopId, { lat, lon }] of feed.stops) {
      stops.push({ stopId: storedStopId(feed, stopId), lat, lng: lon, mode: stopMode(feed, stopId) });
    }
    for (const [stopId, n] of feed.peakDepartures) departures.set(storedStopId(feed, stopId), n);
  }
  return toStopFrequencyRows(stops, departures, serviceDate);
}

/** The most frequent value (ties go to the first seen), or null for none. */
function mostCommon(values: string[]): string | null {
  const tally = new Map<string, number>();
  for (const v of values) tally.set(v, (tally.get(v) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Cached GTFS_FREQUENCY per LGA code, read from data/cache.db without opening it for writing. */
function readCachedFrequency(): Map<string, { serviceDate: string; amPeakDepartures: number }> {
  const cached = new Map<string, { serviceDate: string; amPeakDepartures: number }>();
  const dbPath = process.env.CACHE_DB_PATH?.trim() || path.join(process.cwd(), 'data', 'cache.db');
  if (!fs.existsSync(dbPath)) return cached;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare("SELECT lga_code, data_json FROM tfnsw_cache WHERE dataset = 'GTFS_FREQUENCY'").all() as { lga_code: string; data_json: string }[];
    for (const { lga_code, data_json } of rows) {
      const { serviceDate, amPeakDepartures } = JSON.parse(data_json) as { serviceDate?: string; amPeakDepartures?: number };
      if (serviceDate && typeof amPeakDepartures === 'number') cached.set(lga_code, { serviceDate, amPeakDepartures });
    }
  } finally {
    db.close();
  }
  return cached;
}

// ─── Aggregate per-LGA metrics ────────────────────────────────────────────────

function aggregateForLGA(
  lgaCode: string,
  stopIds: string[],
  feedResults: FeedResult[]
): GTFSCoverageData {
  const data: GTFSCoverageData = {
    trainStops: 0, busStops: 0, ferryStops: 0,
    lightRailStops: 0, metroStops: 0, totalStops: 0,
    trainRoutes: 0, busRoutes: 0, ferryRoutes: 0,
    lightRailRoutes: 0, metroRoutes: 0, totalRoutes: 0,
    feeds: [],
    source: 'tfnsw_gtfs',
  };

  const routesSeen = new Set<string>(); // deduplicate routes across feeds

  for (const feed of feedResults) {
    const feedStopIds = new Set(stopIds);
    let feedStopCount = 0;

    for (const stopId of feedStopIds) {
      if (!feed.stops.has(stopId)) continue;
      feedStopCount++;

      // Determine mode for this stop: use routes serving the stop, else feed default
      const routesForStop = feed.stopRoutes.get(stopId);
      const modesForStop = new Set<string>();

      if (routesForStop) {
        for (const routeId of routesForStop) {
          const routeType = feed.routes.get(routeId);
          const modeKey = routeType !== undefined
            ? routeTypeToMode(routeType, feed.defaultMode)
            : `${feed.defaultMode}Stops`;
          if (modeKey) modesForStop.add(modeKey);

          // Count route if not already counted
          if (!routesSeen.has(routeId)) {
            routesSeen.add(routeId);
            const routeModeKey = modeKey?.replace('Stops', 'Routes') as keyof GTFSCoverageData;
            if (routeModeKey && typeof data[routeModeKey] === 'number') {
              (data[routeModeKey] as number)++;
            }
            data.totalRoutes++;
          }
        }
      } else {
        // No stop_times data — use feed default
        modesForStop.add(`${feed.defaultMode}Stops`);
      }

      // Count this stop once under its primary mode
      const primaryMode = (modesForStop.size > 0
        ? Array.from(modesForStop)[0]
        : `${feed.defaultMode}Stops`) as keyof GTFSCoverageData;
      if (typeof data[primaryMode] === 'number') {
        (data[primaryMode] as number)++;
        data.totalStops++;
      }
    }

    if (feedStopCount > 0 && !data.feeds.includes(feed.feedId)) {
      data.feeds.push(feed.feedId);
    }
  }

  return data;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚌 GTFS Coverage Seed Script');
  console.log('=====================================\n');

  // Load .env.local
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([^=]+)=(.+)$/);
      if (match) process.env[match[1].trim()] = match[2].trim();
    }
  }

  // Load LGA polygons
  console.log('Loading LGA polygons from public/geo/lga-nsw.json...');
  const lgas = loadLGAPolygons();
  console.log(`  ${lgas.length} LGAs loaded\n`);

  // Source: --zip <complete bundle>, else per-feed API (TFNSW_API_KEY), else the
  // keyless complete bundle from TfNSW Open Data.
  const feedResults: FeedResult[] = [];
  const args = process.argv.slice(2);
  const zipArg = args.includes('--zip') ? args[args.indexOf('--zip') + 1] : null;
  const stopFrequencyOnly = args.includes('--stop-frequency-only');
  const serviceDateArg = args.includes('--service-date') ? args[args.indexOf('--service-date') + 1] : undefined;
  if (args.includes('--service-date') && !/^\d{8}$/.test(serviceDateArg ?? '')) {
    console.error('\n✗ --service-date needs a YYYYMMDD value, e.g. --service-date 20261027\n');
    process.exit(1);
  }
  // Stop-frequency-only mode defaults to the service date the cached GTFS_FREQUENCY figures used.
  const cachedFrequency = stopFrequencyOnly ? readCachedFrequency() : null;
  const pinnedServiceDate = serviceDateArg
    ?? (cachedFrequency ? mostCommon([...cachedFrequency.values()].map(c => c.serviceDate)) ?? undefined : undefined);
  if (stopFrequencyOnly) {
    if (!pinnedServiceDate) {
      console.error('\n✗ No cached GTFS_FREQUENCY service date to default to — pass --service-date YYYYMMDD\n');
      process.exit(1);
    }
    console.log(`Stop-frequency-only: writing gtfs_stop_frequency to data/build.db for ${pinnedServiceDate}; data/cache.db is not written\n`);
  }

  if (zipArg || !process.env.TFNSW_API_KEY) {
    const zipPath = zipArg ?? await downloadCompleteBundle();
    console.log(`\n[Complete GTFS bundle: ${zipPath}]`);
    const result = await processFeed('complete', 'bus', fileFeedReader(zipPath), pinnedServiceDate);
    if (result) feedResults.push(result);
  } else {
    for (const feed of GTFS_FEEDS) {
      console.log(`\n[${feed.name}]`);
      const buf = await downloadFeed(feed.feedId);
      if (!buf) continue;

      const reader = bufferFeedReader(feed.feedId, buf);
      const result = reader ? await processFeed(feed.feedId, feed.defaultMode, reader, pinnedServiceDate) : null;
      if (result) feedResults.push(result);
    }
  }

  if (feedResults.length === 0) {
    console.error('\n✗ No GTFS feeds downloaded successfully. Aborting.\n');
    process.exit(1);
  }

  console.log(`\n\nSpatially joining stops to LGAs...`);

  // Collect all unique stops across all feeds for spatial join
  const allStops: { lon: number; lat: number; stopId: string; feedIdx: number }[] = [];
  for (let fi = 0; fi < feedResults.length; fi++) {
    for (const [stopId, { lat, lon }] of feedResults[fi].stops) {
      allStops.push({ lon, lat, stopId: `${fi}:${stopId}`, feedIdx: fi });
    }
  }

  console.log(`  Total stops across all feeds: ${allStops.length}`);

  // For each LGA, find which stops from each feed fall within it
  // Build a stop → LGA index via spatial join on all stops at once
  const stopToLGA = new Map<string, string>(); // `${feedIdx}:${stopId}` → lgaCode

  let processed = 0;
  const reportEvery = Math.floor(allStops.length / 20);

  for (const stop of allStops) {
    const pt = turfPoint([stop.lon, stop.lat]);
    for (const lga of lgas) {
      const [minX, minY, maxX, maxY] = lga.bbox;
      if (stop.lon < minX || stop.lon > maxX || stop.lat < minY || stop.lat > maxY) continue;
      if (booleanPointInPolygon(pt, lga.feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>)) {
        stopToLGA.set(stop.stopId, lga.lgaCode);
        break;
      }
    }
    processed++;
    if (processed % reportEvery === 0) {
      process.stdout.write(`\r  ${Math.round(processed / allStops.length * 100)}% (${processed}/${allStops.length})`);
    }
  }
  process.stdout.write(`\r  100% (${allStops.length}/${allStops.length})\n`);

  // Ferry wharves sit over water, outside the land-clipped LGA polygons. Assign
  // unmatched ferry stops to the nearest LGA boundary within 400 m. Limited to
  // ferry stops so cross-border (Vic/ACT/Qld) bus stops are not pulled in.
  let wharvesAssigned = 0;
  for (const stop of allStops) {
    if (stopToLGA.has(stop.stopId)) continue;
    const feed = feedResults[stop.feedIdx];
    const rawStopId = stop.stopId.slice(stop.stopId.indexOf(':') + 1);
    const routeIds = feed.stopRoutes.get(rawStopId);
    const isFerry = routeIds && Array.from(routeIds).some(r => {
      const t = feed.routes.get(r);
      return t !== undefined && routeTypeToMode(t, feed.defaultMode) === 'ferryStops';
    });
    if (!isFerry) continue;
    const lgaCode = nearestLgaWithin(stop.lon, stop.lat, lgas, 400);
    if (lgaCode) {
      stopToLGA.set(stop.stopId, lgaCode);
      wharvesAssigned++;
    }
  }
  if (wharvesAssigned > 0) console.log(`  ${wharvesAssigned} ferry wharves outside LGA land polygons assigned to the nearest LGA`);

  // stop key (`${feedIdx}:${stopId}`) → weekday AM-peak departures on the service date
  const allPeakDepartures = new Map<string, number>();
  for (let fi = 0; fi < feedResults.length; fi++) {
    for (const [stopId, n] of feedResults[fi].peakDepartures) allPeakDepartures.set(`${fi}:${stopId}`, n);
  }
  const serviceDate = mostCommon(feedResults.map(f => f.serviceDate).filter((d): d is string => !!d));

  // ── Stop-frequency-only: write gtfs_stop_frequency to build.db and stop ────
  if (stopFrequencyOnly) {
    if (!serviceDate) {
      console.error(`\n✗ No service on ${pinnedServiceDate} in this bundle — nothing written.\n`);
      process.exit(1);
    }
    const rows = bundleStopFrequencyRows(feedResults, serviceDate);
    replaceGtfsStopFrequency(rows);
    console.log(`\n  ✅ ${rows.length} stops written to gtfs_stop_frequency in data/build.db (service date ${serviceDate})`);

    // Cross-check: per-LGA AM-peak totals (stops assigned as above) against the cached GTFS_FREQUENCY.
    const lgaTotals = new Map<string, number>();
    for (const [key, lgaCode] of stopToLGA) lgaTotals.set(lgaCode, (lgaTotals.get(lgaCode) ?? 0) + (allPeakDepartures.get(key) ?? 0));
    const differing = [...lgaTotals].filter(([code, total]) => cachedFrequency?.get(code)?.amPeakDepartures !== total);
    console.log(`  ${lgaTotals.size - differing.length} of ${lgaTotals.size} LGAs match the cached amPeakDepartures exactly`);
    for (const [code, total] of differing.slice(0, 10)) {
      console.log(`    LGA ${code}: ${total} here, ${cachedFrequency?.get(code)?.amPeakDepartures ?? 'not cached'} cached`);
    }
    const blacktown = LGA_CODE_MAP.lga_blacktown;
    console.log(`  Blacktown (${blacktown}): ${lgaTotals.get(blacktown) ?? 0} AM-peak departures here, ${cachedFrequency?.get(blacktown)?.amPeakDepartures ?? 'not cached'} cached\n`);
    return;
  }

  // Group stops by LGA and feed
  // lgaCode → feedIdx → stopId[]
  const lgaFeedStops = new Map<string, Map<number, string[]>>();
  for (const [key, lgaCode] of stopToLGA) {
    const [feedIdxStr, ...rest] = key.split(':');
    const feedIdx = parseInt(feedIdxStr, 10);
    const stopId = rest.join(':');
    let feedMap = lgaFeedStops.get(lgaCode);
    if (!feedMap) { feedMap = new Map(); lgaFeedStops.set(lgaCode, feedMap); }
    const stops = feedMap.get(feedIdx) ?? [];
    stops.push(stopId);
    feedMap.set(feedIdx, stops);
  }

  // ── Persist individual stops to gtfs_stops table ──────────────────────────
  console.log(`\n\nPersisting individual stops to gtfs_stops table...`);
  clearGtfsStops();
  const gtfsStopRows: GtfsStop[] = [];
  // lgaCode → stops (feed-qualified id + primary mode) for frequency summaries
  const lgaFrequencyStops = new Map<string, { stopId: string; mode: string }[]>();

  for (const [key, lgaCode] of stopToLGA) {
    const [feedIdxStr, ...rest] = key.split(':');
    const feedIdx = parseInt(feedIdxStr, 10);
    const stopId = rest.join(':');
    const feed = feedResults[feedIdx];
    if (!feed) continue;
    const coords = feed.stops.get(stopId);
    if (!coords) continue;

    const mode = stopMode(feed, stopId);

    // Resolve stop_name from the stops.txt rows (stored in stopsMap as coords only)
    // We don't have stop_name in stopsMap — get it from stopsRows via the feed's stops array
    // The stops CSV text was parsed earlier; we'll use the feedId as a lookup key prefix
    const prefixedId = storedStopId(feed, stopId);
    const lgaStopList = lgaFrequencyStops.get(lgaCode) ?? [];
    lgaStopList.push({ stopId: key, mode });
    lgaFrequencyStops.set(lgaCode, lgaStopList);
    gtfsStopRows.push({
      stop_id: prefixedId,
      stop_name: coords.name,
      lat: coords.lat,
      lng: coords.lon,
      mode,
      feed: feed.feedId,
    });
  }

  upsertGtfsStopsBatch(gtfsStopRows);
  console.log(`  ✅ ${gtfsStopRows.length} individual stops written to gtfs_stops`);

  // Aggregate per LGA and write to DB
  console.log(`\n\nAggregating and storing per-LGA GTFS coverage...`);
  let upserted = 0;

  for (const lga of lgas) {    const feedMap = lgaFeedStops.get(lga.lgaCode);
    if (!feedMap) continue; // no PT stops in this LGA

    // Build per-feed stop lists
    const data: GTFSCoverageData = {
      trainStops: 0, busStops: 0, ferryStops: 0,
      lightRailStops: 0, metroStops: 0, totalStops: 0,
      trainRoutes: 0, busRoutes: 0, ferryRoutes: 0,
      lightRailRoutes: 0, metroRoutes: 0, totalRoutes: 0,
      feeds: [],
      source: 'tfnsw_gtfs',
    };

    const routesSeen = new Set<string>();

    for (const [feedIdx, stopIds] of feedMap) {
      const feed = feedResults[feedIdx];
      if (!feed) continue;
      data.feeds.push(feed.feedId);

      for (const stopId of stopIds) {
        // Count stop by mode
        const routesForStop = feed.stopRoutes.get(stopId);
        let counted = false;

        if (routesForStop && routesForStop.size > 0) {
          const [firstRouteId] = routesForStop;
          const routeType = feed.routes.get(firstRouteId);
          const modeKey = routeType !== undefined
            ? routeTypeToMode(routeType, feed.defaultMode)
            : `${feed.defaultMode}Stops`;
          if (typeof data[modeKey as keyof GTFSCoverageData] === 'number') {
            (data[modeKey as keyof GTFSCoverageData] as number)++;
            data.totalStops++;
            counted = true;
          }

          // Count unique routes
          for (const routeId of routesForStop) {
            if (!routesSeen.has(routeId)) {
              routesSeen.add(routeId);
              const routeType2 = feed.routes.get(routeId);
              const rModeKey = routeType2 !== undefined
                ? routeTypeToMode(routeType2, feed.defaultMode)
                : `${feed.defaultMode}Stops`;
              const routeModeKey = rModeKey.replace('Stops', 'Routes') as keyof GTFSCoverageData;
              if (typeof data[routeModeKey] === 'number') {
                (data[routeModeKey] as number)++;
              }
              data.totalRoutes++;
            }
          }
        }

        if (!counted) {
          const fallbackKey = `${feed.defaultMode}Stops` as keyof GTFSCoverageData;
          if (typeof data[fallbackKey] === 'number') {
            (data[fallbackKey] as number)++;
            data.totalStops++;
          }
        }
      }
    }

    upsertTfNSWCache(lga.lgaCode, 'GTFS_COVERAGE', data, new Date().getFullYear());
    upserted++;
  }

  // ── AM-peak service frequency per LGA ─────────────────────────────────────
  if (serviceDate) {
    const greaterSydneyCodes = new Set(GREATER_SYDNEY_GCCSA_AREA_IDS.map(id => LGA_CODE_MAP[id]).filter(Boolean));
    const { greaterSydney, nsw } = frequencyBenchmarks(lgaFrequencyStops, allPeakDepartures, serviceDate, code => greaterSydneyCodes.has(code));
    const benchmarks = {
      greaterSydneyFrequentStopShare: greaterSydney.frequentStopShare,
      nswFrequentStopShare: nsw.frequentStopShare,
    };
    const year = new Date().getFullYear();
    let frequencyUpserted = 0;
    for (const [lgaCode, stops] of lgaFrequencyStops) {
      upsertTfNSWCache(lgaCode, 'GTFS_FREQUENCY', { ...summariseFrequency(stops, allPeakDepartures, serviceDate), benchmarks }, year);
      frequencyUpserted++;
    }
    // Benchmark areas get the pooled summaries themselves.
    if (LGA_CODE_MAP.benchmark_gsy) upsertTfNSWCache(LGA_CODE_MAP.benchmark_gsy, 'GTFS_FREQUENCY', { ...greaterSydney, benchmarks }, year);
    if (LGA_CODE_MAP.benchmark_nsw) upsertTfNSWCache(LGA_CODE_MAP.benchmark_nsw, 'GTFS_FREQUENCY', { ...nsw, benchmarks }, year);
    console.log(`  ✅ ${frequencyUpserted} LGAs with AM-peak frequency data stored in tfnsw_cache (service date ${serviceDate})`);
    console.log(`     Frequent-stop share: Greater Sydney ${greaterSydney.frequentStopShare}%, NSW ${nsw.frequentStopShare}%`);

    // Per-stop counts for catchment analysis go to the build database, not cache.db.
    const stopFrequencyRows = bundleStopFrequencyRows(feedResults, serviceDate);
    replaceGtfsStopFrequency(stopFrequencyRows);
    console.log(`  ✅ ${stopFrequencyRows.length} stops written to gtfs_stop_frequency in data/build.db`);
  }

  setConfigValue('tfnsw_last_refresh', new Date().toISOString());
  console.log(`  ✅ ${upserted} LGAs with PT coverage data stored in tfnsw_cache`);
  console.log('\n✨ GTFS seed complete!\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
