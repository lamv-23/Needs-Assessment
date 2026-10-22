/**
 * Official transport seed — shared by `npm run seed:transport` and the admin
 * refresh worker (job type 'transport').
 *
 *   HTS_COMMUTE        (tfnsw_cache) TfNSW Household Travel Survey, Data by LGA
 *   COMMUTE_DIST_2016  (abs_cache)   ABS Census 2016 commuting distance, all LGAs
 *   STATION_PATRONAGE  (tfnsw_cache) TfNSW station monthly entries/exits, joined
 *                      to LGAs via GTFS stop locations (needs `npm run seed:gtfs`)
 *   CRASH_SUMMARY_LIVE (tfnsw_cache) NSW road crash data by LGA and reporting year
 *
 * No API key needed. Resource URLs are resolved from the TfNSW CKAN catalogue.
 * Reads and writes go through the repositories, so it works on SQLite and Postgres.
 */

import * as fs from 'fs';
import * as path from 'path';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import { LGA_CODE_MAP, fetchCommuteDistance2016 } from '@/lib/abs-fetchers';
import { seedCrashTrendsForAllLgas } from '@/lib/tfnsw-api';
import {
  getOperationsRepository, getSeedWriteRepository, getTransitStopsRepository,
} from '@/lib/repositories';
import {
  TFNSW_CKAN_BASE, HTS_PACKAGE, STATION_USAGE_PACKAGE,
  HTS_COMMUTE_DATASET, STATION_PATRONAGE_DATASET,
  pickHtsLgaResources, pickStationUsageResource,
  parseHtsLgaWorkbook, buildHtsCommuteData,
  parseStationUsageCsv, buildStationPatronage, stationMatchKey, STATION_LGA_OVERRIDES,
  type CkanResource,
} from '@/lib/tfnsw-official';

export const OFFICIAL_TRANSPORT_LAST_SEED_KEY = 'official_transport_last_seed';

const GEO_PATH = path.join(process.cwd(), 'public', 'geo', 'lga-nsw.json');
// Bounding box covering all of NSW, for reading every GTFS stop.
const NSW_BOUNDS = { minLat: -38, maxLat: -28, minLng: 140, maxLng: 154.5 } as const;

type Log = (message: string) => void;

export interface OfficialTransportSeedResult {
  htsLgas: number;
  commuteDistanceLgas: number;
  stationPatronageLgas: number;
  stationsLocated: number;
  stationsTotal: number;
  unattributedStations: string[];
  crashLgas: number;
  failures: string[];
}

async function getPackageResources(slug: string): Promise<CkanResource[]> {
  const res = await fetch(`${TFNSW_CKAN_BASE}/package_show?id=${slug}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`CKAN package_show ${slug}: HTTP ${res.status}`);
  const json = await res.json() as { result: { resources: CkanResource[] } };
  return json.result.resources;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Download failed ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function uniqueLgaCodes(): string[] {
  return Array.from(new Set(
    Object.entries(LGA_CODE_MAP).filter(([id]) => id.startsWith('lga_')).map(([, code]) => code),
  ));
}

// ─── Household Travel Survey ─────────────────────────────────────────────────

async function seedHtsCommute(log: Log): Promise<number> {
  const urls = pickHtsLgaResources(await getPackageResources(HTS_PACKAGE));
  if (urls.length === 0) throw new Error('No "Data by LGA" XLSX resources found in HTS package');

  // Older release first so the newer workbook wins for overlapping years.
  urls.sort((a, b) => (/2009/.test(a) ? -1 : 0) - (/2009/.test(b) ? -1 : 0));
  const parsed = [];
  for (const url of urls) {
    log(`  ↳ ${url.split('/').pop()}`);
    parsed.push(parseHtsLgaWorkbook(await download(url)));
  }

  const known = new Set(uniqueLgaCodes());
  const repo = getSeedWriteRepository();
  let written = 0;
  for (const [code, entry] of Array.from(buildHtsCommuteData(parsed).entries())) {
    if (!known.has(code)) { log(`  ⚠ HTS LGA ${code} not in LGA_CODE_MAP — skipped`); continue; }
    const year = Number(entry.latest?.financialYear.slice(0, 4) ?? entry.series.at(-1)?.financialYear.slice(0, 4));
    await repo.upsertTfNSWCache(code, HTS_COMMUTE_DATASET, entry, year + 1);
    written++;
  }
  return written;
}

// ─── ABS commuting distance ──────────────────────────────────────────────────

async function seedCommuteDistance(): Promise<number> {
  const repo = getSeedWriteRepository();
  let written = 0;
  for (const code of uniqueLgaCodes()) {
    const d = await fetchCommuteDistance2016(code);
    if (d) { await repo.upsertABSCache(code, 'COMMUTE_DIST_2016', d, 2016); written++; }
  }
  return written;
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

const MODE_PRIORITY: Record<string, number> = { train: 0, metro: 1, lightRail: 2 };

/** GTFS stops (rail, metro, light rail first) indexed by station match key. */
async function loadStopLocations(): Promise<Map<string, { lat: number; lng: number }>> {
  const stops = await getTransitStopsRepository().queryStopsInBounds(
    NSW_BOUNDS.minLat, NSW_BOUNDS.maxLat, NSW_BOUNDS.minLng, NSW_BOUNDS.maxLng,
  );
  stops.sort((a, b) => (MODE_PRIORITY[a.mode] ?? 3) - (MODE_PRIORITY[b.mode] ?? 3));
  const byKey = new Map<string, { lat: number; lng: number }>();
  for (const s of stops) {
    const key = stationMatchKey(s.stopName);
    if (!byKey.has(key)) byKey.set(key, { lat: s.lat, lng: s.lng });
  }
  return byKey;
}

async function seedStationPatronage(log: Log): Promise<{ lgas: number; located: number; total: number; unattributed: string[] }> {
  const url = pickStationUsageResource(await getPackageResources(STATION_USAGE_PACKAGE));
  if (!url) throw new Error('Current station usage CSV not found in CKAN package');
  log(`  ↳ ${url.split('/').pop()}`);
  const rows = parseStationUsageCsv((await download(url)).toString('utf-8'));

  const stops = await loadStopLocations();
  if (stops.size === 0) throw new Error('gtfs_stops is empty — run `npm run seed:gtfs` first');
  const polygons = loadLgaPolygons();

  const stationLga = new Map<string, string | null>();
  const unattributed: string[] = [];
  for (const station of Array.from(new Set(rows.map((r) => r.station)))) {
    const key = stationMatchKey(station);
    const override = STATION_LGA_OVERRIDES[key];
    if (override) { stationLga.set(station, override); continue; }
    const loc = stops.get(key);
    if (!loc) { unattributed.push(station); stationLga.set(station, null); continue; }
    const pt = turfPoint([loc.lng, loc.lat]);
    const lga = polygons.find((p) => booleanPointInPolygon(pt, p.feature));
    stationLga.set(station, lga?.lgaCode ?? null);
    if (!lga) unattributed.push(`${station} (outside LGA polygons)`);
  }

  const repo = getSeedWriteRepository();
  const data = buildStationPatronage(rows, (s) => stationLga.get(s) ?? null);
  for (const [code, entry] of Array.from(data.entries())) {
    await repo.upsertTfNSWCache(code, STATION_PATRONAGE_DATASET, entry, Number(entry.latest12mPeriod.to.slice(0, 4)));
  }
  return { lgas: data.size, located: stationLga.size - unattributed.length, total: stationLga.size, unattributed };
}

// ─── Run all steps ───────────────────────────────────────────────────────────

/**
 * Runs every step even if one fails; records the last-seed time only when all
 * succeed, so a scheduled refresh retries after a partial failure.
 */
export async function seedOfficialTransport(log: Log = () => {}): Promise<OfficialTransportSeedResult> {
  const result: OfficialTransportSeedResult = {
    htsLgas: 0, commuteDistanceLgas: 0, stationPatronageLgas: 0,
    stationsLocated: 0, stationsTotal: 0, unattributedStations: [], crashLgas: 0, failures: [],
  };

  const steps: Array<[string, () => Promise<void>]> = [
    ['HTS_COMMUTE', async () => {
      log('\n[HTS] Household Travel Survey — commute time by LGA');
      result.htsLgas = await seedHtsCommute(log);
      log(`  ✓ ${result.htsLgas} LGAs with HTS commute data`);
    }],
    ['COMMUTE_DIST_2016', async () => {
      log('\n[ABS] Census 2016 commuting distance (ABS_REGIONAL_LGA2020)');
      result.commuteDistanceLgas = await seedCommuteDistance();
      log(`  ✓ ${result.commuteDistanceLgas} LGAs with commuting distance`);
    }],
    ['STATION_PATRONAGE', async () => {
      log('\n[TfNSW] Station monthly entries/exits → LGA');
      const s = await seedStationPatronage(log);
      Object.assign(result, {
        stationPatronageLgas: s.lgas, stationsLocated: s.located, stationsTotal: s.total, unattributedStations: s.unattributed,
      });
      log(`  ✓ ${s.located}/${s.total} stations located; ${s.lgas} LGAs with station patronage`);
      if (s.unattributed.length) log(`  ⚠ Not attributed (${s.unattributed.length}): ${s.unattributed.join('; ')}`);
    }],
    ['CRASH_SUMMARY_LIVE', async () => {
      log('\n[TfNSW] NSW road crash data → crashes by LGA and year');
      result.crashLgas = await seedCrashTrendsForAllLgas();
      log(`  ✓ ${result.crashLgas} LGAs with crash trends`);
    }],
  ];

  for (const [name, step] of steps) {
    try {
      await step();
    } catch (err) {
      result.failures.push(name);
      log(`  ✗ ${name}: ${(err as Error).message}`);
    }
  }

  if (result.failures.length === 0) {
    await getOperationsRepository().setConfigValue(OFFICIAL_TRANSPORT_LAST_SEED_KEY, new Date().toISOString());
  }
  return result;
}
