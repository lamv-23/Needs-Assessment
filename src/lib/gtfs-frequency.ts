/**
 * GTFS service-frequency helpers.
 *
 * Counts scheduled weekday AM-peak (07:00–09:00) departures per stop from a
 * GTFS schedule, then summarises per LGA. Used by scripts/seed-gtfs.ts to
 * store the 'GTFS_FREQUENCY' dataset in tfnsw_cache.
 *
 * A stop is "frequent" when it has at least FREQUENT_DEPARTURES_THRESHOLD
 * departures in the 2-hour window, i.e. a combined service every 15 minutes
 * or better across all routes serving it.
 */

export const AM_PEAK_START_SECONDS = 7 * 3600;
export const AM_PEAK_END_SECONDS = 9 * 3600; // exclusive
export const FREQUENT_DEPARTURES_THRESHOLD = 8; // 4 per hour over 2 hours

export type FrequencyMode = 'train' | 'metro' | 'lightRail' | 'ferry' | 'bus';

export interface GTFSFrequencyData {
  serviceDate: string;        // YYYYMMDD representative weekday (Tuesday)
  totalStops: number;
  servicedStops: number;      // ≥1 departure in AM peak
  frequentStops: number;      // ≥ FREQUENT_DEPARTURES_THRESHOLD departures in AM peak
  frequentStopShare: number;  // % of totalStops, 1 dp
  amPeakDepartures: number;   // sum of stop departures 07:00–09:00
  frequentStopsByMode: Record<FrequencyMode, number>;
  /** Frequent-stop share (%) pooled across all stops in Greater Sydney / NSW, same service date. */
  benchmarks?: { greaterSydneyFrequentStopShare: number; nswFrequentStopShare: number };
  source: 'tfnsw_gtfs';
}

type CalendarRow = Record<string, string>;
type CalendarDateRow = Record<string, string>;

const WEEKDAY_COLUMNS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TUESDAY = 2;

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function fromYmd(ymd: string): Date {
  return new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
}

/** Service IDs operating on `date` (YYYYMMDD), per calendar.txt + calendar_dates.txt. */
export function activeServiceIds(
  calendar: CalendarRow[],
  calendarDates: CalendarDateRow[],
  date: string,
): Set<string> {
  const dayColumn = WEEKDAY_COLUMNS[fromYmd(date).getUTCDay()];
  const active = new Set<string>();
  for (const row of calendar) {
    if (row[dayColumn] === '1' && row.start_date <= date && date <= row.end_date) {
      active.add(row.service_id);
    }
  }
  for (const row of calendarDates) {
    if (row.date !== date) continue;
    if (row.exception_type === '1') active.add(row.service_id);
    else if (row.exception_type === '2') active.delete(row.service_id);
  }
  return active;
}

/**
 * Representative weekday for the feed: the first Tuesday on or after
 * `reference` (or the feed's first service date, if later) with any service.
 */
export function pickServiceDate(
  calendar: CalendarRow[],
  calendarDates: CalendarDateRow[],
  reference: Date = new Date(),
): string | null {
  const starts = [
    ...calendar.map(r => r.start_date),
    ...calendarDates.filter(r => r.exception_type === '1').map(r => r.date),
  ].filter(Boolean).sort();
  const refYmd = toYmd(reference);
  const from = starts.length > 0 && starts[0] > refYmd ? starts[0] : refYmd;

  const cursor = fromYmd(from);
  for (let i = 0; i < 180; i++) {
    if (cursor.getUTCDay() === TUESDAY) {
      const ymd = toYmd(cursor);
      if (activeServiceIds(calendar, calendarDates, ymd).size > 0) return ymd;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return null;
}

function parseGtfsTime(value: string): number {
  const [h, m, s] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 3600 + m * 60 + (s || 0);
}

function splitCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const values: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) { values.push(cur); cur = ''; }
    else cur += ch;
  }
  values.push(cur);
  return values;
}

/**
 * Line-at-a-time AM-peak departure counter for stop_times.txt, so very large
 * feeds can be streamed. Feed it the header line first, then each data line.
 * Trips missing from `tripService` (e.g. filtered-out school buses) are ignored.
 */
export function createPeakDepartureCounter(
  tripService: Map<string, string>,
  activeServices: Set<string>,
): { addLine: (line: string) => void; counts: Map<string, number> } {
  const counts = new Map<string, number>();
  let tripIdx = -1;
  let stopIdx = -1;
  let depIdx = -1;
  let headerSeen = false;

  const addLine = (rawLine: string) => {
    const line = rawLine.replace(/\r$/, '');
    if (!headerSeen) {
      const headers = splitCsvLine(line.replace(/^﻿/, '')).map(h => h.trim());
      tripIdx = headers.indexOf('trip_id');
      stopIdx = headers.indexOf('stop_id');
      depIdx = headers.indexOf('departure_time');
      headerSeen = true;
      return;
    }
    if (!line || tripIdx < 0 || stopIdx < 0 || depIdx < 0) return;
    const cols = splitCsvLine(line);
    const serviceId = tripService.get(cols[tripIdx]?.trim());
    if (!serviceId || !activeServices.has(serviceId)) return;
    const t = parseGtfsTime(cols[depIdx]?.trim() ?? '');
    if (!(t >= AM_PEAK_START_SECONDS && t < AM_PEAK_END_SECONDS)) return;
    const stopId = cols[stopIdx]?.trim();
    if (!stopId) return;
    counts.set(stopId, (counts.get(stopId) ?? 0) + 1);
  };

  return { addLine, counts };
}

/**
 * stop_id → number of departures in the AM-peak window, counting only trips
 * whose service runs on the chosen date.
 */
export function countPeakDepartures(
  stopTimesText: string,
  tripService: Map<string, string>,
  activeServices: Set<string>,
): Map<string, number> {
  const counter = createPeakDepartureCounter(tripService, activeServices);
  for (const line of stopTimesText.split('\n')) counter.addLine(line);
  return counter.counts;
}

/**
 * Greater Sydney and NSW benchmark summaries, pooling every stop in the
 * member LGAs (so large LGAs weigh more, as for the whole network).
 */
export function frequencyBenchmarks(
  lgaStops: Map<string, { stopId: string; mode: string }[]>,
  departures: Map<string, number>,
  serviceDate: string,
  isGreaterSydney: (lgaCode: string) => boolean,
): { greaterSydney: GTFSFrequencyData; nsw: GTFSFrequencyData } {
  const greaterSydneyStops: { stopId: string; mode: string }[] = [];
  const nswStops: { stopId: string; mode: string }[] = [];
  for (const [lgaCode, stops] of lgaStops) {
    nswStops.push(...stops);
    if (isGreaterSydney(lgaCode)) greaterSydneyStops.push(...stops);
  }
  return {
    greaterSydney: summariseFrequency(greaterSydneyStops, departures, serviceDate),
    nsw: summariseFrequency(nswStops, departures, serviceDate),
  };
}

/** Summarise AM-peak service for one LGA's stops. */
export function summariseFrequency(
  stops: { stopId: string; mode: string }[],
  departures: Map<string, number>,
  serviceDate: string,
): GTFSFrequencyData {
  const frequentStopsByMode: Record<FrequencyMode, number> = { train: 0, metro: 0, lightRail: 0, ferry: 0, bus: 0 };
  let servicedStops = 0;
  let frequentStops = 0;
  let amPeakDepartures = 0;

  for (const { stopId, mode } of stops) {
    const n = departures.get(stopId) ?? 0;
    if (n === 0) continue;
    servicedStops++;
    amPeakDepartures += n;
    if (n >= FREQUENT_DEPARTURES_THRESHOLD) {
      frequentStops++;
      if (mode in frequentStopsByMode) frequentStopsByMode[mode as FrequencyMode]++;
    }
  }

  return {
    serviceDate,
    totalStops: stops.length,
    servicedStops,
    frequentStops,
    frequentStopShare: stops.length > 0 ? Math.round((frequentStops / stops.length) * 1000) / 10 : 0,
    amPeakDepartures,
    frequentStopsByMode,
    source: 'tfnsw_gtfs',
  };
}
