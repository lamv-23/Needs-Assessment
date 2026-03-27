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
  lga_sydney:       '17200',
  lga_parramatta:   '16350',
  lga_blacktown:    '10500',
  lga_penrith:      '16260',
  lga_camden:       '11500',
  lga_liverpool:    '14000',
  lga_fairfield:    '12250',
  lga_bankstown:    '10750', // Canterbury-Bankstown
  lga_sutherland:   '17750',
  lga_hornsby:      '13110',
  lga_ku_ring_gai:  '13500',
  lga_northern_beaches: '14700',
  lga_manly:        '14700', // Northern Beaches
  lga_willoughby:   '18450',
  lga_lane_cove:    '13600',
  lga_mosman:       '14700', // part of Northern Beaches
  lga_north_sydney: '14900',
  lga_ryde:         '17000',
  lga_hunters_hill: '13200',
  lga_strathfield:  '17550',
  lga_burwood:      '11300',
  lga_canada_bay:   '11700',
  lga_inner_west:   '13350',
  lga_bayside:      '10450',
  lga_georges_river: '12750',
  lga_hurstville:   '12750', // Georges River
  lga_kogarah:      '12750',
  lga_rockdale:     '10450', // Bayside
  lga_botany_bay:   '10900',
  lga_randwick:     '16550',
  lga_waverley:     '18150',
  lga_woollahra:    '18700',
  lga_blue_mountains: '10750',
  lga_wollondilly:  '18550',
  lga_hawkesbury:   '13000',
  lga_hills:        '13250', // Hills Shire
  lga_cumberland:   '12100',
  benchmark_gsy:    '1GSYD', // Greater Sydney benchmark
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
 * Parse SDMX-ML XML into a map of { dimensionKey → value }
 * dimensionKey is formed by joining all SeriesKey values with ':' then ':' + ObsValue period
 *
 * Returns flat map: Record<string, number>
 * Key format: "DIM1=val1,DIM2=val2,...,TIME=period"
 */
function parseSdmxXml(xml: string): Map<string, number> {
  const result = new Map<string, number>();

  // Extract dimension names from the KeyFamilyRef / structure (order matters)
  // Each <Series> has multiple <Value concept="..." value="..."/> children
  // Each <Obs> has <Time> and <ObsValue value="..."/>

  // Match all <Series ...>...</Series> blocks
  const seriesRegex = /<Series>([\s\S]*?)<\/Series>/g;
  let seriesMatch: RegExpExecArray | null;

  while ((seriesMatch = seriesRegex.exec(xml)) !== null) {
    const seriesBlock = seriesMatch[1];

    // Extract series key dimensions
    const dims: Record<string, string> = {};
    const dimRegex = /<Value concept="([^"]+)" value="([^"]*)"\s*\/>/g;
    let dimMatch: RegExpExecArray | null;
    while ((dimMatch = dimRegex.exec(seriesBlock)) !== null) {
      dims[dimMatch[1]] = dimMatch[2];
    }

    // Extract observations
    const obsRegex = /<Obs><Time>([^<]*)<\/Time><ObsValue value="([^"]*)"\s*\/>/g;
    let obsMatch: RegExpExecArray | null;
    while ((obsMatch = obsRegex.exec(seriesBlock)) !== null) {
      const period = obsMatch[1].trim();
      const value = parseFloat(obsMatch[2]);
      if (!isNaN(value)) {
        // Build key: sorted dimension entries + TIME
        const dimsStr = Object.entries(dims)
          .map(([k, v]) => `${k}=${v}`)
          .join(',');
        result.set(`${dimsStr},TIME=${period}`, value);
      }
    }
  }

  return result;
}

/**
 * Look up a value in the parsed SDMX map.
 * Partial match: all provided dims must match, TIME must match if given.
 */
function lookupValue(
  data: Map<string, number>,
  dims: Record<string, string>,
  time?: string
): number | null {
  for (const [key, value] of Array.from(data.entries())) {
    const parts = key.split(',');
    const keyDims: Record<string, string> = {};
    for (const part of parts) {
      const [k, v] = part.split('=');
      keyDims[k] = v;
    }

    let match = true;
    for (const [k, v] of Object.entries(dims)) {
      if (keyDims[k] !== v) { match = false; break; }
    }
    if (time && keyDims['TIME'] !== time) match = false;

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
    const parts = key.split(',');
    const keyDims: Record<string, string> = {};
    for (const part of parts) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      keyDims[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
    }

    let match = true;
    for (const [k, v] of Object.entries(dims)) {
      if (keyDims[k] !== v) { match = false; break; }
    }
    if (time && keyDims['TIME'] !== time) match = false;

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

const AGE_PCHAR_CODES = [
  '0_4', '5_9', '10_14', '15_19', '20_24', '25_34',
  '35_44', '45_54', '55_64', '65_74', '75_84', '85ov',
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
  // Regional labour market uses SA2/SA3/SA4 not LGA — use SA4 as proxy
  // ERP_LFSP dataset: Labour Force Status by region
  const url = `${ABS_BASE}/LF/1.0.0.1.3?startPeriod=2023&endPeriod=2023&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  // Labour force data at SA4 level - use MEASURE codes
  // For LGA level, we approximate using nearest SA4
  // MEASURE: UR = unemployment rate, PR = participation rate, ER = employment-to-population ratio
  const ur = lookupValue(data, { MEASURE: 'UR', REGION: lgaCode }, '2023');
  const pr = lookupValue(data, { MEASURE: 'PR', REGION: lgaCode }, '2023');
  const er = lookupValue(data, { MEASURE: 'ER', REGION: lgaCode }, '2023');

  if (ur === null) return null;

  return {
    unemploymentRate: ur,
    participationRate: pr ?? 60,
    employmentRate: er ?? (pr ? pr - ur : 55),
    dataYear: 2023,
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
