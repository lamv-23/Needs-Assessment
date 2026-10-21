/**
 * Journey-to-work MTWP decoding.
 *
 * Regression: fetchers previously read code 233 as "train", 234 as "bus" and
 * 232 as "ferry" — those are actually "worked at home", "did not go to work"
 * and "walked only" in every Census codelist (2011, 2016, 2021).
 */

import {
  decodeJourneyToWork,
  journeyToWorkBase,
  MTWP_CODES_2011,
  MTWP_CODES_2016,
  MTWP_CODES_2021,
} from '../lib/abs-fetchers';

// Shaped like C21_G62_LGA persons cells for City of Sydney (17200). Totals and
// the 232/233/234 cells are the published values; other cells are illustrative.
const SYDNEY_2021: Record<string, number> = {
  '1': 7139, '2': 3744, '3': 41, '4': 532, '5': 439, '6': 16297, '7': 1568,
  '8': 52, '9': 285, '10': 2035, '11': 1150, '232': 11722,
  '1_T': 694, '2_T': 448, '_2O': 296, '1_2O': 41, '2_2O': 21, '_3O': 23,
  '233': 66323, '234': 13786, '_N': 252, '_T': 126888,
};

const fromTable = (table: Record<string, number>) => (code: string) => table[code] ?? 0;

describe('decodeJourneyToWork', () => {
  const jtw = decodeJourneyToWork(fromTable(SYDNEY_2021), MTWP_CODES_2021)!;

  it('maps 233 to worked at home, 232 to walked, 234 to did not go to work', () => {
    expect(jtw.worked_home).toBe(66323);
    expect(jtw.walked).toBe(11722);
    expect(jtw.did_not_go_to_work).toBe(13786);
  });

  it('attributes multi-method trips to train first, then bus', () => {
    expect(jtw.train).toBe(7139 + 694 + 41);
    expect(jtw.bus).toBe(3744 + 448 + 21);
  });

  it('reads single-method codes for car, ferry, light rail and bicycle', () => {
    expect(jtw.car_driver).toBe(16297);
    expect(jtw.car_passenger).toBe(1568);
    expect(jtw.ferry).toBe(41);
    expect(jtw.tram).toBe(532);
    expect(jtw.bicycle).toBe(2035);
  });

  it('categories close to the total (within ABS perturbation)', () => {
    const { total, ...parts } = jtw;
    const sum = Object.values(parts).reduce((a, b) => a + (b ?? 0), 0);
    expect(Math.abs(sum - total)).toBeLessThanOrEqual(20);
  });

  it('mode share base excludes did-not-go-to-work and not-stated', () => {
    expect(journeyToWorkBase(jtw)).toBe(126888 - 13786 - 252);
  });

  it('returns null when the total is missing', () => {
    expect(decodeJourneyToWork(() => 0, MTWP_CODES_2021)).toBeNull();
  });
});

describe('MTWP codelists per Census vintage', () => {
  it('uses the same codes for worked at home / walked / did not go in all years', () => {
    for (const codes of [MTWP_CODES_2011, MTWP_CODES_2016, MTWP_CODES_2021]) {
      expect(codes.workedHome).toBe('233');
      expect(codes.walked).toBe('232');
      expect(codes.didNotGo).toBe('234');
    }
  });

  it('uses zero-padded single-method codes in 2011 only', () => {
    expect(MTWP_CODES_2011.train).toBe('001');
    expect(MTWP_CODES_2016.train).toBe('1');
    expect(MTWP_CODES_2021.train).toBe('1');
  });

  it('uses vintage-specific aggregate and total codes', () => {
    expect(MTWP_CODES_2021.total).toBe('_T');
    expect(MTWP_CODES_2016.total).toBe('TOT');
    expect(MTWP_CODES_2011.total).toBe('TOT');
    expect(MTWP_CODES_2021.trainAndOne).toBe('1_T');
    expect(MTWP_CODES_2016.trainAndOne).toBe('TA');
  });
});

describe('journeyToWorkBase with legacy cache rows', () => {
  it('falls back to total when did-not-go / not-stated are absent', () => {
    expect(journeyToWorkBase({
      car_driver: 1, car_passenger: 0, train: 0, bus: 0, ferry: 0, tram: 0,
      bicycle: 0, walked: 0, worked_home: 0, other: 0, total: 10,
    })).toBe(10);
  });
});
