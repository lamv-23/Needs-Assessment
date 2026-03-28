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
 *   G49  → C21_G49_LGA  : SEXP × QALLP × AGEP (1=postgrad, 2=grad_dip, 3=bach, 51=adv_dip, 4=cert3/4)
 *   SEIFA→ ABS_SEIFA2021_LGA: LGA_2021 × SEIFAINDEXTYPE × SEIFA_MEASURE=SCORE
 *   LABOUR→ C21_G46_LGA : SEXP × LFSP × AGEP (1=FT emp, 2=PT emp, 3=away, 4=unemp, 5+=NILF)
 *   ERP  → ABS_ANNUAL_ERP_LGA2021: LGA_2021 × SEX_ABS × AGE=TOT (multi-year)
 */

const ABS_BASE = 'https://data.api.abs.gov.au/rest/data';
const DEFAULT_HEADERS = {
  Accept: 'application/xml',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// ─── LGA Code Map ─────────────────────────────────────────────────────────────
// Maps internal area IDs to 5-digit ABS LGA codes (2021 ASGS)

export const LGA_CODE_MAP: Record<string, string> = {
  lga_sydney:           '17200', // Sydney
  lga_parramatta:       '16260', // Parramatta
  lga_blacktown:        '10750', // Blacktown
  lga_penrith:          '16350', // Penrith
  lga_camden:           '11450', // Camden
  lga_liverpool:        '14900', // Liverpool
  lga_fairfield:        '12850', // Fairfield
  lga_bankstown:        '11570', // Canterbury-Bankstown
  lga_sutherland:       '17150', // Sutherland Shire
  lga_hornsby:          '14000', // Hornsby
  lga_ku_ring_gai:      '14500', // Ku-ring-gai
  lga_northern_beaches: '15990', // Northern Beaches
  lga_manly:            '15990', // Northern Beaches (Manly amalgamated into Northern Beaches)
  lga_willoughby:       '18250', // Willoughby
  lga_lane_cove:        '14700', // Lane Cove
  lga_mosman:           '15350', // Mosman
  lga_north_sydney:     '15950', // North Sydney
  lga_ryde:             '16700', // Ryde
  lga_hunters_hill:     '14100', // Hunters Hill
  lga_strathfield:      '17100', // Strathfield
  lga_burwood:          '11300', // Burwood
  lga_canada_bay:       '11520', // Canada Bay
  lga_inner_west:       '14170', // Inner West
  lga_bayside:          '10500', // Bayside (NSW)
  lga_georges_river:    '12930', // Georges River
  lga_hurstville:       '12930', // Georges River (Hurstville amalgamated into Georges River)
  lga_kogarah:          '12930', // Georges River (Kogarah amalgamated into Georges River)
  lga_rockdale:         '10500', // Bayside (Rockdale amalgamated into Bayside)
  lga_botany_bay:       '10500', // Bayside (Botany Bay amalgamated into Bayside)
  lga_randwick:         '16550', // Randwick
  lga_waverley:         '18050', // Waverley
  lga_woollahra:        '18500', // Woollahra
  lga_blue_mountains:   '10900', // Blue Mountains
  lga_wollondilly:      '18400', // Wollondilly
  lga_hawkesbury:       '13800', // Hawkesbury
  lga_hills:            '17420', // The Hills Shire
  lga_cumberland:       '12380', // Cumberland
  benchmark_gsy:        '1GSYD', // Greater Sydney benchmark
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

  // Total population: SEXP=3 (Persons), PCHAR=S_1 (total), REGION=lgaCode
  const totalPop = lookupValue(data, { SEXP: '3', PCHAR: 'S_1', REGION: lgaCode }, '2021');
  if (totalPop === null) {
    // LGA not found in this dataset
    return null;
  }

  const malePop = lookupValue(data, { SEXP: '1', PCHAR: 'S_1', REGION: lgaCode }, '2021') ?? 0;
  const femalePop = lookupValue(data, { SEXP: '2', PCHAR: 'S_1', REGION: lgaCode }, '2021') ?? 0;

  // Age groups: SEXP=3, PCHAR=<age code>
  const ageGroups: Record<string, number> = {};
  for (const ageCode of AGE_PCHAR_CODES) {
    const v = lookupValue(data, { SEXP: '3', PCHAR: ageCode, REGION: lgaCode }, '2021');
    if (v !== null) ageGroups[ageCode] = v;
  }

  // Country of birth
  // B_11 = Born in Australia, B_O = Born overseas (other)
  const bornAustralia = lookupValue(data, { SEXP: '3', PCHAR: 'B_11', REGION: lgaCode }, '2021') ?? 0;
  const bornOverseas = lookupValue(data, { SEXP: '3', PCHAR: 'B_O', REGION: lgaCode }, '2021') ?? 0;

  // Language: L_1201 = Speaks English only
  const speaksEnglishOnly = lookupValue(data, { SEXP: '3', PCHAR: 'L_1201', REGION: lgaCode }, '2021') ?? 0;

  // Indigenous: I_1 = Aboriginal, I_2 = Torres Strait Islander, I_3 = Both, sum them
  const indig = sumValues(data, { SEXP: '3', REGION: lgaCode }, '2021');
  // Use a simpler approach - I_T for total indigenous if available
  const indigenousTotal =
    (lookupValue(data, { SEXP: '3', PCHAR: 'I_1', REGION: lgaCode }, '2021') ?? 0) +
    (lookupValue(data, { SEXP: '3', PCHAR: 'I_2', REGION: lgaCode }, '2021') ?? 0) +
    (lookupValue(data, { SEXP: '3', PCHAR: 'I_3', REGION: lgaCode }, '2021') ?? 0);
  void indig; // suppress unused warning

  return {
    totalPopulation: Math.round(totalPop),
    malePopulation: Math.round(malePop),
    femalePopulation: Math.round(femalePop),
    ageGroups,
    bornOverseas: Math.round(bornOverseas),
    bornAustralia: Math.round(bornAustralia),
    speaksEnglishOnly: Math.round(speaksEnglishOnly),
    indigenousPopulation: Math.round(indigenousTotal),
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

  // G02 uses MEDAVG numeric codes (confirmed from ABS API):
  // MEDAVG=1 → median age of persons
  // MEDAVG=2 → median weekly household income
  // MEDAVG=3 → median monthly mortgage repayment
  // MEDAVG=4 → median weekly personal income
  // MEDAVG=5 → median weekly family income
  // MEDAVG=6 → median weekly rent
  // MEDAVG=7 → average motor vehicles per dwelling
  // MEDAVG=8 → average household size (persons per dwelling)
  const medianAge = lookupValue(data, { MEDAVG: '1', REGION: lgaCode }, '2021');
  const medianIncome = lookupValue(data, { MEDAVG: '2', REGION: lgaCode }, '2021');
  const medianMortgage = lookupValue(data, { MEDAVG: '3', REGION: lgaCode }, '2021');
  const medianRent = lookupValue(data, { MEDAVG: '6', REGION: lgaCode }, '2021');
  const avgHhSize = lookupValue(data, { MEDAVG: '8', REGION: lgaCode }, '2021');

  if (medianAge === null && medianIncome === null) return null;

  return {
    medianAge: medianAge ?? 0,
    medianWeeklyHouseholdIncome: medianIncome ?? 0,
    medianMonthlyMortgage: medianMortgage ?? 0,
    medianWeeklyRent: medianRent ?? 0,
    averageHouseholdSize: avgHhSize ?? 0,
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

export async function fetchG33(lgaCode: string): Promise<G33Data | null> {
  // C21_G36_LGA: Dwelling structure by LGA
  // DWTSTRD codes (confirmed from ABS API):
  //   11 = Separate house
  //   2  = Semi-detached, row/terrace/townhouse (21=owned, 22=rented subtypes)
  //   3  = Flat, unit or apartment (31-35 subtypes)
  //   9  = Other dwelling
  //   _T = Total private dwellings
  // SUM=D filters to dwelling counts (vs SUM=P for persons)
  const url = `${ABS_BASE}/C21_G36_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const separateHouse = lookupValue(data, { DWTSTRD: '11', SUM: 'D', REGION: lgaCode }, '2021') ?? 0;
  const semiDetached  = lookupValue(data, { DWTSTRD: '2', SUM: 'D', REGION: lgaCode }, '2021') ?? 0;
  const flatApt       = lookupValue(data, { DWTSTRD: '3', SUM: 'D', REGION: lgaCode }, '2021') ?? 0;
  const other         = lookupValue(data, { DWTSTRD: '9', SUM: 'D', REGION: lgaCode }, '2021') ?? 0;
  const total         = lookupValue(data, { DWTSTRD: '_T', SUM: 'D', REGION: lgaCode }, '2021')
                        ?? (separateHouse + semiDetached + flatApt + other);

  if (total === 0) return null;

  return {
    separateHouse: Math.round(separateHouse),
    semiDetached: Math.round(semiDetached),
    flatOrApartment: Math.round(flatApt),
    other: Math.round(other),
    totalDwellings: Math.round(total),
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
  // C21_G37_LGA: Tenure type × dwelling structure by LGA
  // TENLLD codes (confirmed from ABS API, STRD=_T for all dwelling types):
  //   1  = Owned outright
  //   2  = Owned with mortgage
  //   3  = Rented (total — all landlord types combined)
  //   4  = Rented from private landlord
  //   5  = Rented from real estate agent
  //   6  = Rented from state/territory housing authority
  //   7  = Rented from community housing
  //   9  = Other tenure
  //   _T = Total occupied private dwellings
  const url = `${ABS_BASE}/C21_G37_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const owned    = lookupValue(data, { TENLLD: '1', STRD: '_T', REGION: lgaCode }, '2021') ?? 0;
  const mortgage = lookupValue(data, { TENLLD: '2', STRD: '_T', REGION: lgaCode }, '2021') ?? 0;
  const rented   = lookupValue(data, { TENLLD: '3', STRD: '_T', REGION: lgaCode }, '2021') ?? 0;
  const other    = lookupValue(data, { TENLLD: '9', STRD: '_T', REGION: lgaCode }, '2021') ?? 0;

  const total = owned + mortgage + rented + other;
  if (total === 0) return null;

  return {
    owned: Math.round(owned),
    mortgage: Math.round(mortgage),
    rented: Math.round(rented),
    other: Math.round(other),
  };
}

// ─── G51: Industry of Employment ──────────────────────────────────────────────
// NOTE: C21_G51_LGA is qualification × occupation (wrong table).
// Industry of employment is in C21_G53_LGA using INDP single-letter ANZSIC codes.

export interface G51Data {
  industries: Array<{ name: string; code: string; employed: number }>;
  totalEmployed: number;
}

// INDP single-letter ANZSIC division codes (confirmed from ABS API C21_G53_LGA):
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
  // C21_G53_LGA: Industry of employment × qualification × sex by LGA
  // Use SEXP=3 (all persons) and QALLP=_T (all qualifications) for total industry counts
  const url = `${ABS_BASE}/C21_G53_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const industries: G51Data['industries'] = [];
  let total = 0;

  for (const [code, name] of Object.entries(INDUSTRY_LABELS)) {
    const v = lookupValue(data, { INDP: code, SEXP: '3', QALLP: '_T', REGION: lgaCode }, '2021') ?? 0;
    if (v > 0) {
      industries.push({ name, code, employed: Math.round(v) });
      total += v;
    }
  }

  if (total === 0) return null;

  return {
    industries: industries.sort((a, b) => b.employed - a.employed),
    totalEmployed: Math.round(total),
  };
}

// ─── G55: Method of Travel to Work ───────────────────────────────────────────
// NOTE: C21_G55_LGA is industry × hours worked (wrong table).
// The ABS SDMX API does not expose a Census journey-to-work table at LGA level
// via the REST endpoint. This fetcher returns null and the app falls back to
// sample data for transport mode split.

export interface G55Data {
  car_driver: number;
  car_passenger: number;
  train: number;
  bus: number;
  ferry: number;
  tram: number;
  bicycle: number;
  walked: number;
  worked_home: number;
  other: number;
  total: number;
}

export async function fetchG55(_lgaCode: string): Promise<G55Data | null> {
  // No ABS SDMX endpoint available for Census journey-to-work at LGA level.
  // The app will use sample/static data for transport mode splits.
  return null;
}

// ─── SEIFA ───────────────────────────────────────────────────────────────────

export interface SEIFAData {
  irsd: number; // Index of Relative Socio-economic Disadvantage
  irsad: number; // Index of Relative Socio-economic Advantage and Disadvantage
  ier: number; // Index of Education and Occupation
  ieo: number; // Index of Economic Resources
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
}

export async function fetchLabour(lgaCode: string): Promise<LabourData | null> {
  // C21_G46_LGA: Labour Force Status × age × sex by LGA (person-level counts)
  // LFSP codes (confirmed from ABS API):
  //   1  = Employed, worked full-time
  //   2  = Employed, worked part-time
  //   3  = Employed, away from work
  //   4  = Unemployed, looking for work (full-time or part-time)
  //   5  = Not in the labour force (retired/home duties/students etc)
  //   6-10 = Other NILF sub-categories
  //   _N = Not stated / not applicable (includes under 15)
  //   _T = Total aged 15+ (excludes not applicable)
  // Use SEXP=3 (Persons) and AGEP=_T (all ages 15+)
  const url = `${ABS_BASE}/C21_G46_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const get = (code: string) =>
    lookupValue(data, { LFSP: code, SEXP: '3', AGEP: '_T', REGION: lgaCode }, '2021') ?? 0;

  const empFT   = get('1');
  const empPT   = get('2');
  const empAway = get('3');
  const unemp   = get('4');
  const total   = get('_T');

  if (total === 0) return null;

  const employed    = empFT + empPT + empAway;
  const labourForce = employed + unemp;

  return {
    unemploymentRate:  labourForce > 0 ? (unemp / labourForce) * 100 : 0,
    participationRate: total > 0 ? (labourForce / total) * 100 : 0,
    employmentRate:    total > 0 ? (employed / total) * 100 : 0,
    dataYear: 2021,
  };
}

// ─── ERP (Estimated Resident Population) ─────────────────────────────────────

export interface ERPData {
  byYear: Record<number, number>; // year → population count
  latestYear: number;
}

export async function fetchERP(lgaCode: string): Promise<ERPData | null> {
  // ABS_ANNUAL_ERP_LGA2021: Annual ERP by LGA (uses LGA_2021 boundary)
  // Uses LGA_2021 (not REGION) as the region dimension
  // SEX_ABS: 1=Male, 2=Female, 3=Persons
  // AGE: TOT = all ages total
  const url = `${ABS_BASE}/ABS_ANNUAL_ERP_LGA2021?startPeriod=2016&endPeriod=2023&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const byYear: Record<number, number> = {};
  let latestYear = 0;

  for (let year = 2016; year <= 2023; year++) {
    const v = lookupValue(data, { LGA_2021: lgaCode, SEX_ABS: '3', AGE: 'TOT' }, year.toString());
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

// ─── G49: Non-School Qualifications ──────────────────────────────────────────

export interface QualificationData {
  postgrad: number;
  grad_diploma: number;
  bachelor: number;
  adv_diploma: number;
  cert3_4: number;
  cert1_2: number;
  no_qualification: number;
  not_stated: number;
  total: number;
}

export async function fetchG49(lgaCode: string): Promise<QualificationData | null> {
  // C21_G49_LGA: Non-school qualifications × age × sex by LGA
  // QALLP codes (confirmed from ABS API, SEXP=3 AGEP=_T):
  //   1  = Postgraduate degree
  //   2  = Graduate diploma / Graduate certificate
  //   3  = Bachelor degree
  //   51 = Advanced diploma / Diploma
  //   4  = Certificate III / IV
  //   52 = Certificate I / II
  //   0  = No non-school qualification
  //   _N = Not stated / inadequately described
  //   _T = Total
  const url = `${ABS_BASE}/C21_G49_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const get = (code: string) =>
    lookupValue(data, { QALLP: code, SEXP: '3', AGEP: '_T', REGION: lgaCode }, '2021') ?? 0;

  const pg   = get('1');
  const gd   = get('2');
  const bach = get('3');
  const adv  = get('51');
  const c34  = get('4');
  const c12  = get('52');
  const nq   = get('0');
  const ns   = get('_N');
  const total = get('_T');

  if (total === 0) return null;

  return {
    postgrad:         Math.round(pg),
    grad_diploma:     Math.round(gd),
    bachelor:         Math.round(bach),
    adv_diploma:      Math.round(adv),
    cert3_4:          Math.round(c34),
    cert1_2:          Math.round(c12),
    no_qualification: Math.round(nq),
    not_stated:       Math.round(ns),
    total:            Math.round(total),
  };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface AllABSData {
  lgaCode: string;
  g01: G01Data | null;
  g02: G02Data | null;
  g33: G33Data | null;
  g36: G36Data | null;
  g51: G51Data | null;
  g55: G55Data | null;
  g46: EducationData | null;
  g49: QualificationData | null;
  seifa: SEIFAData | null;
  labour: LabourData | null;
  erp: ERPData | null;
}

export async function fetchAllABSDataForLGA(lgaCode: string): Promise<AllABSData> {
  console.log(`  Fetching ABS data for LGA ${lgaCode}...`);

  // Batch 1: Core demographics
  const [g01, g02, seifa] = await Promise.all([
    fetchG01(lgaCode).catch(() => null),
    fetchG02(lgaCode).catch(() => null),
    fetchSEIFA(lgaCode).catch(() => null),
  ]);

  await sleep(300);

  // Batch 2: Housing & employment
  const [g33, g36, g51] = await Promise.all([
    fetchG33(lgaCode).catch(() => null),
    fetchG36(lgaCode).catch(() => null),
    fetchG51(lgaCode).catch(() => null),
  ]);

  await sleep(300);

  // Batch 3: Transport, education, labour
  const [g55, g46, g49, labour, erp] = await Promise.all([
    fetchG55(lgaCode).catch(() => null),
    fetchG46(lgaCode).catch(() => null),
    fetchG49(lgaCode).catch(() => null),
    fetchLabour(lgaCode).catch(() => null),
    fetchERP(lgaCode).catch(() => null),
  ]);

  return { lgaCode, g01, g02, g33, g36, g51, g55, g46, g49, seifa, labour, erp };
}
