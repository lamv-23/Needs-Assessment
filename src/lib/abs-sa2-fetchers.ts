/**
 * ABS Census 2021 indicators for NSW SA2s (build time; cached in data/build.db).
 *
 * The SA2 tables are the same Census tables as the LGA ones, so each SA2 is
 * decoded by the LGA decoders in abs-fetchers.ts with the getter bound to one
 * region of the response.
 *
 * Dataflows (structure and codelists checked against
 * /rest/dataflow/ABS/<ID>?references=all&detail=referencepartial, 2026-10-23):
 *   G01         C21_G01_SA2          SEXP . PCHAR . REGION . REGION_TYPE . STATE
 *   G02         C21_G02_SA2          MEDAVG . REGION . REGION_TYPE . STATE
 *   G13         C21_G13_SA2          SEXP . LANP . ENGLP . REGION . REGION_TYPE . STATE
 *   G18         C21_G18_SA2          SEXP . AGEP . ASSNP . REGION . REGION_TYPE . STATE
 *   G33_INCOME  C21_G33_SA2          HIND . HHCD . REGION . REGION_TYPE . STATE
 *   G34         C21_G34_SA2          VEHD . SUM . REGION . REGION_TYPE . STATE
 *   LABOUR      C21_G46_SA2          SEXP . LFSP . AGEP . REGION . REGION_TYPE . STATE
 *   G62         C21_G62_SA2          MTWP . SEXP . REGION . REGION_TYPE . STATE
 *   SEIFA       ABS_SEIFA2021_SA2    ASGS_2021 . SEIFAINDEXTYPE . SEIFA_MEASURE
 *
 * Region dimension: `REGION` in the C21 flows, `ASGS_2021` in SEIFA. Both use
 * codelist CL_ASGS_2021 (2,985 codes across the ASGS levels; an SA2 is its 9-digit
 * ASGS 2021 code, the same codes as SA2_AREAS). The C21 flows also carry REGION_TYPE
 * (SA2) and STATE (1 = NSW). Every other dimension and its codes are identical to the
 * matching C21_*_LGA flow (compared code by code; SEIFA differs only in LGA_2021 vs
 * ASGS_2021), so the LGA decoders read the SA2 cells unchanged. G13 reads its own
 * flow's LANP codelist for the language names.
 *
 * Download size (XML as decoded, all of Australia, `?startPeriod=2021`): G01 112 MB,
 * G62 110 MB, G18 165 MB, LABOUR (C21_G46) 411 MB, G13 952 MB. Whole-dataset downloads
 * like the LGA fetchers do are over the 150 MB budget for G13, G18 and LABOUR, so every
 * table is fetched in batches instead: `+`-joined SA2 codes in the region slot of the
 * SDMX key, at most 100 SA2s per request (7 requests per table for 644 SA2s, 63 in
 * all, about 2 minutes). The key also pins the dimensions the decoders fix anyway
 * (persons, all ages, dwellings, all households, SCORE), so a batch is at most
 * 3.8 MB (G01 3.8, G13 3.6, G62 1.2, the rest under 1). Nothing a decoder reads
 * is excluded, so pinning changes only how much is downloaded.
 *
 * An SA2 with no data in a table is absent from the result rather than zero-filled:
 * the API returns no cells for the no-usual-address SA2 (199999499) in G33 and G34,
 * and the decoders return null for all-zero totals (the migratory/offshore/shipping
 * SA2 197979799 has all-zero dwelling cells).
 */

import {
  ABS_BASE, fetchWithRetry, fetchCodelist, parseSdmxXml, lookupValue,
  decodeG01, decodeG02, decodeG13, decodeG18, decodeG33Income, decodeG34,
  decodeLabour, decodeJourneyToWork, decodeSeifa, MTWP_CODES_2021,
  type CodelistEntry,
} from './abs-fetchers';

export const SA2_DATASETS = ['G01', 'G02', 'G13', 'G18', 'G33_INCOME', 'G34', 'LABOUR', 'G62', 'SEIFA'] as const;
export type Sa2Dataset = typeof SA2_DATASETS[number];

/** Most SA2 codes in one request key. */
export const SA2_BATCH_SIZE = 100;
/** Pause between requests to the ABS API, in ms. */
const REQUEST_PAUSE_MS = 250;

interface Sa2DatasetSpec {
  dataflow: string;
  /** Dimension ids in DSD order; an SDMX key has one dot-separated slot per dimension. */
  dimensions: readonly string[];
  regionDim: 'REGION' | 'ASGS_2021';
  /** Codes the decoder reads for a dimension; other dimensions are left open. */
  pin: Readonly<Record<string, readonly string[]>>;
}

const C21_GEO = ['REGION', 'REGION_TYPE', 'STATE'] as const;

const SA2_SPECS: Record<Sa2Dataset, Sa2DatasetSpec> = {
  G01: { dataflow: 'C21_G01_SA2', dimensions: ['SEXP', 'PCHAR', ...C21_GEO], regionDim: 'REGION', pin: {} },
  G02: { dataflow: 'C21_G02_SA2', dimensions: ['MEDAVG', ...C21_GEO], regionDim: 'REGION', pin: {} },
  // ENGLP: _T total, 3 = uses another language and speaks English not well / not at all
  G13: {
    dataflow: 'C21_G13_SA2', dimensions: ['SEXP', 'LANP', 'ENGLP', ...C21_GEO], regionDim: 'REGION',
    pin: { SEXP: ['3'], ENGLP: ['_T', '3'] },
  },
  G18: {
    dataflow: 'C21_G18_SA2', dimensions: ['SEXP', 'AGEP', 'ASSNP', ...C21_GEO], regionDim: 'REGION',
    pin: { SEXP: ['3'], AGEP: ['_T'] },
  },
  G33_INCOME: {
    dataflow: 'C21_G33_SA2', dimensions: ['HIND', 'HHCD', ...C21_GEO], regionDim: 'REGION',
    pin: { HHCD: ['_T'] },
  },
  G34: { dataflow: 'C21_G34_SA2', dimensions: ['VEHD', 'SUM', ...C21_GEO], regionDim: 'REGION', pin: { SUM: ['D'] } },
  LABOUR: {
    dataflow: 'C21_G46_SA2', dimensions: ['SEXP', 'LFSP', 'AGEP', ...C21_GEO], regionDim: 'REGION',
    pin: { SEXP: ['3'], AGEP: ['_T'] },
  },
  G62: { dataflow: 'C21_G62_SA2', dimensions: ['MTWP', 'SEXP', ...C21_GEO], regionDim: 'REGION', pin: { SEXP: ['3'] } },
  SEIFA: {
    dataflow: 'ABS_SEIFA2021_SA2', dimensions: ['ASGS_2021', 'SEIFAINDEXTYPE', 'SEIFA_MEASURE'], regionDim: 'ASGS_2021',
    pin: { SEIFA_MEASURE: ['SCORE'] },
  },
};

/** SDMX data key selecting `sa2Codes` (and the pinned dimensions) of one SA2 dataflow. */
export function buildSa2Key(dataset: Sa2Dataset, sa2Codes: string[]): string {
  const spec = SA2_SPECS[dataset];
  return spec.dimensions
    .map((dim) => (dim === spec.regionDim ? sa2Codes.join('+') : (spec.pin[dim] ?? []).join('+')))
    .join('.');
}

export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

/**
 * Split a parsed SDMX response into one map per region, so each per-SA2 lookup
 * scans that SA2's cells instead of the whole response.
 */
export function groupByRegion(data: Map<string, number>, regionDim: string): Map<string, Map<string, number>> {
  const regionOf = new RegExp(`(?:^|,)${regionDim}=([^,]*)`);
  const byRegion = new Map<string, Map<string, number>>();
  data.forEach((value, key) => {
    const region = regionOf.exec(key)?.[1];
    if (region === undefined) return;
    let cells = byRegion.get(region);
    if (!cells) byRegion.set(region, (cells = new Map()));
    cells.set(key, value);
  });
  return byRegion;
}

/**
 * Decode one SA2's cells (`region`, from groupByRegion) with the LGA decoder for
 * `dataset`. Returns null when the SA2 has no data in the table. G13 needs the
 * LANP codelist for its language names.
 */
export function decodeSa2Dataset(
  dataset: Sa2Dataset,
  region: Map<string, number>,
  sa2: string,
  codelist?: CodelistEntry[],
): unknown {
  const cell = (dims: Record<string, string>) => lookupValue(region, { ...dims, REGION: sa2 }, '2021');

  switch (dataset) {
    case 'G01':
      return decodeG01((pchar, sexp) => cell({ SEXP: sexp, PCHAR: pchar }));
    case 'G02':
      return decodeG02((medavg) => cell({ MEDAVG: medavg }));
    case 'G13':
      if (!codelist) throw new Error('G13 needs the LANP codelist');
      return decodeG13((lanp, englp) => cell({ LANP: lanp, ENGLP: englp, SEXP: '3' }), codelist);
    case 'G18':
      return decodeG18((assnp) => cell({ ASSNP: assnp, SEXP: '3', AGEP: '_T' }));
    case 'G33_INCOME':
      return decodeG33Income((hind) => cell({ HIND: hind, HHCD: '_T' }));
    case 'G34':
      return decodeG34((vehd) => cell({ VEHD: vehd, SUM: 'D' }));
    case 'LABOUR':
      return decodeLabour((lfsp) => cell({ LFSP: lfsp, SEXP: '3', AGEP: '_T' }));
    case 'G62':
      return decodeJourneyToWork((mtwp) => cell({ MTWP: mtwp, SEXP: '3' }) ?? 0, MTWP_CODES_2021);
    case 'SEIFA':
      return decodeSeifa((index) =>
        lookupValue(region, { SEIFAINDEXTYPE: index, SEIFA_MEASURE: 'SCORE', ASGS_2021: sa2 }, '2021'));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch one Census table for `sa2Codes` (sequential batches of SA2_BATCH_SIZE) and
 * decode each SA2. The result has an entry only for SA2s with data in the table.
 * Throws if a batch cannot be fetched, so a failed download is never mistaken for
 * an SA2 without data (fetchWithRetry returns null for a 404 or exhausted retries,
 * and every batch here contains SA2s the table covers).
 */
export async function fetchSa2Dataset(dataset: Sa2Dataset, sa2Codes: string[]): Promise<Map<string, unknown>> {
  const spec = SA2_SPECS[dataset];
  const codelist = dataset === 'G13' ? await fetchCodelist(spec.dataflow, 'CL_C21_LANP') : undefined;

  const result = new Map<string, unknown>();
  const batches = chunk(sa2Codes, SA2_BATCH_SIZE);
  for (let i = 0; i < batches.length; i++) {
    if (i > 0) await sleep(REQUEST_PAUSE_MS);

    const url = `${ABS_BASE}/${spec.dataflow}/${buildSa2Key(dataset, batches[i])}`
      + '?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions';
    const xml = await fetchWithRetry(url);
    if (xml === null) {
      throw new Error(`ABS ${spec.dataflow}: batch ${i + 1}/${batches.length} failed to download (${url})`);
    }

    const byRegion = groupByRegion(parseSdmxXml(xml), spec.regionDim);
    for (const sa2 of batches[i]) {
      const cells = byRegion.get(sa2);
      const decoded = cells ? decodeSa2Dataset(dataset, cells, sa2, codelist) : null;
      if (decoded !== null) result.set(sa2, decoded);
    }
  }
  return result;
}
