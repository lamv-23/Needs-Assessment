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
 * PCHAR codes for G01 (confirmed from live API):
 *   S_1 = Total persons (use with SEXP=3)
 *   Age groups: 0_4, 5_9, 10_14, 15_19, 20_24, 25_34, 35_44, 45_54, 55_64, 65_74, 75_84, 85ov
 *   Marital status: S_1..S_6
 *   Dwelling type: D_1_3, D_O
 *   Country of birth: C_1, B_11, B_O
 *   Language: L_1201, L_O
 *   Ancestry: A_1..A_T
 *   Education: E_1..E_5
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

  // G02 uses MEASURE dimension codes
  // Median_Age_Persons, Median_Tot_Hhd_Inc_Weekly, Median_Mtg_Repay_Monthly, Median_Rent_Weekly, Avg_Hhd_Size
  const medianAge = lookupValue(data, { MEASURE: 'MED_AGE_PERSONS', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { MEASURE: 'Median_Age_Persons', REGION: lgaCode }, '2021');

  const medianIncome = lookupValue(data, { MEASURE: 'MED_TOT_HHD_INC_WEEKLY', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { MEASURE: 'Median_Tot_Hhd_Inc_Weekly', REGION: lgaCode }, '2021');

  const medianMortgage = lookupValue(data, { MEASURE: 'MED_MTG_REPAY_MONTHLY', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { MEASURE: 'Median_Mtg_Repay_Monthly', REGION: lgaCode }, '2021');

  const medianRent = lookupValue(data, { MEASURE: 'MED_RENT_WEEKLY', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { MEASURE: 'Median_Rent_Weekly', REGION: lgaCode }, '2021');

  const avgHhSize = lookupValue(data, { MEASURE: 'AVG_HHD_SIZE', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { MEASURE: 'Avg_Hhd_Size', REGION: lgaCode }, '2021');

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

export interface G33Data {
  separateHouse: number;
  semiDetached: number;
  flatOrApartment: number;
  other: number;
  totalDwellings: number;
}

export async function fetchG33(lgaCode: string): Promise<G33Data | null> {
  const url = `${ABS_BASE}/C21_G33_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  // G33 DWELLING_STRUCTURE codes vary - try common patterns
  // DS_1 or H_1_1 = Separate house, DS_2 = Semi-detached, DS_3 = Flat/apartment
  const separateHouse = lookupValue(data, { DWELLING_STRUCTURE: 'DS_1', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { DWELLING_STRUCTURE: '1', REGION: lgaCode }, '2021') ?? 0;
  const semiDetached = lookupValue(data, { DWELLING_STRUCTURE: 'DS_2', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { DWELLING_STRUCTURE: '2', REGION: lgaCode }, '2021') ?? 0;
  const flatApt = lookupValue(data, { DWELLING_STRUCTURE: 'DS_3', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { DWELLING_STRUCTURE: '3', REGION: lgaCode }, '2021') ?? 0;
  const other = lookupValue(data, { DWELLING_STRUCTURE: 'DS_5', REGION: lgaCode }, '2021') ?? 0;

  const total = separateHouse + semiDetached + flatApt + other;
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

export interface G36Data {
  owned: number;       // Fully owned
  mortgage: number;    // Owned with mortgage
  rented: number;      // Rented
  other: number;
}

export async function fetchG36(lgaCode: string): Promise<G36Data | null> {
  const url = `${ABS_BASE}/C21_G36_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const owned = lookupValue(data, { TENURE_TYPE: 'TT_1', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { TENURE_TYPE: '1', REGION: lgaCode }, '2021') ?? 0;
  const mortgage = lookupValue(data, { TENURE_TYPE: 'TT_2', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { TENURE_TYPE: '2', REGION: lgaCode }, '2021') ?? 0;
  const rented = lookupValue(data, { TENURE_TYPE: 'TT_3', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { TENURE_TYPE: '3', REGION: lgaCode }, '2021') ?? 0;
  const other = lookupValue(data, { TENURE_TYPE: 'TT_5', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { TENURE_TYPE: '5', REGION: lgaCode }, '2021') ?? 0;

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

export interface G51Data {
  industries: Array<{ name: string; code: string; employed: number }>;
  totalEmployed: number;
}

const INDUSTRY_LABELS: Record<string, string> = {
  IND_1: 'Agriculture, Forestry & Fishing',
  IND_2: 'Mining',
  IND_3: 'Manufacturing',
  IND_4: 'Electricity, Gas, Water & Waste',
  IND_5: 'Construction',
  IND_6: 'Wholesale Trade',
  IND_7: 'Retail Trade',
  IND_8: 'Accommodation & Food Services',
  IND_9: 'Transport, Postal & Warehousing',
  IND_10: 'Information Media & Telecommunications',
  IND_11: 'Financial & Insurance Services',
  IND_12: 'Rental, Hiring & Real Estate',
  IND_13: 'Professional, Scientific & Technical',
  IND_14: 'Administrative & Support Services',
  IND_15: 'Public Administration & Safety',
  IND_16: 'Education & Training',
  IND_17: 'Health Care & Social Assistance',
  IND_18: 'Arts & Recreation Services',
  IND_19: 'Other Services',
};

export async function fetchG51(lgaCode: string): Promise<G51Data | null> {
  const url = `${ABS_BASE}/C21_G51_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const industries: G51Data['industries'] = [];
  let total = 0;

  for (const [code, name] of Object.entries(INDUSTRY_LABELS)) {
    const v = lookupValue(data, { INDUSTRY: code, SEX: '3', REGION: lgaCode }, '2021')
      ?? lookupValue(data, { INDUSTRY: code, REGION: lgaCode }, '2021') ?? 0;
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

export async function fetchG55(lgaCode: string): Promise<G55Data | null> {
  const url = `${ABS_BASE}/C21_G55_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const get = (methodCode: string) =>
    lookupValue(data, { METHOD_TRAVEL: methodCode, SEX: '3', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { METHOD_TRAVEL: methodCode, REGION: lgaCode }, '2021')
    ?? 0;

  // G55 method of travel codes
  const carDriver = get('MOT_1');
  const carPassenger = get('MOT_2');
  const train = get('MOT_3');
  const bus = get('MOT_4');
  const ferry = get('MOT_5');
  const tram = get('MOT_6');
  const bicycle = get('MOT_7');
  const walked = get('MOT_8');
  const workedHome = get('MOT_11');
  const other = get('MOT_12');

  const total = carDriver + carPassenger + train + bus + ferry + tram + bicycle + walked + workedHome + other;
  if (total === 0) return null;

  return {
    car_driver: Math.round(carDriver),
    car_passenger: Math.round(carPassenger),
    train: Math.round(train),
    bus: Math.round(bus),
    ferry: Math.round(ferry),
    tram: Math.round(tram),
    bicycle: Math.round(bicycle),
    walked: Math.round(walked),
    worked_home: Math.round(workedHome),
    other: Math.round(other),
    total: Math.round(total),
  };
}

// ─── SEIFA ───────────────────────────────────────────────────────────────────

export interface SEIFAData {
  irsd: number; // Index of Relative Socio-economic Disadvantage
  irsad: number; // Index of Relative Socio-economic Advantage and Disadvantage
  ier: number; // Index of Education and Occupation
  ieo: number; // Index of Economic Resources
}

export async function fetchSEIFA(lgaCode: string): Promise<SEIFAData | null> {
  const url = `${ABS_BASE}/SEIFA_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  // SEIFA measure codes
  const irsd = lookupValue(data, { MEASURE: 'IRSD', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { INDEX_TYPE: 'IRSD', REGION: lgaCode }, '2021');
  const irsad = lookupValue(data, { MEASURE: 'IRSAD', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { INDEX_TYPE: 'IRSAD', REGION: lgaCode }, '2021');
  const ier = lookupValue(data, { MEASURE: 'IER', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { INDEX_TYPE: 'IER', REGION: lgaCode }, '2021');
  const ieo = lookupValue(data, { MEASURE: 'IEO', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { INDEX_TYPE: 'IEO', REGION: lgaCode }, '2021');

  if (irsd === null) return null;

  return {
    irsd: Math.round(irsd ?? 1000),
    irsad: Math.round(irsad ?? 1000),
    ier: Math.round(ier ?? 1000),
    ieo: Math.round(ieo ?? 1000),
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
  // C21_G57_LGA: Census 2021 Table G57 — Labour Force Status by LGA
  // LFSF: 1=FT employed, 2=PT employed, 3=away from work, 4=unemployed FT, 5=unemployed PT,
  //        6=NILF, 7-10=other, _T=total, _N=not stated
  // FINF: family income — use _T (all incomes) to get aggregate counts
  const url = `${ABS_BASE}/C21_G57_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  // Sum employed across FT + PT + away from work (LFSF 1+2+3), aggregated over FINF=_T
  const employed =
    (lookupValue(data, { LFSF: '1', FINF: '_T', REGION: lgaCode }, '2021') ?? 0) +
    (lookupValue(data, { LFSF: '2', FINF: '_T', REGION: lgaCode }, '2021') ?? 0) +
    (lookupValue(data, { LFSF: '3', FINF: '_T', REGION: lgaCode }, '2021') ?? 0);

  // Sum unemployed (LFSF 4+5)
  const unemployed =
    (lookupValue(data, { LFSF: '4', FINF: '_T', REGION: lgaCode }, '2021') ?? 0) +
    (lookupValue(data, { LFSF: '5', FINF: '_T', REGION: lgaCode }, '2021') ?? 0);

  // Total civilian population 15+ (LFSF=_T, FINF=_T)
  const total = lookupValue(data, { LFSF: '_T', FINF: '_T', REGION: lgaCode }, '2021');

  if (total === null || total === 0) return null;

  const labourForce = employed + unemployed;
  return {
    unemploymentRate: labourForce > 0 ? (unemployed / labourForce) * 100 : 0,
    participationRate: (labourForce / total) * 100,
    employmentRate: (employed / total) * 100,
    dataYear: 2021,
  };
}

// ─── ERP (Estimated Resident Population) ─────────────────────────────────────

export interface ERPData {
  byYear: Record<number, number>; // year → population count
  latestYear: number;
}

export async function fetchERP(lgaCode: string): Promise<ERPData | null> {
  // ERP_LGA: Annual ERP by LGA
  const url = `${ABS_BASE}/ERP_LGA?startPeriod=2016&endPeriod=2023&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const byYear: Record<number, number> = {};
  let latestYear = 0;

  for (let year = 2016; year <= 2023; year++) {
    const v = lookupValue(data, { REGION: lgaCode, SEX: '3' }, year.toString())
      ?? lookupValue(data, { REGION: lgaCode }, year.toString());
    if (v !== null && v > 0) {
      byYear[year] = Math.round(v);
      latestYear = Math.max(latestYear, year);
    }
  }

  if (latestYear === 0) return null;

  return { byYear, latestYear };
}

// ─── G46: Highest Year of School Completed ───────────────────────────────────

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
  const url = `${ABS_BASE}/C21_G46_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const get = (code: string) =>
    lookupValue(data, { SCHOOLING: code, SEX: '3', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { SCHOOLING: code, REGION: lgaCode }, '2021')
    ?? 0;

  const yr12 = get('Y12');
  const yr11 = get('Y11');
  const yr10 = get('Y10');
  const yr9 = get('Y9');
  const yr8 = get('Y8OB');
  const ns = get('NS');

  const total = yr12 + yr11 + yr10 + yr9 + yr8 + ns;
  if (total === 0) return null;

  return {
    year12: Math.round(yr12),
    year11: Math.round(yr11),
    year10: Math.round(yr10),
    year9: Math.round(yr9),
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
  const url = `${ABS_BASE}/C21_G49_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const get = (code: string) =>
    lookupValue(data, { QUALIFICATION: code, SEX: '3', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { QUALIFICATION: code, REGION: lgaCode }, '2021')
    ?? 0;

  const pg = get('PGD');
  const gd = get('GD');
  const bach = get('BD');
  const adv = get('AVD');
  const c34 = get('C34');
  const c12 = get('C12');
  const nq = get('NQ');
  const ns = get('NS');

  const total = pg + gd + bach + adv + c34 + c12 + nq + ns;
  if (total === 0) return null;

  return {
    postgrad: Math.round(pg),
    grad_diploma: Math.round(gd),
    bachelor: Math.round(bach),
    adv_diploma: Math.round(adv),
    cert3_4: Math.round(c34),
    cert1_2: Math.round(c12),
    no_qualification: Math.round(nq),
    not_stated: Math.round(ns),
    total: Math.round(total),
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
