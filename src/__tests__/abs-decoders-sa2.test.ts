/**
 * SA2 Census decoders: the LGA decoders in abs-fetchers.ts are reused for SA2s by
 * binding their getters to one region of the parsed SDMX map. These are pure
 * tests over a small fake ABS response with two SA2s (Mount Druitt - Whalan and
 * Kellyville Ridge - The Ponds), shaped like the C21_*_SA2 dataflows.
 *
 * decodeG18 and decodeSeifa were extracted from inline LGA code unchanged; their
 * tests use the City of Sydney (17200) cells that produced the cached LGA rows
 * in data/cache.db (abs_cache G18 / SEIFA).
 */

import {
  parseSdmxXml, lookupValue, decodeG01, decodeG18, decodeSeifa, type LabourData,
} from '../lib/abs-fetchers';
import {
  SA2_DATASETS, buildSa2Key, chunk, groupByRegion, decodeSa2Dataset,
} from '../lib/abs-sa2-fetchers';

const A = '116031317'; // Mount Druitt - Whalan
const B = '116021628'; // Kellyville Ridge - The Ponds

type Cell = [dims: Record<string, string>, value: number];

/** Build an SDMX-ML GenericData body like the ABS API's AllDimensions format. */
function sdmx(cells: Cell[]): string {
  const obs = cells.map(([dims, value]) => {
    const values = Object.entries({ TIME_PERIOD: '2021', ...dims })
      .map(([id, v]) => `<generic:Value id="${id}" value="${v}" />`).join('');
    return `<generic:Obs><generic:ObsKey>${values}</generic:ObsKey><generic:ObsValue value="${value}" />`
      + '<generic:Attributes><generic:Value id="UNIT_MEASURE" value="N" /></generic:Attributes></generic:Obs>';
  }).join('');
  return `<message:GenericData><message:DataSet>${obs}</message:DataSet></message:GenericData>`;
}

/** Parse, split by the dataset's region dimension and decode one SA2. */
function decode(dataset: Parameters<typeof decodeSa2Dataset>[0], cells: Cell[], sa2: string, regionDim = 'REGION') {
  const byRegion = groupByRegion(parseSdmxXml(sdmx(cells)), regionDim);
  return decodeSa2Dataset(dataset, byRegion.get(sa2) ?? new Map(), sa2);
}

describe('SA2_DATASETS', () => {
  it('lists the nine Census tables in the brief', () => {
    expect([...SA2_DATASETS]).toEqual(['G01', 'G02', 'G13', 'G18', 'G33_INCOME', 'G34', 'LABOUR', 'G62', 'SEIFA']);
  });
});

describe('buildSa2Key (dimension positions from each dataflow DSD, checked 2026-10-22)', () => {
  const codes = [A, B];

  it('puts the + joined SA2 codes in the REGION position', () => {
    // SEXP.PCHAR.REGION.REGION_TYPE.STATE
    expect(buildSa2Key('G01', codes)).toBe(`..${A}+${B}..`);
    // MEDAVG.REGION.REGION_TYPE.STATE
    expect(buildSa2Key('G02', codes)).toBe(`.${A}+${B}..`);
  });

  it('narrows only dimensions the decoder pins (persons, all ages, households)', () => {
    // SEXP.LANP.ENGLP.REGION.REGION_TYPE.STATE: persons; ENGLP _T (all) and 3 (not well / not at all)
    expect(buildSa2Key('G13', codes)).toBe(`3.._T+3.${A}+${B}..`);
    // SEXP.AGEP.ASSNP.REGION.REGION_TYPE.STATE
    expect(buildSa2Key('G18', codes)).toBe(`3._T..${A}+${B}..`);
    // HIND.HHCD.REGION.REGION_TYPE.STATE
    expect(buildSa2Key('G33_INCOME', codes)).toBe(`._T.${A}+${B}..`);
    // VEHD.SUM.REGION.REGION_TYPE.STATE: dwellings
    expect(buildSa2Key('G34', codes)).toBe(`.D.${A}+${B}..`);
    // SEXP.LFSP.AGEP.REGION.REGION_TYPE.STATE
    expect(buildSa2Key('LABOUR', codes)).toBe(`3.._T.${A}+${B}..`);
    // MTWP.SEXP.REGION.REGION_TYPE.STATE
    expect(buildSa2Key('G62', codes)).toBe(`.3.${A}+${B}..`);
  });

  it('uses ASGS_2021 and the SCORE measure for SEIFA', () => {
    // ASGS_2021.SEIFAINDEXTYPE.SEIFA_MEASURE
    expect(buildSa2Key('SEIFA', codes)).toBe(`${A}+${B}..SCORE`);
  });
});

describe('chunk', () => {
  it('splits into batches of at most n, keeping order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
  });
});

describe('groupByRegion', () => {
  it('splits one parsed response into a map per SA2', () => {
    const data = parseSdmxXml(sdmx([
      [{ MEDAVG: '1', REGION: A }, 31],
      [{ MEDAVG: '1', REGION: B }, 36],
      [{ MEDAVG: '4', REGION: B }, 2600],
    ]));
    const byRegion = groupByRegion(data, 'REGION');
    expect([...byRegion.keys()].sort()).toEqual([B, A].sort());
    expect(byRegion.get(A)!.size).toBe(1);
    expect(byRegion.get(B)!.size).toBe(2);
    expect(lookupValue(byRegion.get(B)!, { MEDAVG: '4', REGION: B }, '2021')).toBe(2600);
  });
});

describe('LGA decoders bound to REGION: <sa2>', () => {
  const data = parseSdmxXml(sdmx([
    [{ SEXP: '3', PCHAR: 'P_1', REGION: A }, 9000],
    [{ SEXP: '3', PCHAR: 'P_1', REGION: B }, 4000],
    [{ SEXP: '1', PCHAR: 'P_1', REGION: A }, 4400],
    [{ SEXP: '2', PCHAR: 'P_1', REGION: A }, 4600],
    [{ SEXP: '3', PCHAR: 'A_T', REGION: A }, 700],
    [{ SEXP: '3', PCHAR: 'A_T', REGION: B }, 40],
  ]));
  const get = (sa2: string) => (pchar: string, sexp: string) => lookupValue(data, { SEXP: sexp, PCHAR: pchar, REGION: sa2 }, '2021');

  it('decodeG01 returns each SA2 its own values', () => {
    expect(decodeG01(get(A))).toMatchObject({ totalPopulation: 9000, malePopulation: 4400, femalePopulation: 4600, indigenousPopulation: 700 });
    expect(decodeG01(get(B))).toMatchObject({ totalPopulation: 4000, indigenousPopulation: 40 });
  });

  it('decodeG01 returns null for an SA2 that is not in the response', () => {
    expect(decodeG01(get('101021007'))).toBeNull();
  });
});

describe('decodeG18 (CL_C21_ASSNP01) matches the inline LGA code it replaced', () => {
  // City of Sydney cells; abs_cache G18 for 17200 is
  // {"needsAssistance":5812,"doesNotNeedAssistance":190562,"notStated":15258,"total":211632,"rate":2.7}
  const sydney = { '1': 5812, '2': 190562, _N: 15258, _T: 211632 } as Record<string, number>;

  it('reads 1 = needs assistance, 2 = does not, _N = not stated, _T = total', () => {
    expect(decodeG18((assnp) => sydney[assnp] ?? null)).toEqual({
      needsAssistance: 5812, doesNotNeedAssistance: 190562, notStated: 15258, total: 211632, rate: 2.7,
    });
  });

  it('treats missing cells as 0 and an empty or missing total as no data', () => {
    expect(decodeG18((assnp) => ({ '1': 3, _T: 40 } as Record<string, number>)[assnp] ?? null))
      .toEqual({ needsAssistance: 3, doesNotNeedAssistance: 0, notStated: 0, total: 40, rate: 7.5 });
    expect(decodeG18(() => null)).toBeNull();
    expect(decodeG18((assnp) => (assnp === '_T' ? 0 : 5))).toBeNull();
  });
});

describe('decodeSeifa (SEIFAINDEXTYPE, SEIFA_MEASURE = SCORE) matches the inline LGA code it replaced', () => {
  // City of Sydney; abs_cache SEIFA for 17200 is {"irsd":1031,"irsad":1126,"ier":887,"ieo":1158}
  const sydney = { IRSD: 1031, IRSAD: 1126, IER: 887, IEO: 1158 } as Record<string, number>;

  it('reads the four index scores', () => {
    expect(decodeSeifa((index) => sydney[index] ?? null)).toEqual({ irsd: 1031, irsad: 1126, ier: 887, ieo: 1158 });
  });

  it('rounds fractional scores', () => {
    expect(decodeSeifa((index) => ({ IRSD: 1030.6, IRSAD: 1125.4, IER: 887.5, IEO: 1157.49 } as Record<string, number>)[index]))
      .toEqual({ irsd: 1031, irsad: 1125, ier: 888, ieo: 1157 });
  });

  it('defaults a missing secondary index to 1000 but returns null without IRSD', () => {
    expect(decodeSeifa((index) => (index === 'IRSD' ? 950 : null))).toEqual({ irsd: 950, irsad: 1000, ier: 1000, ieo: 1000 });
    expect(decodeSeifa((index) => (index === 'IRSD' ? null : 950))).toBeNull();
  });
});

describe('decodeSa2Dataset: one SA2 of a two-SA2 response per table', () => {
  it('G01 population', () => {
    const cells: Cell[] = [
      [{ SEXP: '3', PCHAR: 'P_1', REGION: A }, 9000], [{ SEXP: '3', PCHAR: 'P_1', REGION: B }, 4000],
      [{ SEXP: '1', PCHAR: 'P_1', REGION: A }, 4400], [{ SEXP: '2', PCHAR: 'P_1', REGION: A }, 4600],
      [{ SEXP: '3', PCHAR: '0_4', REGION: A }, 600],
    ];
    expect(decode('G01', cells, A)).toMatchObject({ totalPopulation: 9000, malePopulation: 4400, ageGroups: { '0_4': 600 } });
    expect(decode('G01', cells, B)).toMatchObject({ totalPopulation: 4000, malePopulation: 0 });
  });

  it('G02 medians', () => {
    const cells: Cell[] = [
      [{ MEDAVG: '1', REGION: A }, 31], [{ MEDAVG: '4', REGION: A }, 1500], [{ MEDAVG: '6', REGION: A }, 400],
      [{ MEDAVG: '1', REGION: B }, 36], [{ MEDAVG: '4', REGION: B }, 3000], [{ MEDAVG: '8', REGION: B }, 3.4],
    ];
    expect(decode('G02', cells, A)).toMatchObject({ medianAge: 31, medianWeeklyHouseholdIncome: 1500, medianWeeklyRent: 400 });
    expect(decode('G02', cells, B)).toMatchObject({ medianAge: 36, medianWeeklyHouseholdIncome: 3000, averageHouseholdSize: 3.4 });
  });

  it('G13 language, using the codelist for labels', () => {
    const cells: Cell[] = [
      [{ SEXP: '3', LANP: '_T', ENGLP: '_T', REGION: A }, 9000], [{ SEXP: '3', LANP: '1', ENGLP: '_T', REGION: A }, 5000],
      [{ SEXP: '3', LANP: '_T', ENGLP: '3', REGION: A }, 300], [{ SEXP: '3', LANP: '4202', ENGLP: '_T', REGION: A }, 900],
      [{ SEXP: '3', LANP: '_T', ENGLP: '_T', REGION: B }, 4000], [{ SEXP: '3', LANP: '1', ENGLP: '_T', REGION: B }, 3500],
    ];
    const byRegion = groupByRegion(parseSdmxXml(sdmx(cells)), 'REGION');
    const codelist = [
      { id: '_T', name: 'Total' }, { id: '1', name: 'Speaks English only' },
      { id: 'O_T', name: 'Other Languages Total' }, { id: '4202', name: 'Arabic', parent: 'O_T' },
    ];
    const a = decodeSa2Dataset('G13', byRegion.get(A)!, A, codelist);
    const b = decodeSa2Dataset('G13', byRegion.get(B)!, B, codelist);
    expect(a).toMatchObject({ englishOnly: 5000, limitedEnglish: 300, total: 9000 });
    expect(a).toMatchObject({ languageGroups: [{ name: 'Arabic', code: '4202', count: 900 }] });
    expect(b).toMatchObject({ englishOnly: 3500, limitedEnglish: 0, total: 4000, languageGroups: [] });
  });

  it('G18 need for assistance', () => {
    const cells: Cell[] = [
      [{ SEXP: '3', AGEP: '_T', ASSNP: '_T', REGION: A }, 9000], [{ SEXP: '3', AGEP: '_T', ASSNP: '1', REGION: A }, 900],
      [{ SEXP: '3', AGEP: '_T', ASSNP: '_T', REGION: B }, 4000], [{ SEXP: '3', AGEP: '_T', ASSNP: '1', REGION: B }, 100],
    ];
    expect(decode('G18', cells, A)).toMatchObject({ needsAssistance: 900, total: 9000, rate: 10 });
    expect(decode('G18', cells, B)).toMatchObject({ needsAssistance: 100, total: 4000, rate: 2.5 });
  });

  it('G33_INCOME household income bands (HHCD = _T)', () => {
    const cells: Cell[] = [
      [{ HIND: '_T', HHCD: '_T', REGION: A }, 3000], [{ HIND: '1', HHCD: '_T', REGION: A }, 200], [{ HIND: '17', HHCD: '_T', REGION: A }, 100],
      [{ HIND: '_T', HHCD: '_T', REGION: B }, 1400], [{ HIND: '17', HHCD: '_T', REGION: B }, 500],
      [{ HIND: '17', HHCD: '3', REGION: B }, 77], // other household composition must be ignored
    ];
    expect(decode('G33_INCOME', cells, A)).toMatchObject({ total: 3000, lowIncomeHouseholds: 200, highIncomeHouseholds: 100 });
    expect(decode('G33_INCOME', cells, B)).toMatchObject({ total: 1400, lowIncomeHouseholds: 0, highIncomeHouseholds: 500 });
  });

  it('G34 vehicles (SUM = D dwellings)', () => {
    const cells: Cell[] = [
      [{ VEHD: 'V_T', SUM: 'D', REGION: A }, 3000], [{ VEHD: '0', SUM: 'D', REGION: A }, 400], [{ VEHD: '1', SUM: 'D', REGION: A }, 1200],
      [{ VEHD: '0', SUM: 'P', REGION: A }, 999], // persons, not dwellings
      [{ VEHD: 'V_T', SUM: 'D', REGION: B }, 1400], [{ VEHD: '4', SUM: 'D', REGION: B }, 200],
    ];
    expect(decode('G34', cells, A)).toMatchObject({ noCar: 400, oneCar: 1200, totalDwellings: 3000 });
    expect(decode('G34', cells, B)).toMatchObject({ noCar: 0, threePlusCars: 200, totalDwellings: 1400 });
  });

  it('LABOUR force status (persons, all ages)', () => {
    const cells: Cell[] = [
      [{ SEXP: '3', LFSP: '_T', AGEP: '_T', REGION: A }, 7000], [{ SEXP: '3', LFSP: '5', AGEP: '_T', REGION: A }, 3500],
      [{ SEXP: '3', LFSP: '8', AGEP: '_T', REGION: A }, 500], [{ SEXP: '3', LFSP: '9', AGEP: '_T', REGION: A }, 4000],
      [{ SEXP: '3', LFSP: '_T', AGEP: '_T', REGION: B }, 3000],
    ];
    const a = decode('LABOUR', cells, A) as LabourData;
    expect(a).toMatchObject({ employed: 3500, unemployed: 500, labourForce: 4000, persons15Plus: 7000 });
    expect(a.unemploymentRate).toBeCloseTo(12.5, 6);
    expect(decode('LABOUR', cells, B)).toMatchObject({ employed: 0, persons15Plus: 3000, unemploymentRate: 0 });
  });

  it('G62 journey to work (MTWP_CODES_2021)', () => {
    const cells: Cell[] = [
      [{ MTWP: '_T', SEXP: '3', REGION: A }, 4000], [{ MTWP: '6', SEXP: '3', REGION: A }, 2500],
      [{ MTWP: '1', SEXP: '3', REGION: A }, 300], [{ MTWP: '1_T', SEXP: '3', REGION: A }, 50], [{ MTWP: '233', SEXP: '3', REGION: A }, 400],
      [{ MTWP: '_T', SEXP: '3', REGION: B }, 2200], [{ MTWP: '6', SEXP: '3', REGION: B }, 1200],
    ];
    expect(decode('G62', cells, A)).toMatchObject({ car_driver: 2500, train: 350, worked_home: 400, total: 4000 });
    expect(decode('G62', cells, B)).toMatchObject({ car_driver: 1200, train: 0, total: 2200 });
  });

  it('SEIFA scores use the ASGS_2021 region dimension', () => {
    const cells: Cell[] = [
      [{ ASGS_2021: A, SEIFAINDEXTYPE: 'IRSD', SEIFA_MEASURE: 'SCORE' }, 868],
      [{ ASGS_2021: A, SEIFAINDEXTYPE: 'IRSAD', SEIFA_MEASURE: 'SCORE' }, 873],
      [{ ASGS_2021: A, SEIFAINDEXTYPE: 'IER', SEIFA_MEASURE: 'SCORE' }, 900],
      [{ ASGS_2021: A, SEIFAINDEXTYPE: 'IEO', SEIFA_MEASURE: 'SCORE' }, 880],
      [{ ASGS_2021: A, SEIFAINDEXTYPE: 'IRSD', SEIFA_MEASURE: 'RWAD' }, 1], // a decile, not the score
      [{ ASGS_2021: B, SEIFAINDEXTYPE: 'IRSD', SEIFA_MEASURE: 'SCORE' }, 1120],
    ];
    expect(decode('SEIFA', cells, A, 'ASGS_2021')).toEqual({ irsd: 868, irsad: 873, ier: 900, ieo: 880 });
    expect(decode('SEIFA', cells, B, 'ASGS_2021')).toEqual({ irsd: 1120, irsad: 1000, ier: 1000, ieo: 1000 });
  });

  it('returns null for an SA2 with no cells (e.g. No usual address has no dwellings)', () => {
    expect(decode('G34', [[{ VEHD: 'V_T', SUM: 'D', REGION: A }, 3000]], B)).toBeNull();
  });
});
