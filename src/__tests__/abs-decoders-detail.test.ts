/**
 * Demographic-detail decoders. Codes and names follow the official ABS codelists
 * (CL_C21_BPLP11, CL_C21_LANP02, CL_C21_ENGLP02, CL_C21_FMCF02, CL_C21_HHCD01,
 * CL_C21_NPRD02, CL_C21_HIND02). Regressions: hand-written label maps had most
 * codes mislabelled (e.g. 7101/7104 Cantonese/Mandarin swapped, Australia '1101'
 * instead of '11'), counts summed totals with their parts, and families were read
 * from arbitrary income-band cells.
 *
 * Fixtures are shaped like City of Sydney (17200) / Blacktown (10750) cells; the
 * totals and named top groups are values the ABS API returns, others illustrative.
 */

import {
  decodeG09, decodeG13, decodeG25, decodeG33Income, selectTopGroups, type CodelistEntry,
} from '../lib/abs-fetchers';

const LANP: CodelistEntry[] = [
  { id: '_T', name: 'Total' },
  { id: '1', name: 'Speaks English only', parent: '_T' },
  { id: 'O_T', name: 'Other Languages Total', parent: '_T' },
  { id: '71', name: 'Chinese: Total', parent: 'O_T' },
  { id: '7101', name: 'Chinese: Cantonese', parent: '71' },
  { id: '7104', name: 'Chinese: Mandarin', parent: '71' },
  { id: '6402', name: 'Thai', parent: 'O_T' },
  { id: '_O', name: 'Other', parent: 'O_T' },
  { id: '_N', name: 'Not stated', parent: '_T' },
];

describe('selectTopGroups', () => {
  it('counts leaf codes only, never their subtotals', () => {
    const counts = new Map([['71', 24219], ['7101', 6006], ['7104', 18213], ['6402', 5900], ['_O', 9000]]);
    expect(selectTopGroups(counts, LANP, { within: 'O_T', limit: 2, otherLabel: 'Other languages', otherCodes: ['_O'] })).toEqual([
      { name: 'Chinese: Mandarin', code: '7104', count: 18213 },
      { name: 'Other languages', code: 'other', count: 5900 + 9000 },
      { name: 'Chinese: Cantonese', code: '7101', count: 6006 },
    ]);
  });
});

describe('decodeG13 language', () => {
  const cells: Record<string, number> = {
    '_T|_T': 211632, '1|_T': 122723, '_T|3': 10835, '_T|4': 74000,
    '71|_T': 24219, '7101|_T': 6006, '7104|_T': 18213, '6402|_T': 5900, '_O|_T': 9000, '_N|_T': 14909,
  };
  const g13 = decodeG13((lanp, englp) => cells[`${lanp}|${englp}`] ?? null, LANP)!;

  it('reads English only from LANP 1 and limited English from ENGLP 3', () => {
    expect(g13.englishOnly).toBe(122723);
    expect(g13.limitedEnglish).toBe(10835);
  });

  it('uses official names (group prefix dropped), so Mandarin is 7104', () => {
    expect(g13.languageGroups[0]).toEqual({ name: 'Mandarin', code: '7104', count: 18213 });
  });
});

describe('decodeG09 country of birth', () => {
  const BPLP: CodelistEntry[] = [
    { id: '_T', name: 'Total' },
    { id: '11', name: 'Australia', parent: '_T' },
    { id: '6101', name: 'China (excludes SARs and Taiwan)', parent: '_T' },
    { id: '2102', name: 'England', parent: '_T' },
    { id: '1201', name: 'New Zealand', parent: '_T' },
    { id: '_O', name: 'Other', parent: '_T' },
    { id: '_N', name: 'Not stated', parent: '_T' },
  ];
  const cells: Record<string, number> = { _T: 211632, '11': 94475, '6101': 16583, '2102': 10100, '1201': 5700, _O: 70000, _N: 14774 };
  const g09 = decodeG09((code) => cells[code] ?? null, BPLP)!;

  it('reads Australia from BPLP 11 and excludes not stated from born overseas', () => {
    expect(g09.bornAustralia).toBe(94475);
    expect(g09.bornOverseas).toBe(211632 - 94475 - 14774);
  });

  it('lists overseas countries with official names, other countries bucketed', () => {
    expect(g09.birthplaceGroups.map((g) => g.name)).toEqual([
      'Other countries', 'China (excludes SARs and Taiwan)', 'England', 'New Zealand',
    ]);
  });
});

describe('decodeG25 families and households', () => {
  const fam: Record<string, number> = { '1': 29833, '2': 10863, '3': 4609, '9': 1400, _T: 46705 };
  const hhCells: Record<string, number> = { '_T|_T': 97743, '1_2|_T': 46287, '3|1': 40160, '3|_T': 51452 };
  const g25 = decodeG25((c) => fam[c] ?? null, (h, n) => hhCells[`${h}|${n}`] ?? null)!;

  it('reads family types from FMCF with all incomes (FINF _T)', () => {
    expect(g25).toMatchObject({ coupleNoChildren: 29833, coupleWithChildren: 10863, oneParentFamily: 4609, otherFamily: 1400, totalFamilies: 46705 });
  });

  it('derives lone-person and group households from non-family households by size', () => {
    expect(g25).toMatchObject({ familyHouseholds: 46287, lonePersonHousehold: 40160, groupHousehold: 11292, totalHouseholds: 97743 });
  });
});

describe('decodeG33Income bands', () => {
  // Was: labels shifted one band (1 = negative, 2 = nil), 18 "partial income" shown as $4,000+.
  const cells: Record<string, number> = { _T: 97743, '1': 3000, '2': 1500, '3': 2000, '4': 2200, '5': 2284, '6': 2600, '13': 9000, '14': 8000, '15': 7000, '16': 5400, '17': 22616, '18': 3564 };
  const income = decodeG33Income((c) => cells[c] ?? null)!;

  it('labels 17 as $4,000+ and leaves partial income (18) out of the bands', () => {
    const last = income.incomeRanges[income.incomeRanges.length - 1];
    expect(last).toEqual({ label: '$4,000+/wk', count: 22616 });
    expect(income.incomeRanges).toHaveLength(17);
  });

  it('defines low income as under $500/wk (1–5) and high as $2,000+ (13–17)', () => {
    expect(income.lowIncomeHouseholds).toBe(3000 + 1500 + 2000 + 2200 + 2284);
    expect(income.highIncomeHouseholds).toBe(9000 + 8000 + 7000 + 5400 + 22616);
  });
});
