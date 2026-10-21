/**
 * Official TfNSW Open Data sources for commute time and station patronage.
 *
 * Both are CC-BY 4.0 downloads from opendata.transport.nsw.gov.au — no API key.
 *
 *   HTS_COMMUTE        Household Travel Survey "Data by LGA" workbooks —
 *                      average weekday commute journey time / distance.
 *                      Covers 45 LGAs (Sydney GMA, Central Coast, Hunter,
 *                      Illawarra, Shoalhaven); 2016/17–2019/20, 2021/22 (partial),
 *                      2022/23 onward. No 2020/21 LGA release (COVID).
 *   STATION_PATRONAGE  Train, Metro and Light Rail station monthly entries/exits
 *                      (Opal), attributed to LGAs by station location.
 *
 * Parsing is pure so it can be unit-tested; downloading and the spatial join
 * live in scripts/seed-official-transport.ts.
 */

import * as XLSX from 'xlsx';

export const TFNSW_CKAN_BASE = 'https://opendata.transport.nsw.gov.au/data/api/3/action';
export const HTS_PACKAGE = 'household-travel-survey';
export const STATION_USAGE_PACKAGE = 'train-station-entries-and-exits-data';

export const HTS_COMMUTE_DATASET = 'HTS_COMMUTE';
export const STATION_PATRONAGE_DATASET = 'STATION_PATRONAGE';

// ─── CKAN resource discovery ─────────────────────────────────────────────────

export interface CkanResource {
  name: string;
  format: string;
  url: string;
}

/** Resource URLs change between releases, so pick them by name at seed time. */
export function pickHtsLgaResources(resources: CkanResource[]): string[] {
  return resources
    .filter((r) => r.format.toUpperCase() === 'XLSX' && /data by lga/i.test(r.name))
    .map((r) => r.url);
}

export function pickStationUsageResource(resources: CkanResource[]): string | null {
  const current = resources.find(
    (r) => r.format.toUpperCase() === 'CSV'
      && /station monthly usage/i.test(r.name)
      && !/no longer updated/i.test(r.name),
  );
  return current?.url ?? null;
}

// ─── Household Travel Survey ─────────────────────────────────────────────────

/**
 * HTS reliability flags appended to category labels:
 *   (none) RSE < 25%  ·  *  RSE 25–50%, use with caution  ·  **  RSE > 50%, unreliable
 */
export type HtsReliability = 'reliable' | 'use_with_caution' | 'unreliable';

export interface HtsCommutePoint {
  financialYear: string;      // e.g. '2024/25'
  avgMinutes: number;         // average commute journey time, weekday
  avgKm: number | null;       // average commute journey distance
  journeys: number | null;    // average weekday commute journeys by residents
  reliability: HtsReliability;
}

export interface HtsCommuteData {
  series: HtsCommutePoint[];  // oldest → newest
  /** Most recent point that is not flagged unreliable. */
  latest: HtsCommutePoint | null;
  source: 'tfnsw_hts';
}

export function parseHtsReliability(label: string): HtsReliability {
  const stars = /(\*+)\s*$/.exec(label)?.[1].length ?? 0;
  if (stars >= 2) return 'unreliable';
  if (stars === 1) return 'use_with_caution';
  return 'reliable';
}

const stripFlags = (label: string) => label.replace(/[*^]+\s*$/, '').trim();

/** HTS HH_LGA_ID is the ABS LGA code without the leading state digit (7200 → 17200). */
export function htsLgaIdToAbsCode(id: number | string): string {
  return String(10000 + Number(id));
}

/** Parse one HTS "Data by LGA" workbook → ABS LGA code → commute points. */
export function parseHtsLgaWorkbook(buffer: ArrayBuffer | Buffer): Map<string, HtsCommutePoint[]> {
  const workbook = XLSX.read(buffer, { type: Buffer.isBuffer(buffer) ? 'buffer' : 'array' });
  const sheetName = workbook.SheetNames.find((n) => /data by purpose/i.test(n));
  const out = new Map<string, HtsCommutePoint[]>();
  if (!sheetName) return out;

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: null });
  for (const raw of rows) {
    // Header case differs between releases (lowercase 2009–19, uppercase 2020–25).
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) row[k.toLowerCase()] = v;

    const purpose = String(row.travel_purpose ?? '');
    if (stripFlags(purpose).toLowerCase() !== 'commute') continue;

    const minutes = Number(row.journey_avg_time);
    if (!row.hh_lga_id || !Number.isFinite(minutes)) continue;

    const km = Number(row.journey_avg_distance);
    const journeys = Number(row.journeys_by_purpose ?? row.journeys_by_mode);
    const code = htsLgaIdToAbsCode(row.hh_lga_id as number);
    const points = out.get(code) ?? [];
    points.push({
      financialYear: String(row.financial_year),
      avgMinutes: minutes,
      avgKm: Number.isFinite(km) ? km : null,
      journeys: Number.isFinite(journeys) ? journeys : null,
      reliability: parseHtsReliability(purpose),
    });
    out.set(code, points);
  }
  return out;
}

/** Merge per-workbook results; a later workbook wins for the same financial year. */
export function buildHtsCommuteData(parsed: Map<string, HtsCommutePoint[]>[]): Map<string, HtsCommuteData> {
  const merged = new Map<string, Map<string, HtsCommutePoint>>();
  for (const workbook of parsed) {
    for (const [code, points] of Array.from(workbook.entries())) {
      const byYear = merged.get(code) ?? new Map<string, HtsCommutePoint>();
      for (const p of points) byYear.set(p.financialYear, p);
      merged.set(code, byYear);
    }
  }

  const out = new Map<string, HtsCommuteData>();
  for (const [code, byYear] of Array.from(merged.entries())) {
    const series = Array.from(byYear.values()).sort((a, b) => a.financialYear.localeCompare(b.financialYear));
    const usable = series.filter((p) => p.reliability !== 'unreliable');
    out.set(code, { series, latest: usable[usable.length - 1] ?? null, source: 'tfnsw_hts' });
  }
  return out;
}

// ─── Station entries / exits ─────────────────────────────────────────────────

export interface StationMonthRow {
  month: string;          // 'YYYY-MM'
  station: string;        // normalised display name, e.g. 'Parramatta Station'
  stationType: string;    // Train | Metro | Metro Shared | Light rail
  direction: 'entry' | 'exit';
  trips: number;          // 0 when suppressed
  suppressed: boolean;    // published as "Less than 50"
}

export interface StationPatronageData {
  months: Array<{ month: string; entries: number; exits: number }>; // oldest → newest
  /** Sum of entries over the latest 12 months available. */
  latest12mEntries: number;
  latest12mPeriod: { from: string; to: string };
  stations: Array<{ name: string; type: string; entries12m: number }>;
  /** Cells published as "Less than 50" (counted as 0, so totals are a lower bound). */
  suppressedCells: number;
  source: 'tfnsw_station_entries_exits';
}

export const cleanStationName = (name: string) => name.replace(/\s+/g, ' ').trim();

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) { values.push(cur); cur = ''; }
    else cur += ch;
  }
  values.push(cur);
  return values.map((v) => v.trim());
}

export function parseStationUsageCsv(text: string): StationMonthRow[] {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  const headers = splitCsvLine(lines[0] ?? '').map((h) => h.toLowerCase());
  const idx = (name: string) => headers.indexOf(name);
  const [iMonth, iStation, iType, iDir, iTrip] =
    ['monthyear', 'station', 'station_type', 'entry_exit', 'trip'].map(idx);
  if ([iMonth, iStation, iType, iDir, iTrip].some((i) => i < 0)) {
    throw new Error(`Unexpected station usage columns: ${headers.join(', ')}`);
  }

  const rows: StationMonthRow[] = [];
  for (const line of lines.slice(1)) {
    const v = splitCsvLine(line);
    const station = cleanStationName(v[iStation] ?? '');
    if (!station || /^unknown$/i.test(station)) continue;
    const tripRaw = v[iTrip] ?? '';
    const n = Number(tripRaw.replace(/,/g, ''));
    const suppressed = !Number.isFinite(n);
    rows.push({
      month: (v[iMonth] ?? '').slice(0, 7),
      station,
      stationType: v[iType] ?? '',
      direction: /exit/i.test(v[iDir] ?? '') ? 'exit' : 'entry',
      trips: suppressed ? 0 : n,
      suppressed,
    });
  }
  return rows;
}

/** Key used to match station-usage names to GTFS stop names. */
export function stationMatchKey(name: string): string {
  return cleanStationName(name)
    .toLowerCase()
    .replace(/\s*,.*$/, '')               // "Paddy's Markets Light Rail, Darling Dr"
    .replace(/\s+platform\s+\S+.*$/, '')  // "Parramatta Station Platform 1"
    .replace(/['’]/g, '')
    .replace(/\bmarkets?\b/g, 'market')
    .trim();
}

/**
 * LGA for stations missing from the seeded GTFS stops (newer light rail lines
 * and Gadigal metro). Codes are ABS 2021 LGA codes. Keyed by stationMatchKey().
 */
const SYDNEY = '17200';
const RANDWICK = '16550';
const PARRAMATTA = '16260';
const NEWCASTLE = '15900';
export const STATION_LGA_OVERRIDES: Record<string, string> = {
  // Sydney Metro
  'gadigal station': SYDNEY,
  // L2 / L3 Sydney CBD & South East
  'bridge street light rail': SYDNEY, 'central chalmers street light rail': SYDNEY,
  'chinatown light rail': SYDNEY, 'circular quay light rail': SYDNEY,
  'haymarket light rail': SYDNEY, 'qvb light rail': SYDNEY, 'town hall light rail': SYDNEY,
  'wynyard light rail': SYDNEY, 'surry hills light rail': SYDNEY, 'crown street light rail': SYDNEY,
  'moore park light rail': SYDNEY,
  'es marks light rail': RANDWICK, 'kensington light rail': RANDWICK, 'kingsford light rail': RANDWICK,
  'randwick light rail': RANDWICK, 'royal randwick light rail': RANDWICK,
  'unsw anzac parade light rail': RANDWICK, 'unsw high street light rail': RANDWICK,
  'wansey road light rail': RANDWICK,
  // L1 Dulwich Hill (Pyrmont stops)
  'convention light rail': SYDNEY, 'fish market light rail': SYDNEY,
  // Newcastle Light Rail
  'civic light rail': NEWCASTLE, 'honeysuckle light rail': NEWCASTLE,
  'newcastle beach light rail': NEWCASTLE, 'newcastle interchange light rail': NEWCASTLE,
  'queens wharf light rail': NEWCASTLE,
  // L4 Parramatta Light Rail
  'benaud oval light rail': PARRAMATTA, 'childrens hospital light rail': PARRAMATTA,
  'church street light rail': PARRAMATTA, 'dundas light rail': PARRAMATTA,
  'fennell street light rail': PARRAMATTA, 'ngara light rail': PARRAMATTA,
  'parramatta square light rail': PARRAMATTA, 'prince alfred square light rail': PARRAMATTA,
  'robin thomas light rail': PARRAMATTA, 'rosehill gardens light rail': PARRAMATTA,
  'tramway avenue light rail': PARRAMATTA, 'westmead hospital light rail': PARRAMATTA,
  'westmead light rail': PARRAMATTA, 'yallamundi light rail': PARRAMATTA,
};

/** Aggregate station rows into per-LGA patronage, given a station → LGA code lookup. */
export function buildStationPatronage(
  rows: StationMonthRow[],
  stationToLga: (station: string) => string | null,
): Map<string, StationPatronageData> {
  const allMonths = Array.from(new Set(rows.map((r) => r.month))).sort();
  const last12 = new Set(allMonths.slice(-12));
  const period = { from: allMonths[Math.max(0, allMonths.length - 12)] ?? '', to: allMonths[allMonths.length - 1] ?? '' };

  interface Acc {
    months: Map<string, { entries: number; exits: number }>;
    stations: Map<string, { type: string; entries12m: number }>;
    suppressed: number;
  }
  const acc = new Map<string, Acc>();

  for (const r of rows) {
    const code = stationToLga(r.station);
    if (!code) continue;
    const a = acc.get(code) ?? { months: new Map(), stations: new Map(), suppressed: 0 };
    const m = a.months.get(r.month) ?? { entries: 0, exits: 0 };
    if (r.direction === 'entry') m.entries += r.trips; else m.exits += r.trips;
    a.months.set(r.month, m);

    const s = a.stations.get(r.station) ?? { type: r.stationType, entries12m: 0 };
    if (r.direction === 'entry' && last12.has(r.month)) s.entries12m += r.trips;
    a.stations.set(r.station, s);

    if (r.suppressed) a.suppressed++;
    acc.set(code, a);
  }

  const out = new Map<string, StationPatronageData>();
  for (const [code, a] of Array.from(acc.entries())) {
    const months = Array.from(a.months.entries())
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([month, v]) => ({ month, ...v }));
    out.set(code, {
      months,
      latest12mEntries: months.filter((m) => last12.has(m.month)).reduce((s, m) => s + m.entries, 0),
      latest12mPeriod: period,
      stations: Array.from(a.stations.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((x, y) => y.entries12m - x.entries12m),
      suppressedCells: a.suppressed,
      source: 'tfnsw_station_entries_exits',
    });
  }
  return out;
}
