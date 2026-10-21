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

  it('fetchG62 decodes with the official CL_C21_MTWP01 codes', () => {
    // 232/233/234 are walked only / worked at home / did not go to work —
    // they were previously misread as ferry / train / bus.
    // Behavioural coverage lives in journey-to-work-codes.test.ts.
    const { MTWP_CODES_2021 } = require('../lib/abs-fetchers');
    expect(MTWP_CODES_2021).toMatchObject({
      train: '1', bus: '2', ferry: '3', tram: '4', carDriver: '6', carPassenger: '7',
      bicycle: '10', walked: '232', workedHome: '233', didNotGo: '234',
    });
  });
});

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

  it('TRANSPORT_DATA_NOTE explicitly states data is modelled/estimated', () => {
    const { TRANSPORT_DATA_NOTE } = require('../lib/data/tfnsw-transport');
    const lower = TRANSPORT_DATA_NOTE.toLowerCase();
    expect(lower).toMatch(/modell|estimat/);
  });
});

describe('Bug fix: demographics labels are sanitised before chart rendering', () => {
  // Country/language labels now come from the official ABS codelists; selection
  // and bucketing are covered in abs-decoders-detail.test.ts.
  it('sanitises cached groups by dropping empty entries and ordering by size', () => {
    const { sanitiseLanguageGroups } = require('../lib/abs-fetchers');
    expect(sanitiseLanguageGroups([
      { name: 'Chinese: Mandarin', code: '7104', count: 18213 },
      { name: 'Other languages', code: 'other', count: 40000 },
      { name: 'Korean', code: '6902', count: 0 },
    ])).toEqual([
      { name: 'Other languages', code: 'other', count: 40000 },
      { name: 'Chinese: Mandarin', code: '7104', count: 18213 },
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

describe('Transport realtime implementation wiring', () => {
  it('package scripts expose the documented transport seed commands', () => {
    const fs = require('fs');
    const path = require('path');
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'),
    );

    expect(pkg.scripts['seed:commute-times']).toBe('tsx scripts/seed-commute-times.ts');
    expect(pkg.scripts['seed:infrastructure']).toBe('tsx scripts/seed-infrastructure.ts');
  });

  it('env example documents the OpenRouteService key for indicative commute benchmarks', () => {
    const fs = require('fs');
    const path = require('path');
    const envExample = fs.readFileSync(path.join(__dirname, '../../.env.example'), 'utf-8');

    expect(envExample).toMatch(/OPENROUTESERVICE_API_KEY=/);
  });

  it('NSW infrastructure source uses geometry-based Spatial Services queries instead of stale layer filters', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../lib/nsw-spatial-services.ts'),
      'utf-8',
    );

    expect(src).toMatch(/getLGAGeometry/);
    expect(src).toMatch(/waytype IN/);
    expect(src).not.toMatch(/LGA_NAME LIKE/);
    expect(src).not.toMatch(/CycleTrack:\s*19/);
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
