#!/usr/bin/env tsx
/**
 * Official Transport Seed — commute time, commuting distance, station patronage
 *
 * Replaces the modelled commute / patronage figures with official open data:
 *   HTS_COMMUTE        (tfnsw_cache) TfNSW Household Travel Survey, Data by LGA
 *   STATION_PATRONAGE  (tfnsw_cache) TfNSW station monthly entries/exits, joined
 *                      to LGAs via GTFS stop locations (needs `npm run seed:gtfs` first)
 *   COMMUTE_DIST_2016  (abs_cache)   ABS Census 2016 commuting distance, all LGAs
 *   CRASH_SUMMARY_LIVE (tfnsw_cache) NSW road crash data — crashes by reporting year,
 *                      fatal / injury, all LGAs (otherwise fetched lazily per page view)
 *
 * No API key needed. Resource URLs are resolved from the TfNSW CKAN catalogue.
 *
 * Run:  npm run seed:transport
 */

import * as fs from 'fs';
import * as path from 'path';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import { getDb, upsertABSCache, upsertTfNSWCache, setConfigValue } from '../src/lib/db';
import { LGA_CODE_MAP, fetchCommuteDistance2016 } from '../src/lib/abs-fetchers';
import { seedCrashTrendsForAllLgas } from '../src/lib/tfnsw-api';
import {
  TFNSW_CKAN_BASE, HTS_PACKAGE, STATION_USAGE_PACKAGE,
  HTS_COMMUTE_DATASET, STATION_PATRONAGE_DATASET,
  pickHtsLgaResources, pickStationUsageResource,
  parseHtsLgaWorkbook, buildHtsCommuteData,
  parseStationUsageCsv, buildStationPatronage, stationMatchKey, STATION_LGA_OVERRIDES,
  type CkanResource,
} from '../src/lib/tfnsw-official';

const GEO_PATH = path.join(process.cwd(), 'public', 'geo', 'lga-nsw.json');

async function getPackageResources(slug: string): Promise<CkanResource[]> {
  const res = await fetch(`${TFNSW_CKAN_BASE}/package_show?id=${slug}`);
  if (!res.ok) throw new Error(`CKAN package_show ${slug}: HTTP ${res.status}`);
  const json = await res.json() as { result: { resources: CkanResource[] } };
  return json.result.resources;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function uniqueLgaCodes(): string[] {
  return Array.from(new Set(
    Object.entries(LGA_CODE_MAP).filter(([id]) => id.startsWith('lga_')).map(([, code]) => code),
  ));
}

// ─── Household Travel Survey ─────────────────────────────────────────────────

async function seedHtsCommute(): Promise<void> {
  console.log('\n[HTS] Household Travel Survey — commute time by LGA');
  const urls = pickHtsLgaResources(await getPackageResources(HTS_PACKAGE));
  if (urls.length === 0) throw new Error('No "Data by LGA" XLSX resources found in HTS package');

  // Older release first so the newer workbook wins for overlapping years.
  urls.sort((a, b) => (/2009/.test(a) ? -1 : 0) - (/2009/.test(b) ? -1 : 0));
  const parsed = [];
  for (const url of urls) {
    console.log(`  ↳ ${url.split('/').pop()}`);
    parsed.push(parseHtsLgaWorkbook(await download(url)));
  }

  const known = new Set(uniqueLgaCodes());
  const data = buildHtsCommuteData(parsed);
  let written = 0;
  for (const [code, entry] of Array.from(data.entries())) {
    if (!known.has(code)) { console.warn(`  ⚠ HTS LGA ${code} not in LGA_CODE_MAP — skipped`); continue; }
    const year = Number(entry.latest?.financialYear.slice(0, 4) ?? entry.series.at(-1)?.financialYear.slice(0, 4));
    upsertTfNSWCache(code, HTS_COMMUTE_DATASET, entry, year + 1);
    written++;
  }
  console.log(`  ✓ ${written} LGAs with HTS commute data`);
}

// ─── ABS commuting distance ──────────────────────────────────────────────────

async function seedCommuteDistance(): Promise<void> {
  console.log('\n[ABS] Census 2016 commuting distance (ABS_REGIONAL_LGA2020)');
  let written = 0;
  for (const code of uniqueLgaCodes()) {
    const d = await fetchCommuteDistance2016(code);
    if (d) { upsertABSCache(code, 'COMMUTE_DIST_2016', d, 2016); written++; }
  }
  console.log(`  ✓ ${written} LGAs with commuting distance`);
}

// ─── Station entries / exits ─────────────────────────────────────────────────

interface LgaPolygon { lgaCode: string; feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> }

function loadLgaPolygons(): LgaPolygon[] {
  const geojson = JSON.parse(fs.readFileSync(GEO_PATH, 'utf-8')) as GeoJSON.FeatureCollection;
  return geojson.features.flatMap((feature) => {
    const lgaCode = LGA_CODE_MAP[(feature.properties as Record<string, string>).id];
    return lgaCode ? [{ lgaCode, feature: feature as LgaPolygon['feature'] }] : [];
  });
}

/** GTFS stops (rail, metro, light rail first) indexed by station match key. */
function loadStopLocations(): Map<string, { lat: number; lng: number }> {
  const rows = getDb().prepare(`
    SELECT stop_name, lat, lng FROM gtfs_stops
    ORDER BY CASE mode WHEN 'train' THEN 0 WHEN 'metro' THEN 1 WHEN 'lightRail' THEN 2 ELSE 3 END
  `).all() as Array<{ stop_name: string; lat: number; lng: number }>;
  const byKey = new Map<string, { lat: number; lng: number }>();
  for (const r of rows) {
    const key = stationMatchKey(r.stop_name);
    if (!byKey.has(key)) byKey.set(key, { lat: r.lat, lng: r.lng });
  }
  return byKey;
}

async function seedStationPatronage(): Promise<void> {
  console.log('\n[TfNSW] Station monthly entries/exits → LGA');
  const url = pickStationUsageResource(await getPackageResources(STATION_USAGE_PACKAGE));
  if (!url) throw new Error('Current station usage CSV not found in CKAN package');
  console.log(`  ↳ ${url.split('/').pop()}`);
  const rows = parseStationUsageCsv((await download(url)).toString('utf-8'));

  const stops = loadStopLocations();
  if (stops.size === 0) throw new Error('gtfs_stops is empty — run `npm run seed:gtfs` first');
  const polygons = loadLgaPolygons();

  const stationLga = new Map<string, string | null>();
  const unmatched: string[] = [];
  for (const station of Array.from(new Set(rows.map((r) => r.station)))) {
    const key = stationMatchKey(station);
    const override = STATION_LGA_OVERRIDES[key];
    if (override) { stationLga.set(station, override); continue; }
    const loc = stops.get(key);
    if (!loc) { unmatched.push(station); stationLga.set(station, null); continue; }
    const pt = turfPoint([loc.lng, loc.lat]);
    const lga = polygons.find((p) => booleanPointInPolygon(pt, p.feature));
    stationLga.set(station, lga?.lgaCode ?? null);
    if (!lga) unmatched.push(`${station} (outside LGA polygons)`);
  }

  const data = buildStationPatronage(rows, (s) => stationLga.get(s) ?? null);
  for (const [code, entry] of Array.from(data.entries())) {
    upsertTfNSWCache(code, STATION_PATRONAGE_DATASET, entry, Number(entry.latest12mPeriod.to.slice(0, 4)));
  }

  const matched = stationLga.size - unmatched.length;
  console.log(`  ✓ ${matched}/${stationLga.size} stations located; ${data.size} LGAs with station patronage`);
  if (unmatched.length) console.log(`  ⚠ Not attributed (${unmatched.length}): ${unmatched.join('; ')}`);
}

// ─── Road crashes ────────────────────────────────────────────────────────────

async function seedCrashTrends(): Promise<void> {
  console.log('\n[TfNSW] NSW road crash data → crashes by LGA and year');
  console.log(`  ✓ ${await seedCrashTrendsForAllLgas()} LGAs with crash trends`);
}

async function main(): Promise<void> {
  getDb();
  const failures: string[] = [];
  for (const [name, step] of [
    ['HTS_COMMUTE', seedHtsCommute],
    ['COMMUTE_DIST_2016', seedCommuteDistance],
    ['STATION_PATRONAGE', seedStationPatronage],
    ['CRASH_SUMMARY_LIVE', seedCrashTrends],
  ] as const) {
    try { await step(); } catch (err) {
      failures.push(name);
      console.error(`  ✗ ${name}: ${(err as Error).message}`);
    }
  }
  setConfigValue('official_transport_last_seed', new Date().toISOString());
  if (failures.length) {
    console.error(`\nFinished with failures: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
