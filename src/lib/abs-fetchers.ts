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

export interface HistoricalDwellingStructureData {
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

// ─── G55 / G62 / G59 / B46: Method of Travel to Work ──────────────────────────
// NOTE: C21_G55_LGA is industry × hours worked — the wrong table for JTW.
// The correct 2021 table is C21_G62_LGA (fetched via fetchG62 below).
// Historical JTW data is fetched via fetchG59_2016 (ABS_C16_G59_LGA) and
// fetchB46_2011 (ABS_CENSUS2011_B46_LGA) for trend charts.
//
// There is no usable G55 SDMX endpoint at LGA level; fetchG55 is not implemented.

export interface JourneyToWorkData {
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

/** @deprecated Use JourneyToWorkData */
export type G55Data = JourneyToWorkData;

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

function buildQualificationData(parts: {
  postgrad: number;
  grad_diploma: number;
  bachelor: number;
  adv_diploma: number;
  cert3_4: number;
  cert1_2: number;
  no_qualification: number;
  not_stated: number;
  total: number;
}): QualificationData | null {
  if (parts.total === 0) return null;

  return {
    postgrad: Math.round(parts.postgrad),
    grad_diploma: Math.round(parts.grad_diploma),
    bachelor: Math.round(parts.bachelor),
    adv_diploma: Math.round(parts.adv_diploma),
    cert3_4: Math.round(parts.cert3_4),
    cert1_2: Math.round(parts.cert1_2),
    no_qualification: Math.round(parts.no_qualification),
    not_stated: Math.round(parts.not_stated),
    total: Math.round(parts.total),
  };
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

  return buildQualificationData({
    postgrad: pg,
    grad_diploma: gd,
    bachelor: bach,
    adv_diploma: adv,
    cert3_4: c34,
    cert1_2: c12,
    no_qualification: nq,
    not_stated: ns,
    total,
  });
}

export async function fetchG49_2016(lgaCode: string): Promise<QualificationData | null> {
  // ABS_C16_G49_LGA: Non-school qualification by occupation by sex (2016)
  // Use OCCP_C16=Z (all occupations) and SEX_ABS=3 (persons).
  const url = `${ABS_BASE}/ABS_C16_G49_LGA?startPeriod=2016&endPeriod=2016&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;

  const data = parseSdmxXml(xml);

  const get = (code: string) =>
    lookupValue(data, { QALLP_C16: code, SEX_ABS: '3', OCCP_C16: 'Z', LGA_2016: lgaCode }, '2016') ?? 0;

  return buildQualificationData({
    postgrad: get('1'),
    grad_diploma: get('2'),
    bachelor: get('3'),
    adv_diploma: get('51'),
    cert3_4: get('4'),
    cert1_2: get('52'),
    no_qualification: get('0'),
    not_stated: get('_N'),
    total: get('TOT'),
  });
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
  // C21_G34_LGA: Number of motor vehicles (VEHD) by dwelling structure (DWTSTRD)
  // VEHD codes: 0=no vehicles, 1=1 vehicle, 2=2 vehicles, 3=3 or more, _T=total
  const url = `${ABS_BASE}/C21_G34_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;
  const data = parseSdmxXml(xml);

  const get = (vehd: string) =>
    lookupValue(data, { VEHD: vehd, DWTSTRD: '_T', REGION: lgaCode }, '2021')
    ?? sumValues(data, { VEHD: vehd, REGION: lgaCode }, '2021');

  const none  = get('0');
  const one   = get('1');
  const two   = get('2');
  const three = get('3');
  const total = get('_T');

  const computed = none + one + two + three;
  if (total === 0 && computed === 0) return null;

  return {
    noCar:          Math.round(none),
    oneCar:         Math.round(one),
    twoCars:        Math.round(two),
    threePlusCars:  Math.round(three),
    totalDwellings: Math.round(total > 0 ? total : computed),
  };
}

// ─── G62: Method of Travel to Work (corrected table) ─────────────────────────
// Attempts C21_G62_LGA — the Census table for MTWP × sex.
// Returns the same JourneyToWorkData type.
//
// Confirmed MTWP codes (verified against live API for Sydney LGA 17200, 2026-04-01):
//   Hierarchical totals (include all trips using that mode, incl. combinations):
//     T_1 = all car trips (driver or passenger, alone or combined)
//     233 = all train trips (alone or combined with other modes)
//     234 = all bus trips (alone or combined)
//     232 = all ferry/tram/light rail trips (alone or combined)
//   Single-mode codes:
//     6   = car as driver only
//     2   = car as passenger only
//     5   = bicycle only
//     10  = walked only
//     14  = worked at home
//     11  = taxi, 12 = ride-share, 13 = other
//     _T  = total workers (all modes, grand total)

export async function fetchG62(lgaCode: string): Promise<JourneyToWorkData | null> {
  const url = `${ABS_BASE}/C21_G62_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;
  const data = parseSdmxXml(xml);

  const get = (mtwp: string) =>
    lookupValue(data, { MTWP: mtwp, SEXP: '3', REGION: lgaCode }, '2021')
    ?? sumValues(data, { MTWP: mtwp, REGION: lgaCode }, '2021');

  // Use hierarchical totals for PT modes (count all trips using that mode).
  // Use single-mode codes for car driver, bicycle, walked, worked at home.
  const car_driver    = get('6');   // car driver only (single mode)
  const car_passenger = get('2');   // car passenger only (single mode)
  const train         = get('233'); // hierarchical: all trips using train
  const bus           = get('234'); // hierarchical: all trips using bus
  const ferry         = get('232'); // hierarchical: all trips using ferry/tram/light rail
  const tram          = 0;          // included in ferry (code 232) above
  const bicycle       = get('5');
  const walked        = get('10');
  const worked_home   = get('14');
  const other_raw     = get('11') + get('12') + get('13'); // taxi + ride-share + other
  const total         = lookupValue(data, { MTWP: '_T', SEXP: '3', REGION: lgaCode }, '2021')
    ?? sumValues(data, { MTWP: '_T', REGION: lgaCode }, '2021');

  if (total === 0) return null;

  return {
    car_driver:    Math.round(car_driver),
    car_passenger: Math.round(car_passenger),
    train:         Math.round(train),
    bus:           Math.round(bus),
    ferry:         Math.round(ferry),
    tram:          Math.round(tram),
    bicycle:       Math.round(bicycle),
    walked:        Math.round(walked),
    worked_home:   Math.round(worked_home),
    other:         Math.round(other_raw),
    total:         Math.round(total),
  };
}

// ─── G59: 2016 Census Method of Travel to Work (ABS_C16_G59_LGA) ─────────────
//
// Dataset: ABS_C16_G59_LGA — Census 2016 LGA G59 Method of Travel to Work by Sex
// Dimension: MTWP_C16 (region dim: LGA_2016, sex dim: SEX_ABS)
//
// Confirmed MTWP_C16 codes (verified against Sydney LGA 17200):
//   6   = car, as driver
//   2   = car, as passenger
//   233 = train (hierarchical: all trips using train)
//   234 = bus (hierarchical: all trips using bus)
//   232 = ferry/tram/light rail (hierarchical)
//   5   = bicycle only
//   10  = walked only
//   14  = worked at home
//   TOT = total workers (grand total)
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

  const total = get('TOT');
  if (!total || total === 0) return null;

  return {
    car_driver:    Math.round(get('6')   ?? 0),
    car_passenger: Math.round(get('2')   ?? 0),
    train:         Math.round(get('233') ?? 0),
    bus:           Math.round(get('234') ?? 0),
    ferry:         Math.round(get('232') ?? 0),
    tram:          0,
    bicycle:       Math.round(get('5')   ?? 0),
    walked:        Math.round(get('10')  ?? 0),
    worked_home:   Math.round(get('14')  ?? 0),
    other:         0,
    total:         Math.round(total),
  };
}

// ─── B46: 2011 Census Method of Travel to Work (ABS_CENSUS2011_B46_LGA) ──────
//
// Dataset: ABS_CENSUS2011_B46_LGA — Census 2011 LGA B46 Method of Travel to Work by Sex
// Dimension: MTWP (zero-padded), region dim: REGION (with REGIONTYPE=LGA2011), MEASURE=3 (persons total)
//
// Confirmed MTWP codes (verified against Sydney REGION 17200):
//   006 = car, as driver
//   002 = car, as passenger
//   233 = train (hierarchical)
//   234 = bus (hierarchical)
//   232 = ferry/tram/light rail (hierarchical)
//   005 = bicycle only
//   010 = walked only
//   TOT = total workers (grand total)
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

  const total = get('TOT');
  if (!total || total === 0) return null;

  return {
    car_driver:    Math.round(get('006') ?? 0),
    car_passenger: Math.round(get('002') ?? 0),
    train:         Math.round(get('233') ?? 0),
    bus:           Math.round(get('234') ?? 0),
    ferry:         Math.round(get('232') ?? 0),
    tram:          0,
    bicycle:       Math.round(get('005') ?? 0),
    walked:        Math.round(get('010') ?? 0),
    worked_home:   0,
    other:         0,
    total:         Math.round(total),
  };
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
    lookupValue(data, { ASSNP: assnp, SEXP: '3', AGEP: '_T', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { ASSNP: assnp, SEXP: '3', REGION: lgaCode }, '2021')
    ?? sumValues(data, { ASSNP: assnp, REGION: lgaCode }, '2021');

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
// HIND codes: 1=negative, 2=nil, 3=$1-$149, 4=$150-$299, 5=$300-$399, 6=$400-$499,
//             7=$500-$649, 8=$650-$799, 9=$800-$999, 10=$1000-$1249, 11=$1250-$1499,
//             12=$1500-$1749, 13=$1750-$1999, 14=$2000-$2499, 15=$2500-$2999,
//             16=$3000-$3499, 17=$3500-$3999, 18=$4000+, _T=total

const HIND_LABELS: Record<string, string> = {
  '1':  'Negative income',
  '2':  'Nil income',
  '3':  '$1–$149/wk',
  '4':  '$150–$299/wk',
  '5':  '$300–$399/wk',
  '6':  '$400–$499/wk',
  '7':  '$500–$649/wk',
  '8':  '$650–$799/wk',
  '9':  '$800–$999/wk',
  '10': '$1,000–$1,249/wk',
  '11': '$1,250–$1,499/wk',
  '12': '$1,500–$1,749/wk',
  '13': '$1,750–$1,999/wk',
  '14': '$2,000–$2,499/wk',
  '15': '$2,500–$2,999/wk',
  '16': '$3,000–$3,499/wk',
  '17': '$3,500–$3,999/wk',
  '18': '$4,000+/wk',
};

export interface HouseholdIncomeData {
  incomeRanges: { label: string; count: number }[];
  lowIncomeHouseholds: number;  // codes 1–6: <$500/wk
  highIncomeHouseholds: number; // codes 14–18: $2,000+/wk
  total: number;
}

export async function fetchG33Income(lgaCode: string): Promise<HouseholdIncomeData | null> {
  const url = `${ABS_BASE}/C21_G33_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;
  const data = parseSdmxXml(xml);

  const get = (hind: string) =>
    lookupValue(data, { HIND: hind, HHCD: '_T', REGION: lgaCode }, '2021')
    ?? sumValues(data, { HIND: hind, REGION: lgaCode }, '2021');

  const total = get('_T');
  if (total === 0) return null;

  const incomeRanges = Object.entries(HIND_LABELS).map(([code, label]) => ({
    label,
    count: Math.round(get(code)),
  }));

  const lowIncome  = ['1','2','3','4','5','6'].reduce((s, c) => s + get(c), 0);
  const highIncome = ['14','15','16','17','18'].reduce((s, c) => s + get(c), 0);

  return {
    incomeRanges,
    lowIncomeHouseholds:  Math.round(lowIncome),
    highIncomeHouseholds: Math.round(highIncome),
    total: Math.round(total),
  };
}

// ─── G13: Language Spoken at Home ─────────────────────────────────────────────
// C21_G13_LGA: Language spoken at home (LANP) × English proficiency (ENGLP) × sex

const LANP_LABELS: Record<string, string> = {
  '1201': 'English',
  '7101': 'Mandarin',
  '4202': 'Arabic',
  '7201': 'Cantonese',
  '7104': 'Cantonese',
  '9201': 'Vietnamese',
  '5101': 'Hindi',
  '5107': 'Urdu',
  '5203': 'Punjabi',
  '6301': 'Korean',
  '6402': 'Thai',
  '6504': 'Indonesian',
  '6902': 'Tamil',
  '3101': 'Greek',
  '3106': 'Spanish',
  '9101': 'Tagalog / Filipino',
  '9401': 'Korean',
  '4601': 'Italian',
  '4901': 'Spanish',
  '5301': 'Punjabi',
  '5601': 'Nepali',
  '5501': 'Bengali',
  '4701': 'French',
  '3401': 'Croatian',
  '6201': 'Japanese',
  '8101': 'Portuguese',
};

function isDetailedAbsCode(code: string): boolean {
  return /^\d{4}$/.test(code);
}

function sanitiseNamedGroups(
  groups: Array<{ name: string; code: string; count: number }>,
  labels: Record<string, string>,
  otherLabel: string,
): Array<{ name: string; code: string; count: number }> {
  const known: Array<{ name: string; code: string; count: number }> = [];
  let otherCount = 0;

  for (const group of groups) {
    if (group.count <= 0) continue;
    const code = String(group.code);

    if (!isDetailedAbsCode(code)) {
      otherCount += group.count;
      continue;
    }

    const label = labels[code];
    if (!label) {
      otherCount += group.count;
      continue;
    }

    known.push({
      name: label,
      code,
      count: Math.round(group.count),
    });
  }

  known.sort((a, b) => b.count - a.count);

  if (otherCount > 0) {
    known.push({
      name: otherLabel,
      code: 'other',
      count: Math.round(otherCount),
    });
  }

  known.sort((a, b) => b.count - a.count);

  return known;
}

function selectTopDetailedNamedGroups(
  entries: Array<[string, number]>,
  labels: Record<string, string>,
  otherLabel: string,
  limit: number,
  excludedCodes: string[] = []
): Array<{ name: string; code: string; count: number }> {
  const excluded = new Set(excludedCodes);
  const labelledDetailed = entries
    .filter(([code, count]) => count > 0 && !excluded.has(code) && isDetailedAbsCode(code) && Boolean(labels[code]))
    .sort((a, b) => b[1] - a[1]);

  const topDetailed = labelledDetailed.slice(0, limit);
  const selectedCodes = new Set(topDetailed.map(([code]) => code));

  const groups = topDetailed.map(([code, count]) => ({
    name: labels[code],
    code,
    count: Math.round(count),
  }));

  let otherCount = 0;
  for (const [code, count] of entries) {
    if (count <= 0 || excluded.has(code)) continue;
    if (!isDetailedAbsCode(code) || !labels[code] || !selectedCodes.has(code)) {
      otherCount += count;
    }
  }

  if (otherCount > 0) {
    groups.push({
      name: otherLabel,
      code: 'other',
      count: Math.round(otherCount),
    });
  }

  groups.sort((a, b) => b.count - a.count);
  return groups;
}

export interface LanguageData {
  englishOnly: number;
  languageGroups: { name: string; code: string; count: number }[];
  limitedEnglish: number; // speaks a LOTE and English not well/not at all
  total: number;
}

export function sanitiseLanguageGroups(
  groups: Array<{ name: string; code: string; count: number }>
): Array<{ name: string; code: string; count: number }> {
  return sanitiseNamedGroups(groups, LANP_LABELS, 'Other languages');
}

export function selectTopDetailedLanguageGroups(
  languageEntries: Array<[string, number]>,
  limit = 12
): Array<{ name: string; code: string; count: number }> {
  return selectTopDetailedNamedGroups(languageEntries, LANP_LABELS, 'Other languages', limit, ['1201']);
}

export function normaliseLanguageData(data: LanguageData): LanguageData {
  const entries = data.languageGroups.map(group => [String(group.code), Number(group.count) || 0] as [string, number]);
  return {
    ...data,
    languageGroups: selectTopDetailedLanguageGroups(entries, 12),
  };
}

export async function fetchG13(lgaCode: string): Promise<LanguageData | null> {
  // ENGLP codes: 1=speaks English only, 2=very well, 3=well, 4=not well, 5=not at all
  const url = `${ABS_BASE}/C21_G13_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;
  const data = parseSdmxXml(xml);

  const total = lookupValue(data, { LANP: '_T', ENGLP: '_T', SEXP: '3', REGION: lgaCode }, '2021')
    ?? sumValues(data, { SEXP: '3', REGION: lgaCode }, '2021');
  if (total === 0) return null;

  // Extract all LANP counts for Persons at this LGA
  const langCounts = new Map<string, number>();
  for (const [key, value] of Array.from(data.entries())) {
    const kd = parseKey(key);
    if (kd['REGION'] !== lgaCode) continue;
    if (kd['SEXP'] !== '3') continue;
    if (normaliseTime(kd['TIME_PERIOD'] ?? '') !== '2021') continue;
    const lanp = kd['LANP'];
    if (!lanp || lanp === '_T') continue;
    const englp = kd['ENGLP'];
    if (!englp || englp === '_T') continue;
    langCounts.set(lanp, (langCounts.get(lanp) ?? 0) + value);
  }

  if (langCounts.size === 0) return null;

  const englishOnly   = langCounts.get('1201') ?? 0;
  const limitedEnglish = sumValues(data, { SEXP: '3', ENGLP: '4', REGION: lgaCode }, '2021')
    + sumValues(data, { SEXP: '3', ENGLP: '5', REGION: lgaCode }, '2021');

  const languageGroups = selectTopDetailedLanguageGroups(Array.from(langCounts.entries()));

  return {
    englishOnly:     Math.round(englishOnly),
    languageGroups,
    limitedEnglish:  Math.round(limitedEnglish),
    total:           Math.round(total),
  };
}

// ─── G09: Country of Birth (Detailed) ─────────────────────────────────────────
// C21_G09_LGA: Country of birth (BPLP) × sex by LGA

const BPLP_LABELS: Record<string, string> = {
  '1101': 'Australia',
  '6101': 'China (excl. SARs)',
  '5101': 'India',
  '1201': 'England',
  '6201': 'Philippines',
  '9201': 'Vietnam',
  '6301': 'South Korea',
  '4302': 'Lebanon',
  '2201': 'New Zealand',
  '5201': 'Sri Lanka',
  '1202': 'Scotland',
  '4101': 'Italy',
  '9301': 'Indonesia',
  '3101': 'Greece',
  '9402': 'Malaysia',
  '5301': 'Pakistan',
  '5501': 'Bangladesh',
  '4201': 'Egypt',
  '1103': 'South Africa',
  '4301': 'Iraq',
  '5401': 'Nepal',
  '7201': 'Japan',
  '4701': 'France',
  '4901': 'Spain',
};

export interface BirthplaceData {
  birthplaceGroups: { name: string; code: string; count: number }[];
  bornAustralia: number;
  bornOverseas: number;
  total: number;
}

export function sanitiseBirthplaceGroups(
  groups: Array<{ name: string; code: string; count: number }>
): Array<{ name: string; code: string; count: number }> {
  return sanitiseNamedGroups(groups, BPLP_LABELS, 'Other countries');
}

export function selectTopDetailedBirthplaceGroups(
  birthplaceEntries: Array<[string, number]>,
  limit = 15
): Array<{ name: string; code: string; count: number }> {
  return selectTopDetailedNamedGroups(birthplaceEntries, BPLP_LABELS, 'Other countries', limit, ['1101']);
}

export function normaliseBirthplaceData(data: BirthplaceData): BirthplaceData {
  const entries = data.birthplaceGroups.map(group => [String(group.code), Number(group.count) || 0] as [string, number]);
  return {
    ...data,
    birthplaceGroups: selectTopDetailedBirthplaceGroups(entries, 15),
  };
}

export async function fetchG09(lgaCode: string): Promise<BirthplaceData | null> {
  const url = `${ABS_BASE}/C21_G09_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;
  const data = parseSdmxXml(xml);

  const total = lookupValue(data, { BPLP: '_T', SEXP: '3', REGION: lgaCode }, '2021')
    ?? sumValues(data, { SEXP: '3', REGION: lgaCode }, '2021');
  if (total === 0) return null;

  const bplpCounts = new Map<string, number>();
  for (const [key, value] of Array.from(data.entries())) {
    const kd = parseKey(key);
    if (kd['REGION'] !== lgaCode) continue;
    if (kd['SEXP'] !== '3') continue;
    if (normaliseTime(kd['TIME_PERIOD'] ?? '') !== '2021') continue;
    const bplp = kd['BPLP'];
    if (!bplp || bplp === '_T') continue;
    bplpCounts.set(bplp, (bplpCounts.get(bplp) ?? 0) + value);
  }

  if (bplpCounts.size === 0) return null;

  const bornAustralia = bplpCounts.get('1101') ?? 0;
  const bornOverseas  = total - bornAustralia;

  const birthplaceGroups = selectTopDetailedBirthplaceGroups(Array.from(bplpCounts.entries()));

  return {
    birthplaceGroups,
    bornAustralia: Math.round(bornAustralia),
    bornOverseas:  Math.round(bornOverseas),
    total:         Math.round(total),
  };
}

// ─── G25: Family Composition ──────────────────────────────────────────────────

export interface FamilyData {
  coupleWithChildren: number;
  coupleNoChildren: number;
  oneParentFamily: number;
  otherFamily: number;
  lonePersonHousehold: number;
  groupHousehold: number;
  totalHouseholds: number;
}

export async function fetchG25(lgaCode: string): Promise<FamilyData | null> {
  // NOTE: C21_G25_LGA is unpaid care (UNCAREP), not family composition.
  // C21_G32_LGA has HHCD (household composition) × NPRD (number of persons).
  // HHCD codes in G32/G35: 1_2=family households, 3=non-family, _T=total
  // A dedicated family type × composition breakdown is not directly available
  // as a single SDMX table at LGA level via the REST API.
  // Attempt C21_G32_LGA for aggregate household type counts.
  const url = `${ABS_BASE}/C21_G32_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`;
  const xml = await fetchWithRetry(url);
  if (!xml) return null;
  const data = parseSdmxXml(xml);

  // Try HHCD dimension first, then FMCF fallback
  const get = (code: string) =>
    lookupValue(data, { HHCD: code, REGION: lgaCode }, '2021')
    ?? lookupValue(data, { FMCF: code, REGION: lgaCode }, '2021')
    ?? sumValues(data, { HHCD: code, REGION: lgaCode }, '2021');

  const coupleChild   = get('2');
  const coupleNoChild = get('1');
  const oneParent     = get('3');
  const other         = get('4');
  const lonePerson    = get('5');
  const group         = get('6');
  const total         = get('_T');

  const computed = coupleChild + coupleNoChild + oneParent + other + lonePerson + group;
  if (total === 0 && computed === 0) return null;

  return {
    coupleWithChildren:  Math.round(coupleChild),
    coupleNoChildren:    Math.round(coupleNoChild),
    oneParentFamily:     Math.round(oneParent),
    otherFamily:         Math.round(other),
    lonePersonHousehold: Math.round(lonePerson),
    groupHousehold:      Math.round(group),
    totalHouseholds:     Math.round(total > 0 ? total : computed),
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
    lookupValue(data, { OCCP: occp, SEXP: sexp, AGEP: '_T', REGION: lgaCode }, '2021')
    ?? lookupValue(data, { OCCP: occp, SEXP: sexp, REGION: lgaCode }, '2021')
    ?? sumValues(data, { OCCP: occp, SEXP: sexp, REGION: lgaCode }, '2021');

  const occupations = Object.entries(OCCP_LABELS).map(([code, name]) => ({
    name,
    code,
    employed: Math.round(get(code, '3')),
    male:     Math.round(get(code, '1')),
    female:   Math.round(get(code, '2')),
  })).filter(o => o.employed > 0);

  const total = occupations.reduce((s, o) => s + o.employed, 0);
  if (total === 0) return null;

  return {
    occupations: occupations.sort((a, b) => b.employed - a.employed),
    total,
  };
}

// ─── G43 / G44: Housing Stress ────────────────────────────────────────────────
// G43 (C21_G43_LGA): Rent-to-income ratio for renting households
// G44 (C21_G44_LGA): Mortgage repayment-to-income ratio for mortgage households
// "Housing stress" threshold = 30%+ of income on housing costs
// RIND / MRIND codes: 1=<10%, 2=10–20%, 3=20–30%, 4=30%+, _N=not stated, _T=total

export interface HousingStressData {
  rentStressRate: number;     // % of renting households at 30%+ rent burden
  mortgageStressRate: number; // % of mortgage households at 30%+ repayment burden
  rentTotal: number;
  mortgageTotal: number;
}

export async function fetchHousingStress(lgaCode: string): Promise<HousingStressData | null> {
  const [xmlRent, xmlMortgage] = await Promise.all([
    fetchWithRetry(`${ABS_BASE}/C21_G43_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`),
    fetchWithRetry(`${ABS_BASE}/C21_G44_LGA?startPeriod=2021&endPeriod=2021&dimensionAtObservation=AllDimensions`),
  ]);

  let rentStressRate = 0, mortgageStressRate = 0, rentTotal = 0, mortgageTotal = 0;

  // C21_G43_LGA: Rent-to-income ratio (RLHP dimension)
  // RLHP codes: 1=<10%, 2=10-15%, 3=15-20%, 4=20-25%, 5=25-30%,
  //             6=30-35%, 7=35-40%, 8=40-50%, 9=50%+, _T=total
  // Housing stress threshold = 30%+ → codes 6, 7, 8, 9
  if (xmlRent) {
    const rentData = parseSdmxXml(xmlRent);
    const get = (rlhp: string) =>
      lookupValue(rentData, { RLHP: rlhp, REGION: lgaCode }, '2021')
      ?? sumValues(rentData, { RLHP: rlhp, REGION: lgaCode }, '2021');
    rentTotal = get('_T');
    const stressed = get('6') + get('7') + get('8') + get('9');
    if (rentTotal > 0) rentStressRate = Math.round((stressed / rentTotal) * 1000) / 10;
  }

  // C21_G44_LGA: Mortgage repayment by income (FINF dimension = family income ranges)
  // This table cross-tabs mortgage size × income, not directly a stress ratio.
  // We skip G44 for now as the stress calculation requires additional processing.
  void xmlMortgage;

  if (rentTotal === 0 && mortgageTotal === 0) return null;

  return {
    rentStressRate,
    mortgageStressRate,
    rentTotal:     Math.round(rentTotal),
    mortgageTotal: Math.round(mortgageTotal),
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
  housingStress: HousingStressData | null;
  buildingApprovals: BuildingApprovalsData | null;
  g59: JourneyToWorkData | null;  // 2016 JTW (ABS_C16_G59_LGA)
  b46: JourneyToWorkData | null;  // 2011 JTW (ABS_CENSUS2011_B46_LGA)
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
  const [g09, g25, g60, housingStress, buildingApprovals] = await Promise.all([
    fetchG09(lgaCode).catch(logWarn('G09')),
    fetchG25(lgaCode).catch(logWarn('G25')),
    fetchG60(lgaCode).catch(logWarn('G60')),
    fetchHousingStress(lgaCode).catch(logWarn('HOUSING_STRESS')),
    fetchBuildingApprovals(lgaCode).catch(logWarn('BUILDING_APPROVALS')),
  ]);

  await sleep(300);

  // Batch 6: Historical JTW for mode share trend (2016 and 2011) plus
  // historical qualification datasets for education trend charts.
  const [g59, b46, g49_2016] = await Promise.all([
    fetchG59_2016(lgaCode).catch(logWarn('G59')),
    fetchB46_2011(lgaCode).catch(logWarn('B46')),
    fetchG49_2016(lgaCode).catch(logWarn('G49_2016')),
  ]);

  return {
    lgaCode, g01, g02, g33, b31_2011, g36, g51, g55, g46, g15, g49, g49_2016, seifa, labour, erp,
    g34, g62, g18, g33Income, g13, g09, g25, g60, housingStress, buildingApprovals,
    g59, b46,
  };
}
