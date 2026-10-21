/**
 * ABS Census 2021 decoders — codes checked against the official codelists
 * (data.api.abs.gov.au, 2026-10-22). Regression: each fetcher previously read a
 * code with a different official meaning (see the per-test notes).
 *
 * Fixtures are shaped like the ABS cells for City of Sydney (17200) / Blacktown
 * (10750). Totals and the cells named in each regression note are the values the
 * API returns; other cells are illustrative.
 */

import {
  decodeG02, decodeG33, decodeG34, decodeG36, decodeG51, decodeLabour, decodeQualifications,
} from '../lib/abs-fetchers';

const from = (cells: Record<string, number>) => (code: string) => cells[code] ?? null;

describe('decodeLabour (CL_C21_LFHRP01)', () => {
  // Was: unemployed = code 4, which is "Employed, hours of work not stated".
  const labour = decodeLabour(from({ '4': 1742, '5': 126889, '8': 7468, '9': 134357, '10': 58000, _T: 195604 }))!;

  it('uses 8 = unemployed total and 9 = labour force (matches ABS G43 rates)', () => {
    expect(labour.unemploymentRate).toBeCloseTo(5.56, 2);
    expect(labour.participationRate).toBeCloseTo(68.69, 2);
    expect(labour.employmentRate).toBeCloseTo(64.87, 2);
  });

  it('keeps counts so rates can be aggregated across LGAs', () => {
    expect(labour).toMatchObject({ employed: 126889, unemployed: 7468, labourForce: 134357, persons15Plus: 195604 });
  });
});

describe('decodeG02 (CL_C21_MEDAVG01)', () => {
  // Was: household income = 2 (personal income), mortgage = 3 (family income).
  const g02 = decodeG02(from({ '1': 34, '2': 1241, '3': 3057, '4': 2212, '5': 2700, '6': 550, '8': 1.9 }))!;

  it('reads household income from 4 and mortgage from 5', () => {
    expect(g02.medianWeeklyHouseholdIncome).toBe(2212);
    expect(g02.medianMonthlyMortgage).toBe(2700);
  });

  it('keeps age, rent and household size', () => {
    expect(g02).toMatchObject({ medianAge: 34, medianWeeklyRent: 550, averageHouseholdSize: 1.9 });
  });
});

describe('decodeG33 dwelling structure (CL_C21_DWTSTRD02)', () => {
  // Was: total = _T, which includes unoccupied dwellings (N_OCC).
  const g33 = decodeG33(from({ '11': 2053, '2': 17887, '3': 76728, '9': 586, _N: 489, OCC: 97743, N_OCC: 18733, _T: 116478 }))!;

  it('uses occupied private dwellings (OCC) as the total', () => {
    expect(g33.totalDwellings).toBe(97743);
    const shares = (g33.separateHouse + g33.semiDetached + g33.flatOrApartment + g33.other) / g33.totalDwellings;
    expect(shares).toBeGreaterThan(0.99);
  });
});

describe('decodeG36 tenure (CL_C21_TENLLD01)', () => {
  // Was: rented = 3, which is "Rented: Real estate agent" only.
  const g36 = decodeG36(from({ '1': 26000, '2': 49000, R_T: 41592, '3': 28223, '4': 7073, '5': 758, '9': 900 }))!;

  it('counts all rentals (R_T), including social housing', () => {
    expect(g36.rented).toBe(41592);
  });
});

describe('decodeG34 vehicles (CL_C21_VEHD01)', () => {
  // Was: 3+ vehicles = 3 only (4 = "four or more" dropped); total included not stated.
  const g34 = decodeG34(from({ '0': 8045, '1': 40000, '2': 49204, '3': 14648, '4': 7523, _N: 1918, V_T: 119420, _T: 121338 }))!;

  it('combines 3 and 4+ vehicles', () => {
    expect(g34.threePlusCars).toBe(14648 + 7523);
  });

  it('uses dwellings with vehicles stated (V_T) so shares sum to 100%', () => {
    expect(g34.totalDwellings).toBe(119420);
    expect(g34.noCar + g34.oneCar + g34.twoCars + g34.threePlusCars).toBe(119420);
  });
});

describe('decodeG51 industry (C21_G54_LGA, CL_C21_INDP03)', () => {
  it('ranks industries and uses INDP _T (all employed) as the total', () => {
    const g51 = decodeG51(from({ G: 17453, Q: 25900, M: 12950, _N: 9882, _T: 174929 }))!;
    expect(g51.totalEmployed).toBe(174929);
    expect(g51.industries.map((i) => i.code)).toEqual(['Q', 'G', 'M']);
  });
});

describe('decodeQualifications (CL_C21_QALLP02 / CL_C16_QALLP)', () => {
  // Was: adv_diploma = 51 and cert3_4 = 4 (swapped); "no qualification" = 0 (inadequately described).
  const q = decodeQualifications(
    from({ '1': 31649, '2': 5547, '3': 65657, '4': 18735, '51': 11669, '52': 900, '50': 2468, '0': 1700, _N: 17185, _T: 155510 }),
    { notStated: '_N', total: '_T' },
  )!;

  it('reads 4 as advanced diploma/diploma and 51 as certificate III/IV', () => {
    expect(q.adv_diploma).toBe(18735);
    expect(q.cert3_4).toBe(11669);
  });

  it('keeps inadequately described separate from not stated', () => {
    expect(q).toMatchObject({ inadequately_described: 1700, not_stated: 17185, cert_nfd: 2468, total: 155510 });
  });

  it('uses the 2016 not-stated and total codes', () => {
    const q16 = decodeQualifications(from({ '3': 57191, Z: 27612, TOT: 145559 }), { notStated: 'Z', total: 'TOT' })!;
    expect(q16).toMatchObject({ bachelor: 57191, not_stated: 27612, total: 145559 });
  });
});
