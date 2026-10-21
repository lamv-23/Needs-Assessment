/**
 * Census journey-to-work flows between LGAs (place of usual residence → place
 * of work), from an ABS TableBuilder export. Used by scripts/parse-jtw-flows.ts
 * to generate src/lib/data/jtw-flows-data.ts.
 *
 * TableBuilder table: rows "LGA (UR)" × columns "LGA (POW)", counting persons
 * (Census 2021, "Employment, Income and Education" dataset). Download as CSV;
 * both the cross-tab layout and the one-row-per-cell layout are accepted.
 */

export interface JTWFlow {
  origin: string;        // LGA of usual residence (label as exported)
  destination: string;   // LGA of place of work (label as exported)
  workers: number;
}

export interface JTWFlowEntry {
  lgaCode: string | null;  // null for places outside NSW
  name: string;
  workers: number;
  share: number;           // % of residentWorkers (destinations) or localJobs (origins)
}

export interface JTWFlowSummary {
  residentWorkers: number;  // employed residents with a stated place of work
  workLocally: number;      // residents who work in their own LGA
  selfContainment: number;  // % of resident workers who work locally
  localJobs: number;        // workers whose place of work is this LGA
  selfSufficiency: number;  // % of local jobs held by residents
  topDestinations: JTWFlowEntry[];
  topOrigins: JTWFlowEntry[];
}

const TOP_N = 8;

// Labels that are not places: totals and not-stated / no-fixed-address categories.
const NON_PLACE = /^total$|not stated|not applicable|no fixed|no usual|migratory|offshore|shipping|undefined|overseas|outside australia/i;

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) { values.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  values.push(cur.trim());
  // TableBuilder rows end with a trailing comma
  while (values.length > 0 && values[values.length - 1] === '') values.pop();
  return values;
}

function parseCount(value: string): number | null {
  const cleaned = value.replace(/,/g, '').trim();
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function parseTableBuilderCsv(text: string): JTWFlow[] {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).map(splitCsvLine);
  const flows: JTWFlow[] = [];
  const push = (origin: string, destination: string, workers: number) => {
    if (workers > 0 && !/^total$/i.test(origin) && !/^total$/i.test(destination)) {
      flows.push({ origin, destination, workers });
    }
  };

  // Long layout: header of three labels, then label,label,count rows.
  const firstData = rows.findIndex(r => r.length === 3 && parseCount(r[2]) !== null && parseCount(r[0]) === null);
  if (firstData > 0 && rows[firstData - 1].length === 3 && parseCount(rows[firstData - 1][2]) === null) {
    for (const r of rows.slice(firstData)) {
      const n = r.length === 3 ? parseCount(r[2]) : null;
      if (n !== null) push(r[0], r[1], n);
    }
    return flows;
  }

  // Cross-tab layout: the header row holds destination labels; data rows are
  // origin label + one count per destination.
  let header: string[] | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const isData = r.length > 2 && parseCount(r[0]) === null && r.slice(1).every(v => parseCount(v) !== null);
    if (!isData) {
      if (r.length > 2 && r.slice(1).every(v => parseCount(v) === null)) header = r;
      continue;
    }
    if (!header) continue;
    for (let c = 1; c < r.length && c < header.length; c++) push(r[0], header[c], parseCount(r[c]) as number);
  }
  return flows;
}

function normaliseLgaName(label: string): string {
  return label
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')                     // (NSW), (C), (A), (The)
    .replace(/^\s*(the|city of)\s+/, ' ')
    .replace(/\s+(shire|city|council|regional|municipal)\b/g, ' ')
    .replace(/[^a-z]/g, '');
}

/** label → ABS LGA code, using area names and any 5-digit code in the label. */
export function createLgaResolver(
  areas: { id: string; name: string }[],
  codeMap: Record<string, string>,
): (label: string) => string | null {
  const validCodes = new Set(Object.values(codeMap));
  const byName = new Map<string, string>();
  for (const area of areas) {
    const code = codeMap[area.id];
    if (code) byName.set(normaliseLgaName(area.name), code);
  }
  return (label: string) => {
    const codeInLabel = label.match(/\b(1\d{4})\b/)?.[1];
    if (codeInLabel && validCodes.has(codeInLabel)) return codeInLabel;
    return byName.get(normaliseLgaName(label)) ?? null;
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function summariseFlows(
  flows: JTWFlow[],
  resolve: (label: string) => string | null,
  displayName: (lgaCode: string) => string | undefined = () => undefined,
): { byLgaCode: Record<string, JTWFlowSummary>; unmatched: string[] } {
  type Acc = { out: Map<string, JTWFlowEntry>; in: Map<string, JTWFlowEntry>; residentWorkers: number; local: number; localJobs: number };
  const acc = new Map<string, Acc>();
  const get = (code: string) => {
    let a = acc.get(code);
    if (!a) { a = { out: new Map(), in: new Map(), residentWorkers: 0, local: 0, localJobs: 0 }; acc.set(code, a); }
    return a;
  };
  const add = (map: Map<string, JTWFlowEntry>, key: string, lgaCode: string | null, label: string, workers: number) => {
    const name = (lgaCode && displayName(lgaCode)) || label;
    const entry = map.get(key) ?? { lgaCode, name, workers: 0, share: 0 };
    entry.workers += workers;
    map.set(key, entry);
  };
  const unmatched = new Set<string>();

  for (const { origin, destination, workers } of flows) {
    if (NON_PLACE.test(origin) || NON_PLACE.test(destination)) continue;
    const o = resolve(origin);
    const d = resolve(destination);
    if (!o) unmatched.add(origin);
    if (o) {
      const a = get(o);
      a.residentWorkers += workers;
      if (o === d) a.local += workers;
      else add(a.out, d ?? `name:${destination}`, d, destination, workers);
    }
    if (d) {
      const a = get(d);
      a.localJobs += workers;
      if (o !== d) add(a.in, o ?? `name:${origin}`, o, origin, workers);
    }
  }

  const top = (map: Map<string, JTWFlowEntry>, total: number) =>
    Array.from(map.values())
      .sort((x, y) => y.workers - x.workers)
      .slice(0, TOP_N)
      .map(e => ({ ...e, share: total > 0 ? round1((e.workers / total) * 100) : 0 }));

  const byLgaCode: Record<string, JTWFlowSummary> = {};
  for (const [code, a] of acc) {
    byLgaCode[code] = {
      residentWorkers: a.residentWorkers,
      workLocally: a.local,
      selfContainment: a.residentWorkers > 0 ? round1((a.local / a.residentWorkers) * 100) : 0,
      localJobs: a.localJobs,
      selfSufficiency: a.localJobs > 0 ? round1((a.local / a.localJobs) * 100) : 0,
      topDestinations: top(a.out, a.residentWorkers),
      topOrigins: top(a.in, a.localJobs),
    };
  }
  return { byLgaCode, unmatched: Array.from(unmatched).sort() };
}
