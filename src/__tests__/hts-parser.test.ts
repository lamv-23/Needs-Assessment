import { parseHtsWorkbookRows, tripsPerPerson, summariseTravelSurvey, type HTSLgaData, type HTSModeKey } from '../lib/hts-parser';

const known = new Set(['17200', '10750']);

describe('parseHtsWorkbookRows', () => {
  it('maps HH_LGA_ID to ABS LGA code (+10000) and reports unknown LGAs', () => {
    const { byLgaCode, unmatched } = parseHtsWorkbookRows({
      mode: [
        { financial_year: '2024/25', hh_lga_id: 7200, hh_lga_name: 'Sydney', travel_mode: 'Walk only', trips_by_mode: 430000, mode_share: 51.1, trip_avg_distance: 0.8, trip_avg_time: 12.9 },
        { financial_year: '2024/25', hh_lga_id: 9999, hh_lga_name: 'Nowhere', travel_mode: 'Walk only', trips_by_mode: 1, mode_share: 1 },
      ],
      purpose: [],
      demographics: [],
    }, known);
    expect(Object.keys(byLgaCode)).toEqual(['17200']);
    expect(byLgaCode['17200'].lgaName).toBe('Sydney');
    expect(unmatched).toEqual(['Nowhere (19999)']);
  });

  it('strips reliability flags from mode, purpose and LGA labels', () => {
    const { byLgaCode } = parseHtsWorkbookRows({
      mode: [
        { financial_year: '2023/24', hh_lga_id: 750, hh_lga_name: 'Blacktown^', travel_mode: 'Public transport*', trips_by_mode: 50000, mode_share: 5 },
        { financial_year: '2023/24', hh_lga_id: 750, hh_lga_name: 'Blacktown^', travel_mode: 'Other**', trips_by_mode: 1000, mode_share: 0.1 },
      ],
      purpose: [
        { financial_year: '2023/24', hh_lga_id: 750, hh_lga_name: 'Blacktown^', travel_purpose: 'social visits/recreation*', journeys_by_mode: 90000, pct_of_total_journeys: 20 },
        { financial_year: '2023/24', hh_lga_id: 750, hh_lga_name: 'Blacktown^', travel_purpose: '#N/A', journeys_by_mode: 5, pct_of_total_journeys: 0 },
      ],
      demographics: [],
    }, known);
    const year = byLgaCode['10750'].years[0];
    expect(byLgaCode['10750'].lgaName).toBe('Blacktown');
    expect(year.lgaTotalReliable).toBe(false);
    expect(year.modes.find(m => m.mode === 'publicTransport')?.reliability).toBe('use_with_caution');
    expect(year.modes.find(m => m.mode === 'other')?.reliability).toBe('unreliable');
    expect(year.purposes).toEqual([
      { purpose: 'Social/recreation', journeys: 90000, share: 20, avgDistanceKm: null, avgTimeMin: null, reliability: 'use_with_caution' },
    ]);
  });

  it('combines pre-2020 Bus + Train into public transport with trip-weighted averages', () => {
    const { byLgaCode } = parseHtsWorkbookRows({
      mode: [
        { financial_year: '2019/20', hh_lga_id: 7200, hh_lga_name: 'Sydney', travel_mode: 'Bus', trips_by_mode: 100, mode_share: 10, trip_avg_distance: 4, trip_avg_time: 20 },
        { financial_year: '2019/20', hh_lga_id: 7200, hh_lga_name: 'Sydney', travel_mode: 'Train*', trips_by_mode: 300, mode_share: 30, trip_avg_distance: 12, trip_avg_time: 40 },
        { financial_year: '2019/20', hh_lga_id: 7200, hh_lga_name: 'Sydney', travel_mode: 'Vehicle Driver', trips_by_mode: 600, mode_share: 60, trip_avg_distance: 10, trip_avg_time: 20 },
      ],
      purpose: [],
      demographics: [{ financial_year: '2019/20', hh_lga_id: 7200, population: 240000 }],
    }, known);
    const year = byLgaCode['17200'].years[0];
    const pt = year.modes.find(m => m.mode === 'publicTransport')!;
    expect(pt).toMatchObject({ trips: 400, modeShare: 40, avgDistanceKm: 10, avgTimeMin: 35, reliability: 'use_with_caution' });
    expect(year.modes.find(m => m.mode === 'vehicleDriver')?.label).toBe('Vehicle driver');
    expect(year.population).toBe(240000);
  });

  it('sorts years ascending and sums linked journeys across purposes', () => {
    const purpose = (fy: string, p: string, n: number) =>
      ({ financial_year: fy, hh_lga_id: 7200, hh_lga_name: 'Sydney', travel_purpose: p, journeys_by_mode: n, pct_of_total_journeys: 50 });
    const { byLgaCode } = parseHtsWorkbookRows({
      mode: [],
      purpose: [purpose('2024/25', 'Commute', 10), purpose('2024/25', 'Shopping', 30), purpose('2022/23', 'commute', 5)],
      demographics: [],
    }, known);
    const years = byLgaCode['17200'].years;
    expect(years.map(y => y.financialYear)).toEqual(['2022/23', '2024/25']);
    expect(years[0].purposes[0].purpose).toBe('Commute');
    expect(years[1].totalJourneys).toBe(40);
  });
});

describe('tripsPerPerson', () => {
  it('prefers the survey population, else ERP for the financial year end, else latest earlier ERP', () => {
    const year = { financialYear: '2024/25', totalJourneys: 700000, population: null } as const;
    expect(tripsPerPerson({ ...year, population: 200000 }, null)).toBe(3.5);
    expect(tripsPerPerson(year, { 2024: 100000, 2025: 200000 })).toBe(3.5);
    expect(tripsPerPerson(year, { 2023: 175000, 2024: 200000 })).toBe(3.5);
    expect(tripsPerPerson(year, null)).toBeNull();
    expect(tripsPerPerson({ ...year, totalJourneys: 0 }, { 2025: 1 })).toBeNull();
  });
});

describe('summariseTravelSurvey', () => {
  const mode = (m: HTSModeKey, share: number) =>
    ({ mode: m, label: m, trips: 1, modeShare: share, avgDistanceKm: null, avgTimeMin: null, reliability: 'reliable' as const });
  const lga: HTSLgaData = {
    lgaName: 'Sydney',
    years: [
      { financialYear: '2019/20', lgaTotalReliable: true, modes: [mode('vehicleDriver', 30), mode('vehiclePassenger', 10), mode('publicTransport', 20), mode('walkOnly', 35), mode('other', 5)], purposes: [], totalJourneys: 300, population: 100 },
      { financialYear: '2024/25', lgaTotalReliable: false, modes: [mode('vehicleDriver', 20), mode('publicTransport', 15), mode('walkOnly', 50), mode('walkLinked', 0), mode('other', 15)], purposes: [], totalJourneys: 800, population: null },
      { financialYear: '2025/26', lgaTotalReliable: true, modes: [], purposes: [], totalJourneys: 0, population: null },
    ],
  };

  it('uses the latest year with mode data, drops walk-linked and builds the trend', () => {
    const s = summariseTravelSurvey(lga, { 2025: 200 })!;
    expect(s.latestYear).toBe('2024/25');
    expect(s.lgaTotalReliable).toBe(false);
    expect(s.tripsPerPerson).toBe(4);
    expect(s.modes.map(m => m.mode)).not.toContain('walkLinked');
    expect(s.modeShareTrend).toEqual([
      { financialYear: '2019/20', car: 40, publicTransport: 20, walk: 35, other: 5 },
      { financialYear: '2024/25', car: 20, publicTransport: 15, walk: 50, other: 15 },
    ]);
  });

  it('returns null when no year has mode data', () => {
    expect(summariseTravelSurvey({ lgaName: 'X', years: [] }, null)).toBeNull();
  });
});
