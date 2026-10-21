/**
 * TfNSW Household Travel Survey (HTS) — LGA workbook parsing.
 *
 * Turns the long-format "Data by Mode" / "Data by Purpose" / "Demographics"
 * sheet rows into per-LGA, per-financial-year summaries. Used by
 * scripts/parse-hts.ts to generate src/lib/data/hts-lga-data.ts.
 *
 * Reliability flags in the source labels:
 *   *  relative standard error 25–50% (use with caution)
 *   ** relative standard error >50% (too unreliable for general use)
 *   ^  on the LGA name: the LGA total has RSE ≥25%
 */

import { htsLgaIdToAbsCode, parseHtsReliability, type HtsReliability } from './tfnsw-official';

export type HTSReliability = HtsReliability;
export type HTSModeKey = 'vehicleDriver' | 'vehiclePassenger' | 'publicTransport' | 'walkOnly' | 'walkLinked' | 'other';

export interface HTSModeEntry {
  mode: HTSModeKey;
  label: string;
  trips: number;              // unlinked trips, average weekday
  modeShare: number;          // % of trips excluding walk-linked
  avgDistanceKm: number | null;
  avgTimeMin: number | null;
  reliability: HTSReliability;
}

export interface HTSPurposeEntry {
  purpose: string;
  journeys: number;           // linked trips, average weekday
  share: number;              // % of journeys
  avgDistanceKm: number | null;
  avgTimeMin: number | null;
  reliability: HTSReliability;
}

export interface HTSYearData {
  financialYear: string;      // e.g. '2024/25' (rolling 3-year pooled estimate)
  lgaTotalReliable: boolean;
  modes: HTSModeEntry[];
  purposes: HTSPurposeEntry[];
  totalJourneys: number;      // sum of linked journeys across purposes
  population: number | null;  // survey population (2016/17–2019/20 only)
}

export interface HTSLgaData {
  lgaName: string;
  years: HTSYearData[];       // ascending by financial year
}

export interface HTSRawRows {
  mode: Record<string, unknown>[];
  purpose: Record<string, unknown>[];
  demographics: Record<string, unknown>[];
}

const MODE_LABELS: Record<HTSModeKey, string> = {
  vehicleDriver: 'Vehicle driver',
  vehiclePassenger: 'Vehicle passenger',
  publicTransport: 'Public transport',
  walkOnly: 'Walk only',
  walkLinked: 'Walk linked',
  other: 'Other',
};

const MODE_BY_SOURCE_LABEL: Record<string, HTSModeKey> = {
  'vehicle driver': 'vehicleDriver',
  'vehicle passenger': 'vehiclePassenger',
  'public transport': 'publicTransport',
  bus: 'publicTransport',     // 2016/17–2019/20 splits PT into Bus and Train
  train: 'publicTransport',
  'walk only': 'walkOnly',
  'walk linked': 'walkLinked',
  other: 'other',
};

const PURPOSE_BY_SOURCE_LABEL: Record<string, string> = {
  commute: 'Commute',
  'work related business': 'Work related business',
  'education/childcare': 'Education/childcare',
  shopping: 'Shopping',
  'social/recreation': 'Social/recreation',
  'social visits/recreation': 'Social/recreation',
  'personal business': 'Personal business',
  'serve passenger': 'Serve passenger',
  other: 'Other',
};

const RELIABILITY_RANK: Record<HTSReliability, number> = { reliable: 0, use_with_caution: 1, unreliable: 2 };

function parseLabel(value: unknown): { label: string; reliability: HTSReliability } {
  const text = String(value ?? '').trim();
  return { label: text.replace(/\*+$/, '').trim().toLowerCase(), reliability: parseHtsReliability(text) };
}

function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function weightedAverage(pairs: { value: number | null; weight: number }[]): number | null {
  const valid = pairs.filter(p => p.value !== null && p.weight > 0);
  const totalWeight = valid.reduce((s, p) => s + p.weight, 0);
  if (totalWeight === 0) return null;
  return round1(valid.reduce((s, p) => s + (p.value as number) * p.weight, 0) / totalWeight);
}

export function parseHtsWorkbookRows(
  raw: HTSRawRows,
  knownLgaCodes: Set<string>,
): { byLgaCode: Record<string, HTSLgaData>; unmatched: string[] } {
  const byLgaCode: Record<string, HTSLgaData> = {};
  const yearData = new Map<string, HTSYearData>(); // `${code}|${fy}`
  const modeParts = new Map<string, { trips: number; share: number; dist: number | null; time: number | null; rel: HTSReliability }[]>();
  const unmatched = new Set<string>();

  const resolve = (row: Record<string, unknown>): { code: string; fy: string; year: HTSYearData } | null => {
    const id = num(row.hh_lga_id);
    const fy = String(row.financial_year ?? '').trim();
    if (id === null || !fy) return null;
    const code = htsLgaIdToAbsCode(id);
    const rawName = String(row.hh_lga_name ?? '').trim();
    if (!knownLgaCodes.has(code)) {
      if (rawName) unmatched.add(`${rawName.replace(/\^/g, '')} (${code})`);
      return null;
    }
    const lga = byLgaCode[code] ??= { lgaName: rawName.replace(/\^/g, '').trim(), years: [] };
    const key = `${code}|${fy}`;
    let year = yearData.get(key);
    if (!year) {
      year = { financialYear: fy, lgaTotalReliable: true, modes: [], purposes: [], totalJourneys: 0, population: null };
      yearData.set(key, year);
      lga.years.push(year);
    }
    if (rawName.includes('^')) year.lgaTotalReliable = false;
    return { code, fy, year };
  };

  for (const row of raw.mode) {
    const target = resolve(row);
    if (!target) continue;
    const { label, reliability } = parseLabel(row.travel_mode);
    const mode = MODE_BY_SOURCE_LABEL[label];
    if (!mode) continue;
    const key = `${target.code}|${target.fy}|${mode}`;
    const parts = modeParts.get(key) ?? [];
    parts.push({
      trips: num(row.trips_by_mode) ?? 0,
      share: num(row.mode_share) ?? 0,
      dist: num(row.trip_avg_distance),
      time: num(row.trip_avg_time),
      rel: reliability,
    });
    modeParts.set(key, parts);
  }

  for (const [key, parts] of modeParts) {
    const [code, fy, mode] = key.split('|') as [string, string, HTSModeKey];
    const year = yearData.get(`${code}|${fy}`)!;
    year.modes.push({
      mode,
      label: MODE_LABELS[mode],
      trips: parts.reduce((s, p) => s + p.trips, 0),
      modeShare: round1(parts.reduce((s, p) => s + p.share, 0)),
      avgDistanceKm: weightedAverage(parts.map(p => ({ value: p.dist, weight: p.trips }))),
      avgTimeMin: weightedAverage(parts.map(p => ({ value: p.time, weight: p.trips }))),
      // Combined Bus + Train keeps the weaker of the two flags (conservative).
      reliability: parts.reduce<HTSReliability>((worst, p) => (RELIABILITY_RANK[p.rel] > RELIABILITY_RANK[worst] ? p.rel : worst), 'reliable'),
    });
  }

  for (const row of raw.purpose) {
    const target = resolve(row);
    if (!target) continue;
    const { label, reliability } = parseLabel(row.travel_purpose);
    const purpose = PURPOSE_BY_SOURCE_LABEL[label];
    if (!purpose) continue;
    // The 2021+ workbook misnames this column JOURNEYS_BY_MODE.
    const journeys = num(row.journeys_by_purpose ?? row.journeys_by_mode) ?? 0;
    target.year.purposes.push({
      purpose,
      journeys,
      share: num(row.pct_of_total_journeys) ?? 0,
      avgDistanceKm: num(row.journey_avg_distance),
      avgTimeMin: num(row.journey_avg_time),
      reliability,
    });
    target.year.totalJourneys += journeys;
  }

  for (const row of raw.demographics) {
    const id = num(row.hh_lga_id);
    const fy = String(row.financial_year ?? '').trim();
    const year = id === null ? undefined : yearData.get(`${htsLgaIdToAbsCode(id)}|${fy}`);
    if (year) year.population = num(row.population);
  }

  const modeOrder = Object.keys(MODE_LABELS);
  for (const lga of Object.values(byLgaCode)) {
    lga.years.sort((a, b) => a.financialYear.localeCompare(b.financialYear));
    for (const y of lga.years) {
      y.modes.sort((a, b) => modeOrder.indexOf(a.mode) - modeOrder.indexOf(b.mode));
      y.purposes.sort((a, b) => b.share - a.share);
    }
  }

  return { byLgaCode, unmatched: Array.from(unmatched).sort() };
}

/**
 * Linked journeys per resident on an average weekday. Uses the survey's own
 * population where published (to 2019/20), otherwise ABS ERP at the end of the
 * financial year (e.g. June 2025 for 2024/25), falling back to the latest
 * earlier ERP year.
 */
export function tripsPerPerson(
  year: Pick<HTSYearData, 'financialYear' | 'totalJourneys' | 'population'>,
  erpByYear: Record<number, number> | null,
): number | null {
  if (year.totalJourneys <= 0) return null;
  let population = year.population;
  if (!population && erpByYear) {
    const fyEnd = Number(year.financialYear.slice(0, 4)) + 1;
    const candidates = Object.keys(erpByYear).map(Number).filter(y => y <= fyEnd).sort((a, b) => b - a);
    population = candidates.length > 0 ? erpByYear[candidates[0]] : null;
  }
  return population ? Math.round((year.totalJourneys / population) * 100) / 100 : null;
}

export interface HTSModeSharePoint {
  financialYear: string;
  car: number;              // driver + passenger
  publicTransport: number;
  walk: number;             // walk only
  other: number;
}

export interface HTSTravelSurveySummary {
  latestYear: string;
  lgaTotalReliable: boolean;
  tripsPerPerson: number | null;
  totalJourneys: number;
  modes: HTSModeEntry[];      // latest year; walk-linked omitted (0% share by definition)
  purposes: HTSPurposeEntry[];
  modeShareTrend: HTSModeSharePoint[];
}

/** Latest-year snapshot plus mode-share trend for one LGA. */
export function summariseTravelSurvey(
  lga: HTSLgaData,
  erpByYear: Record<number, number> | null,
): HTSTravelSurveySummary | null {
  const withModes = lga.years.filter(y => y.modes.length > 0);
  const latest = withModes[withModes.length - 1];
  if (!latest) return null;
  const share = (y: HTSYearData, ...modes: HTSModeKey[]) =>
    round1(y.modes.filter(m => modes.includes(m.mode)).reduce((s, m) => s + m.modeShare, 0));
  return {
    latestYear: latest.financialYear,
    lgaTotalReliable: latest.lgaTotalReliable,
    tripsPerPerson: tripsPerPerson(latest, erpByYear),
    totalJourneys: latest.totalJourneys,
    modes: latest.modes.filter(m => m.mode !== 'walkLinked'),
    purposes: latest.purposes,
    modeShareTrend: withModes.map(y => ({
      financialYear: y.financialYear,
      car: share(y, 'vehicleDriver', 'vehiclePassenger'),
      publicTransport: share(y, 'publicTransport'),
      walk: share(y, 'walkOnly'),
      other: share(y, 'other'),
    })),
  };
}
