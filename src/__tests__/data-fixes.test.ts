/**
 * RED tests — these test the FIXED behaviour.
 * They fail against the current (buggy) code, then pass after fixes.
 *
 * Bug 1: Economy "Employed (2021)" stat card shows wrong year (index 0 = 2011)
 * Bug 2: Compare page uses hardcoded array indices — fragile and wrong for Ferry
 * Bug 3: TfNSW static data labelled as real but is synthetic — add clear disclaimer
 */

// ─── Bug 1 fix: getEmployed2021 helper extracts by year, not index ────────────

describe('Bug 1 fix: getEmployed2021 returns the 2021 figure, not index 0', () => {
  it('returns the 2021 employed count from sample trend (years 2011, 2016, 2021)', () => {
    // The trend has 3 entries: [2011, 2016, 2021]. Index 0 = 2011.
    // After the fix, we look up by year so we always get the right value.
    const { getEmployed2021 } = require('../lib/data/economy-helpers');
    const sampleTrend = [
      { year: 2011, employed: 50000, unemployed: 3000 },
      { year: 2016, employed: 58000, unemployed: 2800 },
      { year: 2021, employed: 65000, unemployed: 2500 },
    ];
    expect(getEmployed2021(sampleTrend)).toBe(65000);
  });

  it('returns the 2021 employed count from TZP24-style trend (years 2021, 2022, 2023, 2026...)', () => {
    const { getEmployed2021 } = require('../lib/data/economy-helpers');
    const tzp24Trend = [
      { year: 2021, employed: 72000, unemployed: 0 },
      { year: 2022, employed: 74000, unemployed: 0 },
      { year: 2026, employed: 80000, unemployed: 0 },
      { year: 2031, employed: 88000, unemployed: 0 },
    ];
    expect(getEmployed2021(tzp24Trend)).toBe(72000);
  });

  it('returns null when trend has no 2021 entry', () => {
    const { getEmployed2021 } = require('../lib/data/economy-helpers');
    const tzp24NoBaseline = [
      { year: 2022, employed: 74000, unemployed: 0 },
      { year: 2026, employed: 80000, unemployed: 0 },
    ];
    expect(getEmployed2021(tzp24NoBaseline)).toBeNull();
  });

  it('returns null for empty trend', () => {
    const { getEmployed2021 } = require('../lib/data/economy-helpers');
    expect(getEmployed2021([])).toBeNull();
  });
});

// ─── Bug 2 fix: getCarModeShare / getPTModeShare helpers use name lookup ───────

describe('Bug 2 fix: mode share helpers use name-based lookup, not array index', () => {
  const sampleJTW = [
    { name: 'Car (driver)', value: 45.2 },
    { name: 'Car (passenger)', value: 5.1 },
    { name: 'Train', value: 18.3 },
    { name: 'Bus', value: 8.4 },
    { name: 'Ferry', value: 1.2 },
    { name: 'Cycling', value: 2.1 },
    { name: 'Walking', value: 4.5 },
    { name: 'Work from home', value: 10.2 },
    { name: 'Other', value: 5.0 },
  ];

  it('getCarModeShare returns Car (driver) value', () => {
    const { getCarModeShare } = require('../lib/data/transport-helpers');
    expect(getCarModeShare(sampleJTW)).toBe(45.2);
  });

  it('getPTModeShare sums Train + Bus + Ferry', () => {
    const { getPTModeShare } = require('../lib/data/transport-helpers');
    expect(getPTModeShare(sampleJTW)).toBeCloseTo(27.9, 1);
  });

  it('getPTModeShare includes Ferry — unlike the buggy index-based approach', () => {
    const { getPTModeShare } = require('../lib/data/transport-helpers');
    // Old code: journeyToWork[2].value + journeyToWork[3].value = Train + Bus = 26.7
    // New code should include Ferry: 18.3 + 8.4 + 1.2 = 27.9
    const oldBuggy = sampleJTW[2].value + sampleJTW[3].value;
    const correct = getPTModeShare(sampleJTW);
    expect(correct).toBeGreaterThan(oldBuggy);
    expect(correct - oldBuggy).toBeCloseTo(1.2, 1); // Ferry value
  });

  it('getCarModeShare handles reordered array safely', () => {
    const { getCarModeShare } = require('../lib/data/transport-helpers');
    // If live data returns array in different order, name-based lookup still works
    const reordered = [
      { name: 'Train', value: 18.3 },
      { name: 'Car (driver)', value: 45.2 },
      { name: 'Bus', value: 8.4 },
    ];
    expect(getCarModeShare(reordered)).toBe(45.2);
  });

  it('getPTModeShare handles reordered array safely', () => {
    const { getPTModeShare } = require('../lib/data/transport-helpers');
    const reordered = [
      { name: 'Bus', value: 8.4 },
      { name: 'Ferry', value: 1.2 },
      { name: 'Car (driver)', value: 45.2 },
      { name: 'Train', value: 18.3 },
    ];
    expect(getPTModeShare(reordered)).toBeCloseTo(27.9, 1);
  });

  it('getCarModeShare returns 0 when Car (driver) not present', () => {
    const { getCarModeShare } = require('../lib/data/transport-helpers');
    expect(getCarModeShare([])).toBe(0);
  });

  it('getPTModeShare returns 0 when no PT modes present', () => {
    const { getPTModeShare } = require('../lib/data/transport-helpers');
    expect(getPTModeShare([{ name: 'Car (driver)', value: 80.0 }])).toBe(0);
  });
});

// ─── Bug 3b fix: fetchG62 uses correct MTWP codes ────────────────────────────

describe('Bug 3b fix: fetchG62 uses correct MTWP codes', () => {
  it('fetchG62 export exists in abs-fetchers module', () => {
    const mod = require('../lib/abs-fetchers');
    expect(typeof mod.fetchG62).toBe('function');
  });

  it('fetchG62 source code uses hierarchical code 233 for train (not single-mode 7)', () => {
    // Code 7 in ABS G62 is only ~1.2% in Sydney (not train).
    // Code 233 is the hierarchical total for all train trips.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../lib/abs-fetchers.ts'),
      'utf-8',
    );
    // Should use 233 for train
    expect(src).toMatch(/get\('233'\)/);
    // Should NOT use code 7 for train
    expect(src).not.toMatch(/train\s*=\s*get\('7'\)/);
  });

  it('fetchG62 source code uses 6 for car driver (not 1)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../lib/abs-fetchers.ts'),
      'utf-8',
    );
    expect(src).toMatch(/car_driver\s*=\s*get\('6'\)/);
    expect(src).not.toMatch(/car_driver\s*=\s*get\('1'\)/);
  });

  it('fetchG62 source code uses 234 for bus (not 6)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../lib/abs-fetchers.ts'),
      'utf-8',
    );
    expect(src).toMatch(/get\('234'\)/);
    expect(src).not.toMatch(/bus\s*=\s*get\('6'\)/);
  });

  it('fetchG62 source code uses 232 for ferry/tram/light rail (not 9)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../lib/abs-fetchers.ts'),
      'utf-8',
    );
    expect(src).toMatch(/get\('232'\)/);
    expect(src).not.toMatch(/ferry\s*=\s*get\('9'\)/);
  });
});

// ─── Bug 3 fix: TfNSW data correctly labelled as modelled/estimated ────────────

describe('Bug 3 fix: TfNSW static data disclaimer in TRANSPORT_DATA_NOTE', () => {
  it('TRANSPORT_DATA_NOTE export exists in tfnsw-transport module', () => {
    const mod = require('../lib/data/tfnsw-transport');
    expect(mod.TRANSPORT_DATA_NOTE).toBeDefined();
  });

  it('TRANSPORT_DATA_NOTE mentions modelled or estimated', () => {
    const { TRANSPORT_DATA_NOTE } = require('../lib/data/tfnsw-transport');
    const lower = TRANSPORT_DATA_NOTE.toLowerCase();
    expect(lower).toMatch(/modell|estimat|indicative/);
  });

  it('TRANSPORT_DATA_NOTE explicitly states data is NOT from official TfNSW', () => {
    const { TRANSPORT_DATA_NOTE } = require('../lib/data/tfnsw-transport');
    const lower = TRANSPORT_DATA_NOTE.toLowerCase();
    expect(lower).toMatch(/not sourced from official/);
  });
});

describe('Bug fix: demographics labels are sanitised before chart rendering', () => {
  it('collapses unmapped birthplace codes into an Other countries bucket', () => {
    const { sanitiseBirthplaceGroups } = require('../lib/abs-fetchers');
    const groups = sanitiseBirthplaceGroups([
      { name: 'Country 11', code: '11', count: 188954 },
      { name: 'China (excl. SARs)', code: '6101', count: 33153 },
      { name: 'Country 2102', code: '2102', count: 20197 },
      { name: 'Country _N', code: '_N', count: 28450 },
    ]);

    expect(groups).toEqual([
      { name: 'Other countries', code: 'other', count: 237601 },
      { name: 'China (excl. SARs)', code: '6101', count: 33153 },
    ]);
  });

  it('collapses roll-up and unmapped language codes into an Other languages bucket', () => {
    const { sanitiseLanguageGroups } = require('../lib/abs-fetchers');
    const groups = sanitiseLanguageGroups([
      { name: 'Language 71', code: '71', count: 98139 },
      { name: 'Mandarin', code: '7101', count: 32711 },
      { name: 'Language 6902', code: '6902', count: 28290 },
      { name: 'Arabic', code: '4202', count: 16588 },
      { name: 'Language _O', code: '_O', count: 24221 },
    ]);

    expect(groups).toEqual([
      { name: 'Other languages', code: 'other', count: 122360 },
      { name: 'Mandarin', code: '7101', count: 32711 },
      { name: 'Tamil', code: '6902', count: 28290 },
      { name: 'Arabic', code: '4202', count: 16588 },
    ]);
  });

  it('selects detailed language codes before slicing so roll-up totals do not crowd out named languages', () => {
    const { selectTopDetailedLanguageGroups } = require('../lib/abs-fetchers');

    const groups = selectTopDetailedLanguageGroups([
      ['1', 122723],
      ['71', 50068],
      ['7104', 36324],
      ['65', 13150],
      ['7101', 11960],
      ['6402', 11802],
      ['3106', 10077],
      ['6504', 8734],
      ['52', 7229],
    ]);

    expect(groups).toEqual([
      { name: 'Other languages', code: 'other', count: 193170 },
      { name: 'Cantonese', code: '7104', count: 36324 },
      { name: 'Mandarin', code: '7101', count: 11960 },
      { name: 'Thai', code: '6402', count: 11802 },
      { name: 'Spanish', code: '3106', count: 10077 },
      { name: 'Indonesian', code: '6504', count: 8734 },
    ]);
  });

  it('selects detailed birthplace codes before slicing so aggregate buckets do not crowd out named countries', () => {
    const { selectTopDetailedBirthplaceGroups } = require('../lib/abs-fetchers');

    const groups = selectTopDetailedBirthplaceGroups([
      ['11', 188954],
      ['6101', 33153],
      ['2102', 20197],
      ['1201', 11436],
      ['2201', 4695],
      ['_N', 28450],
    ]);

    expect(groups).toEqual([
      { name: 'Other countries', code: 'other', count: 237601 },
      { name: 'China (excl. SARs)', code: '6101', count: 33153 },
      { name: 'England', code: '1201', count: 11436 },
      { name: 'New Zealand', code: '2201', count: 4695 },
    ]);
  });

  it('builds language chart data with English only included and other bucket excluded', () => {
    const { buildLanguageChartData } = require('../lib/data/demographics-helpers');

    const rows = buildLanguageChartData(
      [
        { name: 'Other languages', code: 'other', count: 936398 },
        { name: 'Punjabi', code: '5203', count: 34746 },
        { name: 'Arabic', code: '4202', count: 23292 },
      ],
      104522,
      10,
    );

    expect(rows).toEqual([
      { name: 'English only', value: 104522 },
      { name: 'Punjabi', value: 34746 },
      { name: 'Arabic', value: 23292 },
    ]);
  });
});

describe('Education official-source wiring', () => {
  it('exports official ABS fetchers for enrolment and historical qualification series', () => {
    const mod = require('../lib/abs-fetchers');
    expect(typeof mod.fetchG15).toBe('function');
    expect(typeof mod.fetchG49_2016).toBe('function');
  });

  it('live education merge reads official enrolment and historical qualification cache entries', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../lib/data/live-data.ts'),
      'utf-8',
    );

    expect(src).toMatch(/getABS<SchoolAttendanceData>\(lgaCode, 'G15'\)/);
    expect(src).toMatch(/getABS<QualificationData>\(lgaCode, 'G49_2016'\)/);
    expect(src).toMatch(/liveFields\.push\('schoolEnrolment'\)/);
    expect(src).toMatch(/liveFields\.push\('qualificationTrend'\)/);
  });
});

describe('Housing official-source wiring', () => {
  it('exports official ABS fetcher for historical dwelling structure', () => {
    const mod = require('../lib/abs-fetchers');
    expect(typeof mod.fetchB31_2011).toBe('function');
  });

  it('live housing merge reads official historical dwelling structure cache entry', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../lib/data/live-data.ts'),
      'utf-8',
    );

    expect(src).toMatch(/getABS<HistoricalDwellingStructureData>\(lgaCode, 'B31_2011'\)/);
    expect(src).toMatch(/liveFields\.push\('housingTrend'\)/);
  });
});

describe('Growth official-source wiring', () => {
  it('exports official ABS fetcher for building approvals', () => {
    const mod = require('../lib/abs-fetchers');
    expect(typeof mod.fetchBuildingApprovals).toBe('function');
  });

  it('building approvals fetcher targets the ABS BA_LGA2024 and BA_LGA2025 datasets', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../lib/abs-fetchers.ts'),
      'utf-8',
    );

    expect(src).toMatch(/BA_LGA2024/);
    expect(src).toMatch(/BA_LGA2025/);
    expect(src).toMatch(/1\.9\.TOT\.100\./);
  });

  it('live growth merge reads the BUILDING_APPROVALS cache entry', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../lib/data/live-data.ts'),
      'utf-8',
    );

    expect(src).toMatch(/getABS<BuildingApprovalsData>\(lgaCodeForBA, 'BUILDING_APPROVALS'\)/);
    expect(src).toMatch(/liveFields\.push\('buildingApprovals', 'rollingAnnualApprovals'\)/);
  });
});
