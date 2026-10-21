import * as XLSX from 'xlsx';
import {
  buildHtsCommuteData,
  buildStationPatronage,
  htsLgaIdToAbsCode,
  parseHtsLgaWorkbook,
  parseHtsReliability,
  parseStationUsageCsv,
  pickHtsLgaResources,
  pickStationUsageResource,
  stationMatchKey,
  STATION_LGA_OVERRIDES,
} from '../lib/tfnsw-official';

function workbook(sheet: string, rows: Record<string, unknown>[]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('HTS commute parsing', () => {
  it('maps HTS LGA ids to ABS codes', () => {
    expect(htsLgaIdToAbsCode(7200)).toBe('17200');
    expect(htsLgaIdToAbsCode('750')).toBe('10750');
  });

  it('reads RSE flags from category labels', () => {
    expect(parseHtsReliability('Commute')).toBe('reliable');
    expect(parseHtsReliability('Commute*')).toBe('use_with_caution');
    expect(parseHtsReliability('Commute**')).toBe('unreliable');
  });

  it('parses uppercase (2020–25) and lowercase (2009–19) headers, commute rows only', () => {
    const newer = parseHtsLgaWorkbook(workbook('Data by Purpose', [
      { FINANCIAL_YEAR: '2024/25', HH_LGA_ID: 7200, HH_LGA_NAME: 'Sydney', TRAVEL_PURPOSE: 'Commute',
        JOURNEYS_BY_MODE: 123000, JOURNEY_AVG_DISTANCE: 5.9, JOURNEY_AVG_TIME: 26.9 },
      { FINANCIAL_YEAR: '2024/25', HH_LGA_ID: 7200, HH_LGA_NAME: 'Sydney', TRAVEL_PURPOSE: 'Shopping',
        JOURNEYS_BY_MODE: 1, JOURNEY_AVG_DISTANCE: 1, JOURNEY_AVG_TIME: 1 },
    ]));
    const older = parseHtsLgaWorkbook(workbook('Data by Purpose', [
      { financial_year: '2019/20', hh_lga_id: 7200, hh_lga_name: 'Sydney', travel_purpose: 'commute*',
        journeys_by_purpose: 227000, journey_avg_distance: 7.1, journey_avg_time: 29 },
    ]));

    expect(newer.get('17200')).toEqual([
      { financialYear: '2024/25', avgMinutes: 26.9, avgKm: 5.9, journeys: 123000, reliability: 'reliable' },
    ]);
    expect(older.get('17200')?.[0]).toMatchObject({ financialYear: '2019/20', avgMinutes: 29, reliability: 'use_with_caution' });
  });

  it('merges workbooks chronologically and skips unreliable points for latest', () => {
    const data = buildHtsCommuteData([
      new Map([['17200', [{ financialYear: '2019/20', avgMinutes: 29, avgKm: 7, journeys: 1, reliability: 'reliable' as const }]]]),
      new Map([['17200', [
        { financialYear: '2024/25', avgMinutes: 40, avgKm: 7, journeys: 1, reliability: 'unreliable' as const },
        { financialYear: '2023/24', avgMinutes: 27.8, avgKm: 5.5, journeys: 1, reliability: 'reliable' as const },
      ]]]),
    ]).get('17200')!;

    expect(data.series.map((p) => p.financialYear)).toEqual(['2019/20', '2023/24', '2024/25']);
    expect(data.latest?.financialYear).toBe('2023/24');
  });
});

describe('Station entries/exits parsing', () => {
  const csv = [
    'MonthYear,Station,Station_Type,Entry_Exit,Trip',
    '2026-08-01 00:00:00.000,Parramatta  Station,Train,Entry,1000',
    '2026-08-01 00:00:00.000,Parramatta  Station,Train,Exit,900',
    '2026-09-01 00:00:00.000,Parramatta  Station,Train,Entry,1100',
    '2026-09-01 00:00:00.000,Westmead Light Rail,Light rail,Entry,Less than 50',
    '2026-09-01 00:00:00.000,UNKNOWN,Train,Entry,5',
  ].join('\n');

  it('normalises names, treats "Less than 50" as suppressed and drops UNKNOWN', () => {
    const rows = parseStationUsageCsv(csv);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      month: '2026-08', station: 'Parramatta Station', stationType: 'Train',
      direction: 'entry', trips: 1000, suppressed: false,
    });
    expect(rows[3]).toMatchObject({ station: 'Westmead Light Rail', trips: 0, suppressed: true });
  });

  it('aggregates by LGA with monthly series, 12-month entries and station ranking', () => {
    const rows = parseStationUsageCsv(csv);
    const data = buildStationPatronage(rows, () => '16260').get('16260')!;
    expect(data.months).toEqual([
      { month: '2026-08', entries: 1000, exits: 900 },
      { month: '2026-09', entries: 1100, exits: 0 },
    ]);
    expect(data.latest12mEntries).toBe(2100);
    expect(data.latest12mPeriod).toEqual({ from: '2026-08', to: '2026-09' });
    expect(data.stations[0]).toEqual({ name: 'Parramatta Station', type: 'Train', entries12m: 2100 });
    expect(data.suppressedCells).toBe(1);
  });

  it('skips stations with no LGA', () => {
    expect(buildStationPatronage(parseStationUsageCsv(csv), () => null).size).toBe(0);
  });
});

describe('Station name matching', () => {
  it('matches GTFS platform and street-suffixed names to station usage names', () => {
    expect(stationMatchKey('Parramatta Station Platform 1')).toBe(stationMatchKey('Parramatta  Station'));
    expect(stationMatchKey('Parramatta Station, Platform 2')).toBe('parramatta station');
    expect(stationMatchKey("Paddy's Markets Light Rail, Darling Dr")).toBe(stationMatchKey("Paddy's Market Light Rail"));
  });

  it('override keys are already in match-key form', () => {
    for (const key of Object.keys(STATION_LGA_OVERRIDES)) {
      expect(stationMatchKey(key)).toBe(key);
    }
  });
});

describe('CKAN resource selection', () => {
  it('picks HTS LGA workbooks and the current (not discontinued) station CSV', () => {
    const resources = [
      { name: 'Household Travel Survey 2020/21-2024/25 - Data by LGA', format: 'XLSX', url: 'a.xlsx' },
      { name: 'Household Travel Survey 2020/21-2024/25 - Data by SA3', format: 'XLSX', url: 'b.xlsx' },
      { name: 'Household Travel By LGA Dashboard', format: 'visualisation', url: 'c' },
      { name: 'Train and Metro Station Monthly Usage - NO LONGER UPDATED', format: 'CSV', url: 'old.csv' },
      { name: 'Train, Metro and Light Rail Station Monthly Usage from November 2024', format: 'CSV', url: 'entry_exit.csv' },
    ];
    expect(pickHtsLgaResources(resources)).toEqual(['a.xlsx']);
    expect(pickStationUsageResource(resources)).toBe('entry_exit.csv');
  });
});
