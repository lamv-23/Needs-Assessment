/**
 * ABS API fetchers using SDMX-ML (XML) format.
 * 
 * Key facts:
 * - Base URL: https://data.api.abs.gov.au/rest/data/
 * - Format: SDMX-ML XML (requires Accept: application/xml)
 * - Requires User-Agent: Mozilla/5.0 (CloudFront blocks bot UAs)
 * - No API key required
 * - LGA codes are 5-digit ABS 2021 LGA codes
 * 
 * Dataset → table mapping (confirmed from live API probing):
 *   G01  → C21_G01_LGA  : SEXP × PCHAR (age, sex, birthplace, language)
 *   G02  → C21_G02_LGA  : MEDAVG (1=age, 2=hh_income, 3=mortgage, 6=rent, 8=avg_hhd_size)
 *   G33  → C21_G36_LGA  : DWTSTRD × SUM (11=sep house, 2=semi, 3=flat, 9=other)
 *   G36  → C21_G37_LGA  : TENLLD × STRD (1=owned, 2=mortgage, 3=rented, 9=other)
 *   G51  → C21_G53_LGA  : SEXP × INDP × QALLP (A-S ANZSIC division codes)
 *   G55  → null         : No ABS SDMX endpoint for Census journey-to-work at LGA
 *   G46  → C21_G16_LGA  : SEXP × HSCP × AGEP (1=Yr12, 2=Yr11, 3=Yr10, 4=Yr9, 5=Yr8-, 6=none)
 *   G15  → C21_G15_LGA  : TYSTAP × SEXP (education institution attending by type)
 *   G49  → C21_G49_LGA  : SEXP × QALLP × AGEP (1=postgrad, 2=grad_dip, 3=bach, 51=adv_dip, 4=cert3/4)
 *   G49_2016 → ABS_C16_G49_LGA : OCCP_C16 × SEX_ABS × QALLP_C16 (historical qualifications)
 *   SEIFA→ ABS_SEIFA2021_LGA: LGA_2021 × SEIFAINDEXTYPE × SEIFA_MEASURE=SCORE
 *   LABOUR→ C21_G46_LGA : SEXP × LFSP × AGEP (1=FT emp, 2=PT emp, 3=away, 4=unemp, 5+=NILF)
 *   ERP  → ABS_ANNUAL_ERP_LGA2025: LGA_2025 × SEX_ABS × AGE=TOT (2001–2025)
 */

const ABS_BASE = 'https://data.api.abs.gov.au/rest/data';
const DEFAULT_HEADERS = {
  Accept: 'application/xml',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// ─── LGA Code Map ─────────────────────────────────────────────────────────────
// Maps internal area IDs to 5-digit ABS LGA codes (2021 ASGS)

export const LGA_CODE_MAP: Record<string, string> = {
  // ── Greater Sydney ───────────────────────────────────────────────────────────
  lga_sydney:                  '17200', // City of Sydney
  lga_parramatta:              '16260', // City of Parramatta
  lga_blacktown:               '10750', // Blacktown
  lga_penrith:                 '16350', // Penrith
  lga_camden:                  '11450', // Camden
  lga_campbelltown:            '11500', // Campbelltown (NSW)
  lga_liverpool:               '14900', // Liverpool
  lga_fairfield:               '12850', // Fairfield
  lga_bankstown:               '11570', // Canterbury-Bankstown (legacy alias)
  lga_canterbury_bankstown:    '11570', // Canterbury-Bankstown
  lga_sutherland:              '17150', // Sutherland Shire
  lga_hornsby:                 '14000', // Hornsby
  lga_ku_ring_gai:             '14500', // Ku-ring-gai
  lga_northern_beaches:        '15990', // Northern Beaches
  lga_manly:                   '15990', // Northern Beaches (Manly amalgamated)
  lga_willoughby:              '18250', // Willoughby
  lga_lane_cove:               '14700', // Lane Cove
  lga_mosman:                  '15350', // Mosman
  lga_north_sydney:            '15950', // North Sydney
  lga_ryde:                    '16700', // City of Ryde
  lga_hunters_hill:            '14100', // Hunters Hill
  lga_strathfield:             '17100', // Strathfield
  lga_burwood:                 '11300', // Burwood
  lga_canada_bay:              '11520', // Canada Bay
  lga_inner_west:              '14170', // Inner West
  lga_bayside:                 '10500', // Bayside (NSW)
  lga_georges_river:           '12930', // Georges River
  lga_hurstville:              '12930', // Georges River (Hurstville amalgamated)
  lga_kogarah:                 '12930', // Georges River (Kogarah amalgamated)
  lga_rockdale:                '10500', // Bayside (Rockdale amalgamated)
  lga_botany_bay:              '10500', // Bayside (Botany Bay amalgamated)
  lga_randwick:                '16550', // Randwick
  lga_waverley:                '18050', // Waverley
  lga_woollahra:               '18500', // Woollahra
  lga_blue_mountains:          '10900', // Blue Mountains
  lga_wollondilly:             '18400', // Wollondilly
  lga_hawkesbury:              '13800', // Hawkesbury
  lga_hills:                   '17420', // The Hills Shire
  lga_cumberland:              '12380', // Cumberland

  // ── Hunter ───────────────────────────────────────────────────────────────────
  lga_newcastle:               '15900', // Newcastle
  lga_lake_macquarie:          '14650', // Lake Macquarie
  lga_cessnock:                '11720', // Cessnock
  lga_maitland:                '15050', // Maitland
  lga_port_stephens:           '16400', // Port Stephens
  lga_singleton:               '17000', // Singleton
  lga_muswellbrook:            '15650', // Muswellbrook
  lga_upper_hunter:            '17620', // Upper Hunter Shire
  lga_dungog:                  '12700', // Dungog
  lga_maitland_surrounds:      '15050', // Maitland (same code)

  // ── Central Coast ────────────────────────────────────────────────────────────
  lga_central_coast:           '11650', // Central Coast (NSW)

  // ── Illawarra-Shoalhaven ─────────────────────────────────────────────────────
  lga_wollongong:              '18450', // Wollongong
  lga_shellharbour:            '16900', // Shellharbour
  lga_kiama:                   '14400', // Kiama
  lga_shoalhaven:              '16950', // Shoalhaven
  lga_wingecarribee:           '18350', // Wingecarribee

  // ── South East & Tablelands ──────────────────────────────────────────────────
  lga_queanbeyan_palerang:     '16490', // Queanbeyan-Palerang Regional
  lga_snowy_monaro:            '17040', // Snowy Monaro Regional
  lga_eurobodalla:             '12750', // Eurobodalla
  lga_bega_valley:             '10550', // Bega Valley
  lga_goulburn_mulwaree:       '13310', // Goulburn Mulwaree
  lga_hilltops:                '13910', // Hilltops
  lga_yass_valley:             '18710', // Yass Valley
  lga_upper_lachlan:           '17640', // Upper Lachlan Shire

  // ── New England & North West ──────────────────────────────────────────────────
  lga_tamworth:                '17310', // Tamworth Regional
  lga_armidale:                '10180', // Armidale Regional
  lga_uralla:                  '17650', // Uralla
  lga_walcha:                  '17850', // Walcha
  lga_gunnedah:                '13550', // Gunnedah
  lga_narrabri:                '15750', // Narrabri
  lga_moree_plains:            '15300', // Moree Plains
  lga_inverell:                '14220', // Inverell
  lga_glen_innes_severn:       '13010', // Glen Innes Severn
  lga_tenterfield:             '17400', // Tenterfield
  lga_liverpool_plains:        '14920', // Liverpool Plains
  lga_gwydir:                  '13660', // Gwydir

  // ── North Coast ───────────────────────────────────────────────────────────────
  lga_tweed:                   '17550', // Tweed
  lga_byron:                   '11350', // Byron
  lga_ballina:                 '10250', // Ballina
  lga_lismore:                 '14850', // Lismore
  lga_richmond_valley:         '16610', // Richmond Valley
  lga_kyogle:                  '14550', // Kyogle
  lga_coffs_harbour:           '11800', // Coffs Harbour
  lga_bellingen:               '10600', // Bellingen
  lga_nambucca_valley:         '15700', // Nambucca Valley
  lga_kempsey:                 '14350', // Kempsey
  lga_port_macquarie_hastings: '16380', // Port Macquarie-Hastings
  lga_mid_coast:               '15240', // Mid-Coast
  lga_clarence_valley:         '11730', // Clarence Valley

  // ── Central West & Orana ──────────────────────────────────────────────────────
  lga_dubbo:                   '12390', // Dubbo Regional
  lga_orange:                  '16150', // Orange
  lga_bathurst:                '10470', // Bathurst Regional
  lga_lithgow:                 '14870', // Lithgow
  lga_cabonne:                 '11400', // Cabonne
  lga_blayney:                 '10850', // Blayney
  lga_oberon:                  '16100', // Oberon
  lga_mid_western:             '15270', // Mid-Western Regional
  lga_warrumbungle:            '18020', // Warrumbungle Shire
  lga_gilgandra:               '12950', // Gilgandra
  lga_coonamble:               '12150', // Coonamble
  lga_narromine:               '15850', // Narromine
  lga_parkes:                  '16200', // Parkes
  lga_forbes:                  '12900', // Forbes
  lga_lachlan:                 '14600', // Lachlan
  lga_weddin:                  '18100', // Weddin
  lga_cowra:                   '12350', // Cowra
  lga_bland:                   '10800', // Bland
  lga_bogan:                   '10950', // Bogan
  lga_cobar:                   '11750', // Cobar

  // ── Riverina-Murray ───────────────────────────────────────────────────────────
  lga_wagga_wagga:             '17750', // Wagga Wagga
  lga_albury:                  '10050', // Albury
  lga_griffith:                '13450', // Griffith
  lga_leeton:                  '14750', // Leeton
  lga_narrandera:              '15800', // Narrandera
  lga_murrumbidgee:            '15560', // Murrumbidgee
  lga_coolamon:                '12000', // Coolamon
  lga_temora:                  '17350', // Temora
  lga_junee:                   '14300', // Junee
  lga_cootamundra_gundagai:    '12160', // Cootamundra-Gundagai Regional
  lga_snowy_valleys:           '17080', // Snowy Valleys
  lga_federation:              '12870', // Federation
  lga_greater_hume:            '13340', // Greater Hume Shire
  lga_berrigan:                '10650', // Berrigan
  lga_edward_river:            '12730', // Edward River
  lga_murray_river:            '15520', // Murray River
  lga_hay:                     '13850', // Hay
  lga_carrathool:              '11600', // Carrathool
  lga_lockhart:                '14950', // Lockhart

  // ── Far West ─────────────────────────────────────────────────────────────────
  lga_broken_hill:             '11250', // Broken Hill
  lga_wentworth:               '18200', // Wentworth
  lga_balranald:               '10300', // Balranald
  lga_central_darling:         '11700', // Central Darling
  lga_bourke:                  '11150', // Bourke
  lga_brewarrina:              '11200', // Brewarrina
  lga_walgett:                 '17900', // Walgett
  lga_warren:                  '17950', // Warren

  // ── Benchmarks ───────────────────────────────────────────────────────────────
  benchmark_gsy:               '1GSYD', // Greater Sydney benchmark
  benchmark_nsw:               '1NSW',  // NSW state benchmark
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, retries = 3): Promise<string | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: DEFAULT_HEADERS,
        // Next.js: no-store ensures we always get fresh data during seeding
        cache: 'no-store',
      });
      if (res.ok) return await res.text();
      if (res.status === 404) return null; // dataset not available for this LGA
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          await sleep(500 * attempt);
          continue;
        }
      }
      console.warn(`ABS fetch ${url} → HTTP ${res.status}`);
      return null;
    } catch (err) {
      if (attempt < retries) {
        await sleep(500 * attempt);
      } else {
        console.error(`ABS fetch failed after ${retries} attempts: ${url}`, err);
        return null;
      }
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse SDMX-ML Generic XML (dimensionAtObservation=AllDimensions format) into a flat map.
 *
 * The ABS API returns observations in this format:
 *   <generic:Obs>
 *     <generic:ObsKey>
 *       <generic:Value id="TIME_PERIOD" value="2021" />
 *       <generic:Value id="SEXP" value="3" />
 *       <generic:Value id="PCHAR" value="S_1" />
 *       <generic:Value id="REGION" value="17200" />
 *       ...
 *     </generic:ObsKey>
 *     <generic:ObsValue value="241521" />
 *   </generic:Obs>
 *
 * Returns flat map where key = "DIM1=val1,DIM2=val2,..." (excluding TIME_PERIOD which is stored separately as TIME=)
 * Key format: "TIME_PERIOD=2021,SEXP=3,PCHAR=S_1,REGION=17200" (all dims joined)
 */
function parseSdmxXml(xml: string): Map<string, number> {
  const result = new Map<string, number>();

  // Match each <generic:Obs>...</generic:Obs> block
  // Use a non-greedy match; strip namespace prefix for robustness
  const obsRegex = /<(?:\w+:)?Obs>([\s\S]*?)<\/(?:\w+:)?Obs>/g;
  let obsMatch: RegExpExecArray | null;

  while ((obsMatch = obsRegex.exec(xml)) !== null) {
    const obsBlock = obsMatch[1];

    // Extract all dimension values from ObsKey
    // Handles both <generic:Value id="X" value="Y"/> and <Value id="X" value="Y"/>
    const dims: Record<string, string> = {};
    const dimRegex = /<(?:\w+:)?Value\s+id="([^"]+)"\s+value="([^"]*)"\s*\/>/g;
    let dimMatch: RegExpExecArray | null;
    while ((dimMatch = dimRegex.exec(obsBlock)) !== null) {
      dims[dimMatch[1]] = dimMatch[2];
    }

    // Extract observation value from <generic:ObsValue value="..."/>
    const obsValueMatch = /<(?:\w+:)?ObsValue\s+value="([^"]*)"\s*\/>/.exec(obsBlock);
    if (!obsValueMatch) continue;

    const value = parseFloat(obsValueMatch[1]);
    if (isNaN(value)) continue;

    // Build key from all dimensions (including TIME_PERIOD)
    const key = Object.entries(dims)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');

    result.set(key, value);
  }

  return result;
}

/**
 * Normalise a TIME_PERIOD value: "2021-Q1" → "2021", "2021" → "2021"
 */
function normaliseTime(t: string): string {
  return t.split('-')[0];
}

/**
 * Parse a flat key string "DIM1=val1,DIM2=val2,..." into a Record.
 */
function parseKey(key: string): Record<string, string> {
  const dims: Record<string, string> = {};
  for (const part of key.split(',')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    dims[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
  }
  return dims;
}

/**
 * Look up a value in the parsed SDMX map.
 * Partial match: all provided dims must match.
 * `time` is matched against the TIME_PERIOD dimension (normalised to year).
 */
function lookupValue(
  data: Map<string, number>,
  dims: Record<string, string>,
  time?: string
): number | null {
  for (const [key, value] of Array.from(data.entries())) {
    const keyDims = parseKey(key);

    let match = true;
    for (const [k, v] of Object.entries(dims)) {
      if (keyDims[k] !== v) { match = false; break; }
    }
    if (time && normaliseTime(keyDims['TIME_PERIOD'] ?? '') !== time) match = false;

    if (match) return value;
  }
  return null;
}

/**
 * Sum all values where given dims match.
 */
function sumValues(
  data: Map<string, number>,
  dims: Record<string, string>,
  time?: string
): number {
  let total = 0;
  for (const [key, value] of Array.from(data.entries())) {
    const keyDims = parseKey(key);

    let match = true;
    for (const [k, v] of Object.entries(dims)) {
      if (keyDims[k] !== v) { match = false; break; }
    }
    if (time && normaliseTime(keyDims['TIME_PERIOD'] ?? '') !== time) match = false;

    if (match) total += value;
  }
  return total;
}

// ─── G01: Selected Person Characteristics ────────────────────────────────────

export interface G01Data {
  totalPopulation: number;
  malePopulation: number;
  femalePopulation: number;
  ageGroups: Record<string, number>; // e.g. { "0_4": 1234, "5_9": 1100, ... }
  bornOverseas: number;
  bornAustralia: number;
  speaksEnglishOnly: number;
  indigenousPopulation: number;
}

// Age group PCHAR codes as returned by the ABS API (C21_G01_LGA)
// Note: API uses 5_14 (combined 5-14) and GE85 (85+), not 5_9/10_14/85ov
const AGE_PCHAR_CODES = [
  '0_4', '5_14', '15_19', '20_24', '25_34',
  '35_44', '45_54', '55_64', '65_74', '75_84', 'GE85',
];

export async function fetchG01(lgaCode: string): Promise<G01Data | null> {
  const url = `${ABS_BASE}/C21_G01_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  return decodeG01((pchar, sexp) => lookupValue(data, { SEXP: sexp, PCHAR: pchar, REGION: lgaCode }, '2021'));
}

/**
 * Map G01 PCHAR cells (codelist CL_C21_PCHAR01) to G01Data. `get(pchar, sexp)`
 * returns the cell for SEXP 1 = male, 2 = female, 3 = persons.
 * P_1 = total persons (S_1 is Year 12 completion, not a total);
 * A_T = Aboriginal and/or Torres Strait Islander persons, total.
 */
export function decodeG01(get: (pchar: string, sexp: string) => number | null): G01Data | null {
  const totalPop = get('P_1', '3');
  if (totalPop === null) return null; // LGA not found in this dataset

  const ageGroups: Record<string, number> = {};
  for (const ageCode of AGE_PCHAR_CODES) {
    const v = get(ageCode, '3');
    if (v !== null) ageGroups[ageCode] = v;
  }

  return {
    totalPopulation: Math.round(totalPop),
    malePopulation: Math.round(get('P_1', '1') ?? 0),
    femalePopulation: Math.round(get('P_1', '2') ?? 0),
    ageGroups,
    bornOverseas: Math.round(get('B_O', '3') ?? 0),
    bornAustralia: Math.round(get('B_11', '3') ?? 0),
    speaksEnglishOnly: Math.round(get('L_1201', '3') ?? 0),
    indigenousPopulation: Math.round(get('A_T', '3') ?? 0),
  };
}

// ─── G02: Selected Medians and Averages ───────────────────────────────────────

export interface G02Data {
  medianAge: number;
  medianWeeklyHouseholdIncome: number;
  medianMonthlyMortgage: number;
  medianWeeklyRent: number;
  averageHouseholdSize: number;
}

export async function fetchG02(lgaCode: string): Promise<G02Data | null> {
  const url = `${ABS_BASE}/C21_G02_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  return decodeG02((medavg) => lookupValue(data, { MEDAVG: medavg, REGION: lgaCode }, '2021'));
}

/**
 * MEDAVG codes (CL_C21_MEDAVG01): 1 median age, 2 median personal income (weekly),
 * 3 median family income (weekly), 4 median household income (weekly),
 * 5 median mortgage repayment (monthly), 6 median rent (weekly),
 * 7 average persons per bedroom, 8 average household size.
 */
export function decodeG02(get: (medavg: string) => number | null): G02Data | null {
  const medianAge = get('1');
  const medianIncome = get('4');
  if (medianAge === null && medianIncome === null) return null;

  return {
    medianAge: medianAge ?? 0,
    medianWeeklyHouseholdIncome: medianIncome ?? 0,
    medianMonthlyMortgage: get('5') ?? 0,
    medianWeeklyRent: get('6') ?? 0,
    averageHouseholdSize: get('8') ?? 0,
  };
}

// ─── G33: Dwelling Structure ──────────────────────────────────────────────────
// NOTE: C21_G33_LGA is household income × composition (wrong table).
// Dwelling structure data is in C21_G36_LGA using DWTSTRD dimension + SUM=D.

export interface G33Data {
  separateHouse: number;
  semiDetached: number;
  flatOrApartment: number;
  other: number;
  totalDwellings: number;
}

export interface HistoricalDwellingStructureData {
  separateHouse: number;
  semiDetached: number;
  flatOrApartment: number;
  other: number;
  totalDwellings: number;
}

export async function fetchG33(lgaCode: string): Promise<G33Data | null> {
  // C21_G36_LGA: Dwelling structure by LGA; SUM=D for dwelling counts.
  const url = `${ABS_BASE}/C21_G36_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);
  return decodeG33((dwtstrd) => lookupValue(data, { DWTSTRD: dwtstrd, SUM: 'D', REGION: lgaCode }, '2021'));
}

/**
 * DWTSTRD codes (CL_C21_DWTSTRD02): 11 separate house, 2 semi-detached/terrace,
 * 3 flat or apartment, 9 other, _N not stated — all children of OCC (occupied
 * private dwellings). _T also includes N_OCC (unoccupied), so OCC is the total.
 */
export function decodeG33(get: (dwtstrd: string) => number | null): G33Data | null {
  const separateHouse = get('11') ?? 0;
  const semiDetached  = get('2') ?? 0;
  const flatApt       = get('3') ?? 0;
  const other         = get('9') ?? 0;
  const total         = get('OCC') ?? (separateHouse + semiDetached + flatApt + other);
  if (total === 0) return null;

  return {
    separateHouse: Math.round(separateHouse),
    semiDetached: Math.round(semiDetached),
    flatOrApartment: Math.round(flatApt),
    other: Math.round(other),
    totalDwellings: Math.round(total),
  };
}

export async function fetchB31_2011(lgaCode: string): Promise<HistoricalDwellingStructureData | null> {
  // ABS_CENSUS2011_B31_LGA: Dwelling Structure (LGA)
  // STRD codes from CL_C11_STRD:
  //   1  = Separate house total
  //   2  = Semi-detached / row / terrace / townhouse total
  //   3  = Flat / unit / apartment total
  //   9  = Other dwelling total
  //   OPD = Total occupied private dwellings
  // MEASURE=D filters to dwelling counts.
  const url = `${ABS_BASE}/ABS_CENSUS2011_B31_LGA?startPeriod=2011&endPeriod=2011&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const get = (code: string) =>
    lookupValue(data, { STRD: code, MEASURE: 'D', REGION: lgaCode }, '2011') ?? 0;

  const separateHouse = get('1');
  const semiDetached = get('2');
  const flatOrApartment = get('3');
  const other = get('9');
  const totalDwellings = get('OPD') || (separateHouse + semiDetached + flatOrApartment + other);

  if (totalDwellings === 0) return null;

  return {
    separateHouse: Math.round(separateHouse),
    semiDetached: Math.round(semiDetached),
    flatOrApartment: Math.round(flatOrApartment),
    other: Math.round(other),
    totalDwellings: Math.round(totalDwellings),
  };
}

// ─── G36: Tenure Type ────────────────────────────────────────────────────────
// NOTE: C21_G36_LGA is dwelling structure (used for G33 above).
// Tenure type data is in C21_G37_LGA using TENLLD dimension + STRD=_T.

export interface G36Data {
  owned: number;       // Fully owned
  mortgage: number;    // Owned with mortgage
  rented: number;      // Total rented
  other: number;
}

export async function fetchG36(lgaCode: string): Promise<G36Data | null> {
  // C21_G37_LGA: Tenure × landlord type × dwelling structure; STRD=_T for all dwellings.
  const url = `${ABS_BASE}/C21_G37_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);
  return decodeG36((tenlld) => lookupValue(data, { TENLLD: tenlld, STRD: '_T', REGION: lgaCode }, '2021'));
}

/**
 * TENLLD codes (CL_C21_TENLLD01): 1 owned outright, 2 owned with a mortgage,
 * R_T rented total (children: 3 real estate agent, 4 state housing, 5 community
 * housing, 6 person not in same household, 7 other, R_N not stated), 9 other tenure.
 */
export function decodeG36(get: (tenlld: string) => number | null): G36Data | null {
  const owned    = get('1') ?? 0;
  const mortgage = get('2') ?? 0;
  const rented   = get('R_T') ?? 0;
  const other    = get('9') ?? 0;
  if (owned + mortgage + rented + other === 0) return null;

  return {
    owned: Math.round(owned),
    mortgage: Math.round(mortgage),
    rented: Math.round(rented),
    other: Math.round(other),
  };
}

// ─── G51: Industry of Employment ──────────────────────────────────────────────
// Internal name G51 is historical. Industry of employment for ALL employed persons
// is C21_G54_LGA (industry × age × sex). C21_G53_LGA (used previously) is
// industry × non-school qualification, which only covers qualified workers.

export interface G51Data {
  industries: Array<{ name: string; code: string; employed: number }>;
  totalEmployed: number;
}

// INDP single-letter ANZSIC division codes (CL_C21_INDP03):
const INDUSTRY_LABELS: Record<string, string> = {
  A: 'Agriculture, Forestry & Fishing',
  B: 'Mining',
  C: 'Manufacturing',
  D: 'Electricity, Gas, Water & Waste Services',
  E: 'Construction',
  F: 'Wholesale Trade',
  G: 'Retail Trade',
  H: 'Accommodation & Food Services',
  I: 'Transport, Postal & Warehousing',
  J: 'Information Media & Telecommunications',
  K: 'Financial & Insurance Services',
  L: 'Rental, Hiring & Real Estate',
  M: 'Professional, Scientific & Technical Services',
  N: 'Administrative & Support Services',
  O: 'Public Administration & Safety',
  P: 'Education & Training',
  Q: 'Health Care & Social Assistance',
  R: 'Arts & Recreation Services',
  S: 'Other Services',
};

export async function fetchG51(lgaCode: string): Promise<G51Data | null> {
  const url = `${ABS_BASE}/C21_G54_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);
  return decodeG51((indp) => lookupValue(data, { INDP: indp, SEXP: '3', AGEP: '_T', REGION: lgaCode }, '2021'));
}

/** Industries A–S plus INDP _T (all employed, incl. inadequately described / not stated). */
export function decodeG51(get: (indp: string) => number | null): G51Data | null {
  const industries: G51Data['industries'] = [];
  let sum = 0;
  for (const [code, name] of Object.entries(INDUSTRY_LABELS)) {
    const v = get(code) ?? 0;
    if (v > 0) {
      industries.push({ name, code, employed: Math.round(v) });
      sum += v;
    }
  }
  if (sum === 0) return null;

  return {
    industries: industries.sort((a, b) => b.employed - a.employed),
    totalEmployed: Math.round(get('_T') ?? sum),
  };
}

// ─── G55 / G62 / G59 / B46: Method of Travel to Work ──────────────────────────
// NOTE: C21_G55_LGA is industry × hours worked — the wrong table for JTW.
// The correct 2021 table is C21_G62_LGA (fetched via fetchG62 below).
// Historical JTW data is fetched via fetchG59_2016 (ABS_C16_G59_LGA) and
// fetchB46_2011 (ABS_CENSUS2011_B46_LGA) for trend charts.
//
// There is no usable G55 SDMX endpoint at LGA level; fetchG55 is not implemented.

/**
 * Journey-to-work counts by MAIN mode. Multi-method trips are attributed using
 * the ABS hierarchy: any trip involving train → train; otherwise any trip
 * involving bus → bus; remaining multi-method trips → other.
 * The mode fields + worked_home + did_not_go_to_work + not_stated sum to total.
 */
export interface JourneyToWorkData {
  car_driver: number;
  car_passenger: number;
  train: number;
  bus: number;
  ferry: number;
  tram: number; // tram / light rail
  bicycle: number;
  walked: number;
  worked_home: number;
  other: number;
  /** Absent in cache rows written before the MTWP code fix. */
  did_not_go_to_work?: number;
  not_stated?: number;
  total: number;
}

/** @deprecated Use JourneyToWorkData */
export type G55Data = JourneyToWorkData;

/**
 * Denominator for mode share: workers who travelled to work or worked at home
 * (excludes "did not go to work" and "not stated").
 */
export function journeyToWorkBase(jtw: JourneyToWorkData): number {
  return jtw.total - (jtw.did_not_go_to_work ?? 0) - (jtw.not_stated ?? 0);
}

/** MTWP code for each category in one Census vintage's codelist. */
interface MtwpCodes {
  train: string; bus: string; ferry: string; tram: string; taxi: string;
  carDriver: string; carPassenger: string; truck: string; motorbike: string;
  bicycle: string; other: string; walked: string;
  trainAndOne: string; busAndOne: string; otherTwo: string;
  trainAndTwo: string; busAndTwo: string; otherThree: string;
  workedHome: string; didNotGo: string; notStated: string; total: string;
}

// Codes from the ABS codelists CL_C21_MTWP01, CL_C16_MTWP and CL_C11_MTWP
// (data.api.abs.gov.au, checked 2026-10-22).
export const MTWP_CODES_2021: MtwpCodes = {
  train: '1', bus: '2', ferry: '3', tram: '4', taxi: '5',
  carDriver: '6', carPassenger: '7', truck: '8', motorbike: '9',
  bicycle: '10', other: '11', walked: '232',
  trainAndOne: '1_T', busAndOne: '2_T', otherTwo: '_2O',
  trainAndTwo: '1_2O', busAndTwo: '2_2O', otherThree: '_3O',
  workedHome: '233', didNotGo: '234', notStated: '_N', total: '_T',
};

export const MTWP_CODES_2016: MtwpCodes = {
  ...MTWP_CODES_2021,
  trainAndOne: 'TA', busAndOne: 'BA', otherTwo: '2A',
  trainAndTwo: 'T2', busAndTwo: 'B2', otherThree: '3OT',
  notStated: 'Z', total: 'TOT',
};

export const MTWP_CODES_2011: MtwpCodes = {
  ...MTWP_CODES_2016,
  train: '001', bus: '002', ferry: '003', tram: '004', taxi: '005',
  carDriver: '006', carPassenger: '007', truck: '008', motorbike: '009',
  bicycle: '010', other: '011',
};

/** Map raw MTWP counts (via `get`) to main-mode journey-to-work counts. */
export function decodeJourneyToWork(
  get: (code: string) => number,
  codes: MtwpCodes,
): JourneyToWorkData | null {
  const total = get(codes.total);
  if (!total) return null;

  const r = (n: number) => Math.round(n);
  return {
    car_driver:         r(get(codes.carDriver)),
    car_passenger:      r(get(codes.carPassenger)),
    train:              r(get(codes.train) + get(codes.trainAndOne) + get(codes.trainAndTwo)),
    bus:                r(get(codes.bus) + get(codes.busAndOne) + get(codes.busAndTwo)),
    ferry:              r(get(codes.ferry)),
    tram:               r(get(codes.tram)),
    bicycle:            r(get(codes.bicycle)),
    walked:             r(get(codes.walked)),
    worked_home:        r(get(codes.workedHome)),
    other:              r(get(codes.taxi) + get(codes.truck) + get(codes.motorbike) + get(codes.other)
                          + get(codes.otherTwo) + get(codes.otherThree)),
    did_not_go_to_work: r(get(codes.didNotGo)),
    not_stated:         r(get(codes.notStated)),
    total:              r(total),
  };
}

// ─── SEIFA ───────────────────────────────────────────────────────────────────

export interface SEIFAData {
  irsd: number; // Index of Relative Socio-economic Disadvantage
  irsad: number; // Index of Relative Socio-economic Advantage and Disadvantage
  ier: number; // Index of Economic Resources
  ieo: number; // Index of Education and Occupation
}

export async function fetchSEIFA(lgaCode: string): Promise<SEIFAData | null> {
  // ABS_SEIFA2021_LGA: SEIFA 2021 scores by LGA
  // Uses LGA_2021 (not REGION) as the region dimension
  // SEIFAINDEXTYPE: IRSD, IRSAD, IER, IEO
  // SEIFA_MEASURE: SCORE (index score), DECILE, PERCENTILE, etc.
  const url = `${ABS_BASE}/ABS_SEIFA2021_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  // SEIFA measure codes
  const irsd  = lookupValue(data, { SEIFAINDEXTYPE: 'IRSD',  SEIFA_MEASURE: 'SCORE', LGA_2021: lgaCode }, '2021');
  const irsad = lookupValue(data, { SEIFAINDEXTYPE: 'IRSAD', SEIFA_MEASURE: 'SCORE', LGA_2021: lgaCode }, '2021');
  const ier   = lookupValue(data, { SEIFAINDEXTYPE: 'IER',   SEIFA_MEASURE: 'SCORE', LGA_2021: lgaCode }, '2021');
  const ieo   = lookupValue(data, { SEIFAINDEXTYPE: 'IEO',   SEIFA_MEASURE: 'SCORE', LGA_2021: lgaCode }, '2021');

  if (irsd === null) return null;

  return {
    irsd:  Math.round(irsd  ?? 1000),
    irsad: Math.round(irsad ?? 1000),
    ier:   Math.round(ier   ?? 1000),
    ieo:   Math.round(ieo   ?? 1000),
  };
}

// ─── Regional Labour Market ───────────────────────────────────────────────────

export interface LabourData {
  unemploymentRate: number;
  participationRate: number;
  employmentRate: number;
  dataYear: number;
  /** Counts (persons 15+). Absent in cache rows written before the LFSP code fix. */
  employed?: number;
  unemployed?: number;
  labourForce?: number;
  persons15Plus?: number;
}

export async function fetchLabour(lgaCode: string): Promise<LabourData | null> {
  // C21_G46_LGA: Labour force status × age × sex; SEXP=3 persons, AGEP=_T (15+).
  const url = `${ABS_BASE}/C21_G46_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);
  return decodeLabour((lfsp) => lookupValue(data, { LFSP: lfsp, SEXP: '3', AGEP: '_T', REGION: lgaCode }, '2021'));
}

/**
 * LFSP codes (CL_C21_LFHRP01): 5 employed total (1 FT, 2 PT, 3 away, 4 hours not
 * stated), 8 unemployed total (6 looking FT, 7 looking PT), 9 labour force,
 * 10 not in the labour force, _N not stated, _T total persons 15+.
 * Rates match the ABS's published C21_G43 LFS_P1–P3.
 */
export function decodeLabour(get: (lfsp: string) => number | null): LabourData | null {
  const total = get('_T') ?? 0;
  if (total === 0) return null;
  const employed = get('5') ?? 0;
  const unemployed = get('8') ?? 0;
  const labourForce = get('9') ?? employed + unemployed;

  return {
    unemploymentRate:  labourForce > 0 ? (unemployed / labourForce) * 100 : 0,
    participationRate: (labourForce / total) * 100,
    employmentRate:    (employed / total) * 100,
    dataYear: 2021,
    employed: Math.round(employed),
    unemployed: Math.round(unemployed),
    labourForce: Math.round(labourForce),
    persons15Plus: Math.round(total),
  };
}

// ─── ERP (Estimated Resident Population) ─────────────────────────────────────

export interface ERPData {
  byYear: Record<number, number>; // year → population count
  latestYear: number;
}

export async function fetchERP(lgaCode: string): Promise<ERPData | null> {
  // ABS_ANNUAL_ERP_LGA2025: Annual ERP by LGA, 2001-2025 (uses LGA_2025 boundary)
  // Uses LGA_2025 (not REGION) as the region dimension.
  // The older ABS_ANNUAL_ERP_LGA2021 flow stops at 2021 - do not use it.
  // SEX_ABS: 1=Male, 2=Female, 3=Persons
  // AGE: TOT = all ages total
  const url = `${ABS_BASE}/ABS_ANNUAL_ERP_LGA2025?startPeriod=2001&endPeriod=2025&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const byYear: Record<number, number> = {};
  let latestYear = 0;

  for (let year = 2001; year <= 2025; year++) {
    const v = lookupValue(data, { LGA_2025: lgaCode, SEX_ABS: '3', AGE: 'TOT' }, year.toString());
    if (v !== null && v > 0) {
      byYear[year] = Math.round(v);
      latestYear = Math.max(latestYear, year);
    }
  }

  if (latestYear === 0) return null;

  return { byYear, latestYear };
}

// ─── G46: Highest Year of School Completed ───────────────────────────────────
// NOTE: C21_G46_LGA is labour force status × age (wrong table).
// School completion data is in C21_G16_LGA using HSCP dimension.

export interface EducationData {
  year12: number;
  year11: number;
  year10: number;
  year9: number;
  year8orBelow: number;
  notStated: number;
  totalPopulation: number;
}

export async function fetchG46(lgaCode: string): Promise<EducationData | null> {
  // C21_G16_LGA: Highest year of school completed × age × sex by LGA
  // HSCP codes (confirmed from ABS API):
  //   1 = Year 12
  //   2 = Year 11
  //   3 = Year 10
  //   4 = Year 9
  //   5 = Year 8 or below
  //   6 = Did not go to school
  //   _N = Not stated
  //   _T = Total
  // Use SEXP=3 (Persons) and AGEP=_T (all ages 15+)
  const url = `${ABS_BASE}/C21_G16_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const get = (code: string) =>
    lookupValue(data, { HSCP: code, SEXP: '3', AGEP: '_T', REGION: lgaCode }, '2021') ?? 0;

  const yr12   = get('1');
  const yr11   = get('2');
  const yr10   = get('3');
  const yr9    = get('4');
  const yr8    = get('5') + get('6'); // year 8 or below + did not go to school
  const ns     = get('_N');
  const total  = get('_T');

  if (total === 0) return null;

  return {
    year12: Math.round(yr12),
    year11: Math.round(yr11),
    year10: Math.round(yr10),
    year9:  Math.round(yr9),
    year8orBelow: Math.round(yr8),
    notStated: Math.round(ns),
    totalPopulation: Math.round(total),
  };
}

// ─── G15: Education Institution Attending ─────────────────────────────────────

export interface SchoolAttendanceData {
  preschool: number;
  primary: number;
  secondary: number;
  vocational: number;
  university: number;
  other: number;
  total: number;
}

export async function fetchG15(lgaCode: string): Promise<SchoolAttendanceData | null> {
  // C21_G15_LGA: Type of education institution attending × sex by LGA
  // TYSTAP codes (confirmed from ABS metadata):
  //   10 = Preschool
  //   2  = Primary - Total
  //   3  = Secondary - Total
  //   4  = Vocational education (incl. TAFE/private providers) - Total
  //   5  = University or other higher education - Total
  //   7  = Other - Total
  //   _T = Total
  const url = `${ABS_BASE}/C21_G15_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const get = (code: string) =>
    lookupValue(data, { TYSTAP: code, SEXP: '3', REGION: lgaCode }, '2021') ?? 0;

  const preschool = get('10');
  const primary = get('2');
  const secondary = get('3');
  const vocational = get('4');
  const university = get('5');
  const other = get('7');
  const total = get('_T');

  if (total === 0) return null;

  return {
    preschool: Math.round(preschool),
    primary: Math.round(primary),
    secondary: Math.round(secondary),
    vocational: Math.round(vocational),
    university: Math.round(university),
    other: Math.round(other),
    total: Math.round(total),
  };
}

// ─── G49: Non-School Qualifications ──────────────────────────────────────────

/**
 * Level of highest non-school qualification. `total` is the table total: persons
 * with a non-school qualification, incl. level not stated — it does NOT include
 * people with no non-school qualification (derive that from persons 15+ in G01).
 */
export interface QualificationData {
  postgrad: number;
  grad_diploma: number;
  bachelor: number;
  adv_diploma: number;
  cert3_4: number;
  cert1_2: number;
  cert_nfd: number;
  inadequately_described: number;
  not_stated: number;
  total: number;
}

/**
 * QALLP codes (CL_C21_QALLP02 / CL_C16_QALLP): 1 postgraduate, 2 graduate diploma
 * and certificate, 3 bachelor, 4 advanced diploma and diploma, 51 certificate III
 * and IV, 52 certificate I and II, 50 certificate nfd, 0 inadequately described;
 * not stated is _N (2021) / Z (2016); total is _T (2021) / TOT (2016).
 */
export function decodeQualifications(
  get: (qallp: string) => number | null,
  codes: { notStated: string; total: string },
): QualificationData | null {
  const total = get(codes.total) ?? 0;
  if (total === 0) return null;
  const n = (code: string) => Math.round(get(code) ?? 0);

  return {
    postgrad: n('1'),
    grad_diploma: n('2'),
    bachelor: n('3'),
    adv_diploma: n('4'),
    cert3_4: n('51'),
    cert1_2: n('52'),
    cert_nfd: n('50'),
    inadequately_described: n('0'),
    not_stated: n(codes.notStated),
    total: Math.round(total),
  };
}

export async function fetchG49(lgaCode: string): Promise<QualificationData | null> {
  // C21_G49_LGA: Non-school qualification level × age × sex; SEXP=3, AGEP=_T.
  const url = `${ABS_BASE}/C21_G49_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);
  return decodeQualifications(
    (qallp) => lookupValue(data, { QALLP: qallp, SEXP: '3', AGEP: '_T', REGION: lgaCode }, '2021'),
    { notStated: '_N', total: '_T' },
  );
}

export async function fetchG49_2016(lgaCode: string): Promise<QualificationData | null> {
  // ABS_C16_G46_LGA: 2016 non-school qualification level × age × sex — the same
  // universe as 2021 G49. (ABS_C16_G49_LGA, used previously, is qualification ×
  // occupation: employed persons only, and has no parent-level codes.)
  const url = `${ABS_BASE}/ABS_C16_G46_LGA?startPeriod=2016&endPeriod=2016&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);
  return decodeQualifications(
    (qallp) => lookupValue(data, { QALLP_C16: qallp, SEX_ABS: '3', AGE: 'TOT', LGA_2016: lgaCode }, '2016'),
    { notStated: 'Z', total: 'TOT' },
  );
}

// ─── G34: Number of Motor Vehicles ────────────────────────────────────────────

export interface VehicleData {
  noCar: number;
  oneCar: number;
  twoCars: number;
  threePlusCars: number;
  totalDwellings: number;
}

export async function fetchG34(lgaCode: string): Promise<VehicleData | null> {
  // C21_G34_LGA: Number of motor vehicles per dwelling (dimensions VEHD, SUM, REGION).
  const url = `${ABS_BASE}/C21_G34_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;
  const data = parseSdmxXml(xml);
  return decodeG34((vehd) => lookupValue(data, { VEHD: vehd, SUM: 'D', REGION: lgaCode }, '2021'));
}

/**
 * VEHD codes (CL_C21_VEHD01): 0, 1, 2, 3 vehicles, 4 four or more; V_T = total
 * dwellings with vehicle count stated (excludes _N not stated), used as the
 * denominator so shares sum to 100%.
 */
export function decodeG34(get: (vehd: string) => number | null): VehicleData | null {
  const none  = get('0') ?? 0;
  const one   = get('1') ?? 0;
  const two   = get('2') ?? 0;
  const threePlus = (get('3') ?? 0) + (get('4') ?? 0);
  const computed = none + one + two + threePlus;
  const total = get('V_T') ?? computed;
  if (total === 0) return null;

  return {
    noCar:          Math.round(none),
    oneCar:         Math.round(one),
    twoCars:        Math.round(two),
    threePlusCars:  Math.round(threePlus),
    totalDwellings: Math.round(total),
  };
}

// ─── G62: 2021 Census Method of Travel to Work (C21_G62_LGA) ────────────────
// Dimension: MTWP (codelist CL_C21_MTWP01), SEXP=3 persons. See MTWP_CODES_2021.

export async function fetchG62(lgaCode: string): Promise<JourneyToWorkData | null> {
  const url = `${ABS_BASE}/C21_G62_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;
  const data = parseSdmxXml(xml);

  const get = (mtwp: string) =>
    lookupValue(data, { MTWP: mtwp, SEXP: '3', REGION: lgaCode }, '2021')
    ?? sumValues(data, { MTWP: mtwp, REGION: lgaCode }, '2021');

  return decodeJourneyToWork(get, MTWP_CODES_2021);
}

// ─── G59: 2016 Census Method of Travel to Work (ABS_C16_G59_LGA) ─────────────
//
// Dimension: MTWP_C16 (codelist CL_C16_MTWP), region dim: LGA_2016, sex dim: SEX_ABS.
// See MTWP_CODES_2016.
//
// Module-level cache: parse the 21MB dataset once, reuse across all LGA calls.
let _g59Data: Map<string, number> | null = null;

export async function fetchG59_2016(lgaCode: string): Promise<JourneyToWorkData | null> {
  if (!_g59Data) {
    const url = `${ABS_BASE}/ABS_C16_G59_LGA?startPeriod=2016&endPeriod=2016&dimensionAtObservation=AllDimensions`;
    const xml = await fetchWithRetry(url);
    if (!xml) return null;
    _g59Data = parseSdmxXml(xml);
  }

  const get = (mtwp: string) =>
    lookupValue(_g59Data!, { MTWP_C16: mtwp, SEX_ABS: '3', LGA_2016: lgaCode }, '2016')
    ?? sumValues(_g59Data!, { MTWP_C16: mtwp, LGA_2016: lgaCode }, '2016');

  return decodeJourneyToWork(get, MTWP_CODES_2016);
}

// ─── B46: 2011 Census Method of Travel to Work (ABS_CENSUS2011_B46_LGA) ──────
//
// Dimension: MTWP (codelist CL_C11_MTWP, zero-padded), region dim: REGION
// (REGIONTYPE=LGA2011), MEASURE=3 (persons). See MTWP_CODES_2011.
//
// Module-level cache: parse the 24MB dataset once, reuse across all LGA calls.
let _b46Data: Map<string, number> | null = null;

export async function fetchB46_2011(lgaCode: string): Promise<JourneyToWorkData | null> {
  if (!_b46Data) {
    const url = `${ABS_BASE}/ABS_CENSUS2011_B46_LGA?startPeriod=2011&endPeriod=2011&dimensionAtObservation=AllDimensions`;
    const xml = await fetchWithRetry(url);
    if (!xml) return null;
    _b46Data = parseSdmxXml(xml);
  }

  const get = (mtwp: string) =>
    lookupValue(_b46Data!, { MTWP: mtwp, MEASURE: '3', REGION: lgaCode }, '2011')
    ?? sumValues(_b46Data!, { MTWP: mtwp, REGION: lgaCode }, '2011');

  return decodeJourneyToWork(get, MTWP_CODES_2011);
}

// ─── Commuting distance (Census 2016, ABS Data by Region) ─────────────────────
//
// Dataset: ABS_REGIONAL_LGA2020 — COMMUTE_2 = average, COMMUTE_3 = median
// commuting distance (km) from place of usual residence. 2016 is the only Census
// year published at LGA level (ABS_REGIONAL_LGA2021 has no LGA rows), so this is
// the all-LGA fallback where the TfNSW Household Travel Survey has no coverage.
// Fetched once as CSV (~80 KB) for all LGAs and cached in memory.

export interface CommuteDistanceData {
  avgKm: number | null;
  medianKm: number | null;
  censusYear: 2016;
}

let _commuteDistance: Map<string, CommuteDistanceData> | null = null;

export async function fetchCommuteDistance2016(lgaCode: string): Promise<CommuteDistanceData | null> {
  if (!_commuteDistance) {
    const url = `${ABS_BASE}/ABS,ABS_REGIONAL_LGA2020/COMMUTE_2+COMMUTE_3....?format=csv`;
    const csv = await fetchWithRetry(url);
    if (!csv) return null;
    _commuteDistance = parseCommuteDistanceCsv(csv);
  }
  return _commuteDistance.get(lgaCode) ?? null;
}

export function parseCommuteDistanceCsv(csv: string): Map<string, CommuteDistanceData> {
  const lines = csv.replace(/\r/g, '').split('\n').filter(Boolean);
  const headers = lines[0].split(',');
  const iMeasure = headers.indexOf('MEASURE');
  const iLga = headers.indexOf('LGA_2020');
  const iValue = headers.indexOf('OBS_VALUE');
  const out = new Map<string, CommuteDistanceData>();
  for (const line of lines.slice(1)) {
    const v = line.split(',');
    const value = Number(v[iValue]);
    if (!v[iLga] || !Number.isFinite(value)) continue;
    const entry = out.get(v[iLga]) ?? { avgKm: null, medianKm: null, censusYear: 2016 as const };
    if (v[iMeasure] === 'COMMUTE_2') entry.avgKm = value;
    if (v[iMeasure] === 'COMMUTE_3') entry.medianKm = value;
    out.set(v[iLga], entry);
  }
  return out;
}

// ─── G18: Core Activity Need for Assistance (Disability) ─────────────────────

export interface DisabilityData {
  needsAssistance: number;
  doesNotNeedAssistance: number;
  notStated: number;
  total: number;
  rate: number; // % of population needing assistance
}

export async function fetchG18(lgaCode: string): Promise<DisabilityData | null> {
  // C21_G18_LGA: Core activity need for assistance (ASSNP) × age × sex by LGA
  // ASSNP codes: 1=has need for assistance, 2=does not have need, _N=not stated, _T=total
  const url = `${ABS_BASE}/C21_G18_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;
  const data = parseSdmxXml(xml);

  const get = (assnp: string) =>
    lookupValue(data, { ASSNP: assnp, SEXP: '3', AGEP: '_T', REGION: lgaCode }, '2021') ?? 0;

  const needs   = get('1');
  const doesNot = get('2');
  const ns      = get('_N');
  const total   = get('_T');

  if (total === 0) return null;

  return {
    needsAssistance:       Math.round(needs),
    doesNotNeedAssistance: Math.round(doesNot),
    notStated:             Math.round(ns),
    total:                 Math.round(total),
    rate:                  total > 0 ? Math.round((needs / total) * 1000) / 10 : 0,
  };
}

// ─── G33_INCOME: Household Income Distribution ────────────────────────────────
// C21_G33_LGA is Total Household Income (weekly) × Household Composition.
// NOTE: The dwelling structure data we call "G33" internally is from C21_G36_LGA.
// HIND codes (CL_C21_HIND02): 1 negative/nil, 2 $1–149, 3 $150–299, 4 $300–399,
// 5 $400–499, 6 $500–649, 7 $650–799, 8 $800–999, 9 $1,000–1,249, 10 $1,250–1,499,
// 11 $1,500–1,749, 12 $1,750–1,999, 13 $2,000–2,499, 14 $2,500–2,999,
// 15 $3,000–3,499, 16 $3,500–3,999, 17 $4,000 or more, 18 partial income stated,
// _N all incomes not stated, _T total.

const HIND_LABELS: Record<string, string> = {
  '1':  'Negative/Nil income',
  '2':  '$1–$149/wk',
  '3':  '$150–$299/wk',
  '4':  '$300–$399/wk',
  '5':  '$400–$499/wk',
  '6':  '$500–$649/wk',
  '7':  '$650–$799/wk',
  '8':  '$800–$999/wk',
  '9':  '$1,000–$1,249/wk',
  '10': '$1,250–$1,499/wk',
  '11': '$1,500–$1,749/wk',
  '12': '$1,750–$1,999/wk',
  '13': '$2,000–$2,499/wk',
  '14': '$2,500–$2,999/wk',
  '15': '$3,000–$3,499/wk',
  '16': '$3,500–$3,999/wk',
  '17': '$4,000+/wk',
};

export interface HouseholdIncomeData {
  incomeRanges: { label: string; count: number }[];
  lowIncomeHouseholds: number;  // HIND 1–5: under $500/wk
  highIncomeHouseholds: number; // HIND 13–17: $2,000+/wk
  total: number;                // all households, incl. partial / not stated
}

export async function fetchG33Income(lgaCode: string): Promise<HouseholdIncomeData | null> {
  const url = `${ABS_BASE}/C21_G33_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;
  const data = parseSdmxXml(xml);
  return decodeG33Income((hind) => lookupValue(data, { HIND: hind, HHCD: '_T', REGION: lgaCode }, '2021'));
}

export function decodeG33Income(get: (hind: string) => number | null): HouseholdIncomeData | null {
  const total = get('_T') ?? 0;
  if (total === 0) return null;
  const sum = (codes: string[]) => codes.reduce((acc, c) => acc + (get(c) ?? 0), 0);

  return {
    incomeRanges: Object.entries(HIND_LABELS).map(([code, label]) => ({ label, count: Math.round(get(code) ?? 0) })),
    lowIncomeHouseholds:  Math.round(sum(['1', '2', '3', '4', '5'])),
    highIncomeHouseholds: Math.round(sum(['13', '14', '15', '16', '17'])),
    total: Math.round(total),
  };
}

// ─── Official codelists ───────────────────────────────────────────────────────
// Country and language labels come from the ABS codelist itself rather than a
// hand-written map (the previous maps had most codes mislabelled).

export interface CodelistEntry { id: string; name: string; parent?: string }

const _codelists = new Map<string, CodelistEntry[]>();

async function fetchCodelist(dataflow: string, codelistPrefix: string): Promise<CodelistEntry[]> {
  const key = `${dataflow}:${codelistPrefix}`;
  const cached = _codelists.get(key);
  if (cached) return cached;

  const res = await fetch(
    `https://data.api.abs.gov.au/rest/dataflow/ABS/${dataflow}?references=all&detail=referencepartial`,
    { headers: { Accept: 'application/vnd.sdmx.structure+json', 'User-Agent': DEFAULT_HEADERS['User-Agent'] }, cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`ABS codelist ${dataflow}: HTTP ${res.status}`);
  const json = await res.json() as { data: { codelists: Array<{ id: string; codes: CodelistEntry[] }> } };
  const list = json.data.codelists.find((cl) => cl.id.startsWith(codelistPrefix));
  if (!list) throw new Error(`Codelist ${codelistPrefix} not found for ${dataflow}`);
  const entries = list.codes.map(({ id, name, parent }) => ({ id, name, parent }));
  _codelists.set(key, entries);
  return entries;
}

/**
 * Top-N named groups among the leaf codes under `within`, with the remaining
 * leaves summed into one `otherLabel` bucket. Subtotal codes (any code that is a
 * parent) are never counted, so nothing is double-counted. Codes in `exclude`
 * are left out entirely; codes in `otherCodes` always go to the bucket.
 */
export function selectTopGroups(
  counts: Map<string, number>,
  codelist: CodelistEntry[],
  opts: { within: string; limit: number; otherLabel: string; exclude?: string[]; otherCodes?: string[] },
): Array<{ name: string; code: string; count: number }> {
  const byId = new Map(codelist.map((c) => [c.id, c]));
  const parents = new Set(codelist.map((c) => c.parent).filter(Boolean) as string[]);
  const isUnder = (id: string): boolean => {
    for (let p = byId.get(id)?.parent; p; p = byId.get(p)?.parent) if (p === opts.within) return true;
    return false;
  };
  const exclude = new Set(opts.exclude ?? []);
  const otherCodes = new Set(opts.otherCodes ?? []);

  const leaves = codelist
    .filter((c) => !parents.has(c.id) && !exclude.has(c.id) && isUnder(c.id))
    .map((c) => ({ name: c.name, code: c.id, count: Math.round(counts.get(c.id) ?? 0) }))
    .filter((g) => g.count > 0);

  const named = leaves.filter((g) => !otherCodes.has(g.code)).sort((a, b) => b.count - a.count).slice(0, opts.limit);
  const namedCodes = new Set(named.map((g) => g.code));
  const otherCount = leaves.filter((g) => !namedCodes.has(g.code)).reduce((acc, g) => acc + g.count, 0);

  const groups = otherCount > 0 ? [...named, { name: opts.otherLabel, code: 'other', count: otherCount }] : named;
  return groups.sort((a, b) => b.count - a.count);
}

// ─── G13: Language Spoken at Home ─────────────────────────────────────────────
// C21_G13_LGA: Language used at home (LANP, CL_C21_LANP02) × proficiency in
// spoken English (ENGLP, CL_C21_ENGLP02) × sex.
//   LANP: 1 speaks English only; O_T other languages total, with subtotals such
//         as 71 Chinese: Total over 7101 Cantonese / 7104 Mandarin; _N not stated.
//   ENGLP: 1 English only; 4 uses other language total = 2 (speaks English very
//         well or well) + 3 (not well or not at all); _N not stated; _T total.

export interface LanguageData {
  englishOnly: number;
  languageGroups: { name: string; code: string; count: number }[];
  limitedEnglish: number; // uses another language and speaks English not well / not at all
  total: number;
}

/** Drop empty groups and order by size; labels are already official ABS names. */
function sanitiseGroups(groups: Array<{ name: string; code: string; count: number }>) {
  return groups
    .filter((g) => g.count > 0)
    .map((g) => ({ name: g.name, code: String(g.code), count: Math.round(g.count) }))
    .sort((a, b) => b.count - a.count);
}

export const sanitiseLanguageGroups = sanitiseGroups;
export const sanitiseBirthplaceGroups = sanitiseGroups;

export async function fetchG13(lgaCode: string): Promise<LanguageData | null> {
  const url = `${ABS_BASE}/C21_G13_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;
  const data = parseSdmxXml(xml);
  const codelist = await fetchCodelist('C21_G13_LGA', 'CL_C21_LANP');

  const get = (lanp: string, englp: string) =>
    lookupValue(data, { LANP: lanp, ENGLP: englp, SEXP: '3', REGION: lgaCode }, '2021');
  return decodeG13(get, codelist);
}

/** "Indo-Aryan: Punjabi" → "Punjabi"; keeps the group for catch-alls ("Chinese: Other"). */
function shortLanguageName(name: string): string {
  const i = name.lastIndexOf(': ');
  return i < 0 || /^other\b/i.test(name.slice(i + 2)) ? name : name.slice(i + 2);
}

export function decodeG13(
  get: (lanp: string, englp: string) => number | null,
  codelist: CodelistEntry[],
): LanguageData | null {
  const total = get('_T', '_T') ?? 0;
  if (total === 0) return null;

  const counts = new Map<string, number>();
  for (const { id } of codelist) {
    const v = get(id, '_T');
    if (v !== null) counts.set(id, v);
  }

  return {
    englishOnly: Math.round(get('1', '_T') ?? 0),
    languageGroups: selectTopGroups(counts, codelist, {
      within: 'O_T', limit: 12, otherLabel: 'Other languages', otherCodes: ['_O'],
    }).map((g) => ({ ...g, name: shortLanguageName(g.name) })),
    limitedEnglish: Math.round(get('_T', '3') ?? 0),
    total: Math.round(total),
  };
}

// ─── G09: Country of Birth (Detailed) ─────────────────────────────────────────
// C21_G09_LGA: Country of birth (BPLP, CL_C21_BPLP11) × age × sex. BPLP is a flat
// list under _T: 11 Australia, 50 named countries, _O other, _N not stated.

export interface BirthplaceData {
  birthplaceGroups: { name: string; code: string; count: number }[]; // overseas countries
  bornAustralia: number;
  bornOverseas: number;
  total: number;
}

export async function fetchG09(lgaCode: string): Promise<BirthplaceData | null> {
  const url = `${ABS_BASE}/C21_G09_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;
  const data = parseSdmxXml(xml);
  const codelist = await fetchCodelist('C21_G09_LGA', 'CL_C21_BPLP');

  return decodeG09(
    (bplp) => lookupValue(data, { BPLP: bplp, SEXP: '3', AGEP: '_T', REGION: lgaCode }, '2021'),
    codelist,
  );
}

export function decodeG09(get: (bplp: string) => number | null, codelist: CodelistEntry[]): BirthplaceData | null {
  const total = get('_T') ?? 0;
  if (total === 0) return null;

  const counts = new Map<string, number>();
  for (const { id } of codelist) {
    const v = get(id);
    if (v !== null) counts.set(id, v);
  }
  const bornAustralia = counts.get('11') ?? 0;
  const notStated = counts.get('_N') ?? 0;

  return {
    birthplaceGroups: selectTopGroups(counts, codelist, {
      within: '_T', limit: 15, otherLabel: 'Other countries', exclude: ['11', '_N'], otherCodes: ['_O'],
    }),
    bornAustralia: Math.round(bornAustralia),
    bornOverseas: Math.round(total - bornAustralia - notStated),
    total: Math.round(total),
  };
}

// ─── G25: Family and Household Composition ────────────────────────────────────
// Internal name G25 is historical (C21_G25_LGA is unpaid care).
//   Families:   C21_G32_LGA, FMCF (CL_C21_FMCF02) 1 couple without children,
//               2 couple with children, 3 one parent, 9 other family; FINF=_T.
//   Households: C21_G35_LGA, HHCD (1_2 family households, 3 non-family) ×
//               NPRD (1 one person … _T); lone person = non-family with 1 person,
//               group = non-family with 2+ persons.

export interface FamilyData {
  coupleWithChildren: number;
  coupleNoChildren: number;
  oneParentFamily: number;
  otherFamily: number;
  totalFamilies: number;
  familyHouseholds: number;
  lonePersonHousehold: number;
  groupHousehold: number;
  totalHouseholds: number;
}

export async function fetchG25(lgaCode: string): Promise<FamilyData | null> {
  const [familyXml, householdXml] = await Promise.all([
    fetchWithRetry(`${ABS_BASE}/C21_G32_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`),
    fetchWithRetry(`${ABS_BASE}/C21_G35_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`),
  ]);
  if (!familyXml || !householdXml) return null;
  const families = parseSdmxXml(familyXml);
  const households = parseSdmxXml(householdXml);

  return decodeG25(
    (fmcf) => lookupValue(families, { FMCF: fmcf, FINF: '_T', REGION: lgaCode }, '2021'),
    (hhcd, nprd) => lookupValue(households, { HHCD: hhcd, NPRD: nprd, REGION: lgaCode }, '2021'),
  );
}

export function decodeG25(
  family: (fmcf: string) => number | null,
  household: (hhcd: string, nprd: string) => number | null,
): FamilyData | null {
  const totalHouseholds = household('_T', '_T') ?? 0;
  const totalFamilies = family('_T') ?? 0;
  if (totalHouseholds === 0 && totalFamilies === 0) return null;

  const lone = household('3', '1') ?? 0;
  return {
    coupleNoChildren:    Math.round(family('1') ?? 0),
    coupleWithChildren:  Math.round(family('2') ?? 0),
    oneParentFamily:     Math.round(family('3') ?? 0),
    otherFamily:         Math.round(family('9') ?? 0),
    totalFamilies:       Math.round(totalFamilies),
    familyHouseholds:    Math.round(household('1_2', '_T') ?? 0),
    lonePersonHousehold: Math.round(lone),
    groupHousehold:      Math.round((household('3', '_T') ?? 0) - lone),
    totalHouseholds:     Math.round(totalHouseholds),
  };
}

// ─── G60: Occupation by Sex ───────────────────────────────────────────────────

const OCCP_LABELS: Record<string, string> = {
  '1': 'Managers',
  '2': 'Professionals',
  '3': 'Technicians & Trades',
  '4': 'Community & Personal Service',
  '5': 'Clerical & Administrative',
  '6': 'Sales',
  '7': 'Machinery Operators & Drivers',
  '8': 'Labourers',
};

export interface OccupationData {
  occupations: { name: string; code: string; employed: number; male: number; female: number }[];
  total: number;
}

export async function fetchG60(lgaCode: string): Promise<OccupationData | null> {
  // C21_G60_LGA: Occupation (OCCP ANZSCO major group 1–8) × age × sex by LGA
  const url = `${ABS_BASE}/C21_G60_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;
  const data = parseSdmxXml(xml);

  const get = (occp: string, sexp: string) =>
    lookupValue(data, { OCCP: occp, SEXP: sexp, AGEP: '_T', REGION: lgaCode }, '2021');

  const occupations = Object.entries(OCCP_LABELS).map(([code, name]) => ({
    name,
    code,
    employed: Math.round(get(code, '3') ?? 0),
    male:     Math.round(get(code, '1') ?? 0),
    female:   Math.round(get(code, '2') ?? 0),
  })).filter(o => o.employed > 0);

  // OCCP _T = all employed, incl. inadequately described / not stated (_N).
  const total = Math.round(get('_T', '3') ?? occupations.reduce((s, o) => s + o.employed, 0));
  if (total === 0) return null;

  return {
    occupations: occupations.sort((a, b) => b.employed - a.employed),
    total,
  };
}

// ─── Building Approvals ───────────────────────────────────────────────────────
// ABS Building Approvals small-area datasets:
//   BA_LGA2024 → monthly LGA approvals for 2024/25
//   BA_LGA2025 → monthly LGA approvals for 2025/26 (full FY)
//   BA_LGA2026 → monthly LGA approvals for 2026/27 FYTD
//
// NOTE: BA_LGA2026 keys its region dimension as REGION_TYPE=LGA2025, not LGA2026.
// A LGA2026 key returns HTTP 404.
//
// Datastructure confirmed from live ABS API:
//   MEASURE=1      → Number of dwelling units
//   SECTOR=9       → Total sectors
//   WORK_TYPE=TOT  → Total work
//   BUILDING_TYPE=100 → Total Residential
//
// We use keyed SDMX queries per LGA to avoid downloading the entire national
// small-area cube, which is too large to decode safely in Node.

export interface BuildingApprovalsData {
  periods: { year: number; month: number; residentialCount: number }[];
  rollingAnnualDwellings: number;
}

function parseTimeSeriesXml(xml: string): BuildingApprovalsData['periods'] {
  const periods: BuildingApprovalsData['periods'] = [];
  const obsRegex = /<(?:\w+:)?Obs>[\s\S]*?<(?:\w+:)?ObsDimension[^>]*value="(\d{4})-(\d{2})"[^>]*\/>[\s\S]*?<(?:\w+:)?ObsValue[^>]*value="(-?\d+(?:\.\d+)?)"[^>]*\/>[\s\S]*?<\/(?:\w+:)?Obs>/g;
  let match: RegExpExecArray | null;

  while ((match = obsRegex.exec(xml)) !== null) {
    periods.push({
      year: Number(match[1]),
      month: Number(match[2]),
      residentialCount: Math.round(Number(match[3])),
    });
  }

  return periods;
}

async function fetchBuildingApprovalsSeries(
  datasetId: 'BA_LGA2024' | 'BA_LGA2025' | 'BA_LGA2026',
  regionType: 'LGA2024' | 'LGA2025',
  lgaCode: string,
  startPeriod: string,
): Promise<BuildingApprovalsData['periods']> {
  const key = `1.9.TOT.100.${regionType}.${lgaCode}.M`;
  const xml = await fetchWithRetry(`${ABS_BASE}/${datasetId}/${key}?startPeriod=${startPeriod}`);
  if (!xml) return [];
  return parseTimeSeriesXml(xml);
}

export async function fetchBuildingApprovals(lgaCode: string): Promise<BuildingApprovalsData | null> {
  const periods = (
    await Promise.all([
      fetchBuildingApprovalsSeries('BA_LGA2024', 'LGA2024', lgaCode, '2024-07'),
      fetchBuildingApprovalsSeries('BA_LGA2025', 'LGA2025', lgaCode, '2025-07'),
      fetchBuildingApprovalsSeries('BA_LGA2026', 'LGA2025', lgaCode, '2026-07'),
    ])
  )
    .flat()
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

  if (periods.length === 0) return null;

  const rollingAnnualDwellings = periods.slice(-12).reduce((s, p) => s + p.residentialCount, 0);

  return { periods, rollingAnnualDwellings };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface AllABSData {
  lgaCode: string;
  g01: G01Data | null;
  g02: G02Data | null;
  g33: G33Data | null;
  b31_2011: HistoricalDwellingStructureData | null;
  g36: G36Data | null;
  g51: G51Data | null;
  g55: null;  // Always null — no ABS endpoint available
  g46: EducationData | null;
  g15: SchoolAttendanceData | null;
  g49: QualificationData | null;
  g49_2016: QualificationData | null;
  seifa: SEIFAData | null;
  labour: LabourData | null;
  erp: ERPData | null;
  // New datasets
  g34: VehicleData | null;
  g62: JourneyToWorkData | null;
  g18: DisabilityData | null;
  g33Income: HouseholdIncomeData | null;
  g13: LanguageData | null;
  g09: BirthplaceData | null;
  g25: FamilyData | null;
  g60: OccupationData | null;
  buildingApprovals: BuildingApprovalsData | null;
  g59: JourneyToWorkData | null;  // 2016 JTW (ABS_C16_G59_LGA)
  b46: JourneyToWorkData | null;  // 2011 JTW (ABS_CENSUS2011_B46_LGA)
  commuteDistance2016: CommuteDistanceData | null;
}

export async function fetchAllABSDataForLGA(lgaCode: string): Promise<AllABSData> {
  console.log(`  Fetching ABS data for LGA ${lgaCode}...`);

  // Batch 1: Core demographics
  const logWarn = (dataset: string) => (err: unknown) => {
    console.warn(`[ABS] ${dataset} failed for LGA ${lgaCode}:`, (err as Error)?.message || err);
    return null;
  };
  const [g01, g02, seifa] = await Promise.all([
    fetchG01(lgaCode).catch(logWarn('G01')),
    fetchG02(lgaCode).catch(logWarn('G02')),
    fetchSEIFA(lgaCode).catch(logWarn('SEIFA')),
  ]);

  await sleep(300);

  // Batch 2: Housing & employment
  const [g33, b31_2011, g36, g51] = await Promise.all([
    fetchG33(lgaCode).catch(logWarn('G33')),
    fetchB31_2011(lgaCode).catch(logWarn('B31_2011')),
    fetchG36(lgaCode).catch(logWarn('G36')),
    fetchG51(lgaCode).catch(logWarn('G51')),
  ]);

  await sleep(300);

  // Batch 3: Transport, education, labour
  const g55: null = null; // No ABS SDMX endpoint for JTW at LGA level
  const [g46, g15, g49, labour, erp] = await Promise.all([
    fetchG46(lgaCode).catch(logWarn('G46')),
    fetchG15(lgaCode).catch(logWarn('G15')),
    fetchG49(lgaCode).catch(logWarn('G49')),
    fetchLabour(lgaCode).catch(logWarn('LABOUR')),
    fetchERP(lgaCode).catch(logWarn('ERP')),
  ]);

  await sleep(300);

  // Batch 4: New datasets (demographics, transport, economy, housing, growth)
  const [g34, g62, g18, g33Income, g13] = await Promise.all([
    fetchG34(lgaCode).catch(logWarn('G34')),
    fetchG62(lgaCode).catch(logWarn('G62')),
    fetchG18(lgaCode).catch(logWarn('G18')),
    fetchG33Income(lgaCode).catch(logWarn('G33_INCOME')),
    fetchG13(lgaCode).catch(logWarn('G13')),
  ]);

  await sleep(300);

  // Batch 5: Remaining new datasets
  const [g09, g25, g60, buildingApprovals] = await Promise.all([
    fetchG09(lgaCode).catch(logWarn('G09')),
    fetchG25(lgaCode).catch(logWarn('G25')),
    fetchG60(lgaCode).catch(logWarn('G60')),
    fetchBuildingApprovals(lgaCode).catch(logWarn('BUILDING_APPROVALS')),
  ]);

  await sleep(300);

  // Batch 6: Historical JTW for mode share trend (2016 and 2011) plus
  // historical qualification datasets for education trend charts.
  const [g59, b46, g49_2016, commuteDistance2016] = await Promise.all([
    fetchG59_2016(lgaCode).catch(logWarn('G59')),
    fetchB46_2011(lgaCode).catch(logWarn('B46')),
    fetchG49_2016(lgaCode).catch(logWarn('G49_2016')),
    fetchCommuteDistance2016(lgaCode).catch(logWarn('COMMUTE_DIST_2016')),
  ]);

  return {
    lgaCode, g01, g02, g33, b31_2011, g36, g51, g55, g46, g15, g49, g49_2016, seifa, labour, erp,
    g34, g62, g18, g33Income, g13, g09, g25, g60, buildingApprovals,
    g59, b46, commuteDistance2016,
  };
}
