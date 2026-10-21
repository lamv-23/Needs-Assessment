/**
 * G01 (Selected person characteristics) PCHAR decoding.
 *
 * Regression: totalPopulation read PCHAR S_1, which in CL_C21_PCHAR01 is
 * "Highest year of school completed: Year 12" — total persons is P_1. The
 * Indigenous count summed I_1..I_3, which do not exist (A_2..A_4 / A_T do).
 */

import { decodeG01 } from '../lib/abs-fetchers';

// Shaped like C21_G01_LGA cells for City of Sydney (17200). P_1/S_1 persons and
// the age groups are the published values; male/female P_1 and A_T are illustrative.
const CELLS: Record<string, Record<string, number>> = {
  '3': {
    P_1: 211632, S_1: 156613, A_T: 2645, B_11: 94475, B_O: 102929, L_1201: 122000,
    '0_4': 7460, '5_14': 8569, '15_19': 5287, '20_24': 21572, '25_34': 68112, '35_44': 39461,
    '45_54': 22838, '55_64': 17940, '65_74': 12378, '75_84': 5972, GE85: 2037,
  },
  '1': { P_1: 108796, S_1: 81420 },
  '2': { P_1: 102836, S_1: 75196 },
};
const get = (pchar: string, sex: string) => CELLS[sex]?.[pchar] ?? null;

describe('decodeG01', () => {
  const g01 = decodeG01(get)!;

  it('reads total, male and female persons from P_1, not S_1 (Year 12 completion)', () => {
    expect(g01.totalPopulation).toBe(211632);
    expect(g01.malePopulation).toBe(108796);
    expect(g01.femalePopulation).toBe(102836);
  });

  it('reads the Aboriginal and/or Torres Strait Islander total from A_T', () => {
    expect(g01.indigenousPopulation).toBe(2645);
  });

  it('total persons matches the sum of age groups', () => {
    const ageSum = Object.values(g01.ageGroups).reduce((a, b) => a + b, 0);
    expect(Math.abs(ageSum - g01.totalPopulation)).toBeLessThan(20);
  });

  it('returns null when the LGA has no total persons cell', () => {
    expect(decodeG01(() => null)).toBeNull();
  });
});
