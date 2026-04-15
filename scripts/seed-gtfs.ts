/**
 * GTFS Seed Script — TfNSW Open Data
 *
 * Downloads GTFS schedule zips from TfNSW, spatially joins stops to NSW LGA
 * polygons, and stores per-LGA PT coverage metrics in tfnsw_cache.
 *
 * Stored dataset key: 'GTFS_COVERAGE'
 * Shape: GTFSCoverageData (see interface below)
 *
 * Run:  npm run seed:gtfs
 */

import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import { upsertTfNSWCache, upsertGtfsStopsBatch, clearGtfsStops, setConfigValue } from '../src/lib/db';
import type { GtfsStop } from '../src/lib/db';
import { LGA_CODE_MAP } from '../src/lib/abs-fetchers';

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

// ─── Load LGA polygons ────────────────────────────────────────────────────────

interface LGAFeature {
  areaId: string;       // e.g. 'lga_sydney'
  lgaCode: string;      // e.g. '17200'
  feature: GeoJSON.Feature;
}

function loadLGAPolygons(): LGAFeature[] {
  const geojson = JSON.parse(fs.readFileSync(GEO_PATH, 'utf-8')) as GeoJSON.FeatureCollection;
  const result: LGAFeature[] = [];
  for (const feature of geojson.features) {
    const areaId = (feature.properties as Record<string, string>)['id'];
    const lgaCode = LGA_CODE_MAP[areaId];
    if (!lgaCode) continue; // benchmark areas without an ABS code
    result.push({ areaId, lgaCode, feature });
  }
  return result;
}

// ─── Spatial join ─────────────────────────────────────────────────────────────

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
}

function processFeedZip(feedId: string, defaultMode: string, buf: Buffer): FeedResult | null {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buf);
  } catch (err) {
    console.error(`  ✗ ${feedId}: failed to parse zip:`, err);
    return null;
  }

  // ── stops.txt ───────────────────────────────────────────────────────────────
  const stopsEntry = zip.getEntry('stops.txt');
  if (!stopsEntry) {
    console.warn(`  ↳ ${feedId}: no stops.txt — skipping`);
    return null;
  }
  const stopsText = stopsEntry.getData().toString('utf-8');
  const stopsRows = parseCSV(stopsText);
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
  const routesEntry = zip.getEntry('routes.txt');
  const routesMap = new Map<string, number>();
  if (routesEntry) {
    const routesRows = parseCSV(routesEntry.getData().toString('utf-8').replace(/^\uFEFF/, ''));
    for (const row of routesRows) {
      routesMap.set(row['route_id'], parseInt(row['route_type'] ?? '3', 10));
    }
    console.log(`  ↳ ${feedId}: ${routesMap.size} routes`);
  }

  // ── trips.txt ───────────────────────────────────────────────────────────────
  // Build trip_id → route_id map (needed to link stop_times → routes)
  const tripsEntry = zip.getEntry('trips.txt');
  const tripToRoute = new Map<string, string>();
  if (tripsEntry) {
    const tripsRows = parseCSV(tripsEntry.getData().toString('utf-8').replace(/^\uFEFF/, ''));
    for (const row of tripsRows) {
      tripToRoute.set(row['trip_id'], row['route_id']);
    }
    console.log(`  ↳ ${feedId}: ${tripToRoute.size} trips`);
  }

  // ── stop_times.txt ──────────────────────────────────────────────────────────
  // Build stop_id → Set<route_id> map
  // This file can be large (100MB+) — process line by line from buffer
  const stopRoutes = new Map<string, Set<string>>();
  const stopTimesEntry = zip.getEntry('stop_times.txt');
  if (stopTimesEntry && tripToRoute.size > 0) {
    const stText = stopTimesEntry.getData().toString('utf-8');
    const lines = stText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    // Strip BOM and quotes from header
    const rawHeader = lines[0].replace(/^\uFEFF/, '');
    const headers = rawHeader.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const stopIdIdx = headers.indexOf('stop_id');
    const tripIdIdx = headers.indexOf('trip_id');
    if (stopIdIdx >= 0 && tripIdIdx >= 0) {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
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
    } else {
      console.warn(`  ↳ ${feedId}: stop_times.txt headers not recognised (got: ${headers.slice(0,5).join(',')})`);
    }
    console.log(`  ↳ ${feedId}: stop_times processed (${stopRoutes.size} unique stops with routes)`);
  }

  return { feedId, defaultMode, stops: stopsMap, routes: routesMap, stopRoutes };
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

  if (!process.env.TFNSW_API_KEY) {
    console.error('✗ TFNSW_API_KEY not set. Add it to .env.local and retry.\n');
    process.exit(1);
  }

  // Load LGA polygons
  console.log('Loading LGA polygons from public/geo/lga-nsw.json...');
  const lgas = loadLGAPolygons();
  console.log(`  ${lgas.length} LGAs loaded\n`);

  // Download and process each GTFS feed
  const feedResults: FeedResult[] = [];

  for (const feed of GTFS_FEEDS) {
    console.log(`\n[${feed.name}]`);
    const buf = await downloadFeed(feed.feedId);
    if (!buf) continue;

    const result = processFeedZip(feed.feedId, feed.defaultMode, buf);
    if (result) feedResults.push(result);
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

  for (const [key, _lgaCode] of stopToLGA) {
    const [feedIdxStr, ...rest] = key.split(':');
    const feedIdx = parseInt(feedIdxStr, 10);
    const stopId = rest.join(':');
    const feed = feedResults[feedIdx];
    if (!feed) continue;
    const coords = feed.stops.get(stopId);
    if (!coords) continue;

    // Determine mode from routes serving this stop
    const routesForStop = feed.stopRoutes.get(stopId);
    let mode: string;
    if (routesForStop && routesForStop.size > 0) {
      const modeKeys = new Set<string>();
      for (const routeId of routesForStop) {
        const routeType = feed.routes.get(routeId);
        modeKeys.add(routeType !== undefined
          ? routeTypeToMode(routeType, feed.defaultMode)
          : `${feed.defaultMode}Stops`);
      }
      mode = pickPrimaryMode(modeKeys);
    } else {
      mode = feed.defaultMode;
    }

    // Resolve stop_name from the stops.txt rows (stored in stopsMap as coords only)
    // We don't have stop_name in stopsMap — get it from stopsRows via the feed's stops array
    // The stops CSV text was parsed earlier; we'll use the feedId as a lookup key prefix
    const prefixedId = `${feed.feedId}_${stopId}`;
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

  setConfigValue('tfnsw_last_refresh', new Date().toISOString());
  console.log(`  ✅ ${upserted} LGAs with PT coverage data stored in tfnsw_cache`);
  console.log('\n✨ GTFS seed complete!\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
