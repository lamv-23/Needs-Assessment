import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { GREATER_SYDNEY_GCCSA_AREA_IDS } from '@/lib/data/sample-areas';
import { aggregateRecords } from '@/lib/needs/aggregate';
import { runAssessment } from '@/lib/needs/assess';
import { formatDiff, formatValue } from '@/lib/needs/format';
import { INDICATOR_BY_ID, INDICATORS } from '@/lib/needs/indicators';
import {
  buildInsights, carDependencyMismatch, expectedCarDependencyModel, fitLinear, growthVsService, jobsHousing, keyNeedText,
  trends, WFH_CAVEAT_CITATION,
} from '@/lib/needs/insights';
import { buildNarrative } from '@/lib/needs/narrative';
import type {
  IndicatorDef, IndicatorId, IndicatorValue, Insight, InsightSeries, LgaIndicatorRecord, NeedsMode, Universe,
} from '@/lib/needs/types';
import { EMPTY_SERIES } from './fixtures/needs';

type Values = Partial<Record<IndicatorId, IndicatorValue>>;

function makeRecord(
  areaId: string,
  { values = {}, series = {}, ...extra }:
    { values?: Values; series?: Partial<InsightSeries> } & Omit<Partial<LgaIndicatorRecord>, 'values' | 'series'> = {},
): LgaIndicatorRecord {
  const all = {} as Record<IndicatorId, IndicatorValue>;
  for (const def of INDICATORS) all[def.id] = values[def.id] ?? { value: null };
  return {
    areaId, name: areaId, region: 'Hunter', population: 100000, densityPerKm2: 500, peerGroup: 'regional_city',
    values: all, series: { ...EMPTY_SERIES, ...series }, ...extra,
  };
}

const snapshotRecord = (id: string) => NEEDS_SNAPSHOT.records.find(r => r.areaId === id)!;

function assess(areaIds: string[], mode: NeedsMode = 'separate', universe: Universe = 'nsw', records = NEEDS_SNAPSHOT.records) {
  return runAssessment({ snapshot: { generatedAt: '2026-10-23T00:00:00.000Z', records }, areaIds, mode, universe });
}

const of = (insights: Insight[], kind: Insight['kind'], areaId?: string) =>
  insights.filter(i => i.kind === kind && (areaId === undefined || i.areaId === areaId));

const CAR = INDICATOR_BY_ID.car_dependency;
const METRO_IDS = GREATER_SYDNEY_GCCSA_AREA_IDS;

/**
 * 25 metropolitan LGAs whose car dependency is unrelated to frequent-stop share (R² near 0), with the last
 * one far above the rest at the mean share, so its residual is large but the model is too weak to use.
 */
function weakMetroRecords(): LgaIndicatorRecord[] {
  return METRO_IDS.slice(0, 25).map((id, i) => makeRecord(id, {
    name: `Metro ${i}`, region: 'Greater Sydney', peerGroup: 'metro_middle',
    values: {
      frequent_stop_share: { value: i === 24 ? 48 : i * 4 },
      car_dependency: { value: i === 24 ? 95 : 70 + (i % 2 === 0 ? 5 : -5) },
    },
  }));
}

/**
 * 31 non-metropolitan LGAs where car dependency rises with ln(population) plus ±1 pp noise; 'lga_test_target'
 * (Testville) sits 10 pp below the line.
 */
function nonMetroRecords(): LgaIndicatorRecord[] {
  const records = Array.from({ length: 30 }, (_, i) => {
    const population = 10000 * (i + 1);
    return makeRecord(`lga_test_${i}`, {
      population,
      values: { car_dependency: { value: 60 + 3 * Math.log(population) + (i % 2 === 0 ? 1 : -1) } },
    });
  });
  const population = 155000;
  records.push(makeRecord('lga_test_target', {
    name: 'Testville', population,
    values: { car_dependency: { value: 60 + 3 * Math.log(population) - 10 } },
  }));
  return records;
}

describe('keyNeedText: rank wording (R57)', () => {
  const car = (value: number, rank: number, ranked: number) => ({ id: 'car_dependency' as const, value, rank, ranked });
  const farWest = { universeLabel: 'LGAs in the Far West region', universeSize: 8 };
  const gsyd = { universeLabel: 'Greater Sydney LGAs', universeSize: 34 };

  test('fewer than 20 ranked: an ordinal of the group size', () => {
    expect(keyNeedText('Broken Hill', car(91.9, 1, 8), farWest, 77.8))
      .toBe('On car dependency, Broken Hill (91.9%) ranks 1st of 8 LGAs in the Far West region, '
        + '14.1 pp above the Greater Sydney figure of 77.8%.');
    expect(keyNeedText('Broken Hill', car(91.9, 2, 8), farWest, null))
      .toBe('On car dependency, Broken Hill (91.9%) ranks 2nd of 8 LGAs in the Far West region.');
    expect(keyNeedText('X', car(50, 3, 19), { universeLabel: 'regional cities', universeSize: 19 }, null))
      .toBe('On car dependency, X (50.0%) ranks 3rd of 19 regional cities.');
  });

  test('20 or more ranked: the highest-need k%, k = ceil(100 × rank ÷ ranked)', () => {
    expect(keyNeedText('Wollondilly', car(91.1, 1, 34), gsyd, null))
      .toBe('On car dependency, Wollondilly (91.1%) ranks in the highest-need 3% of Greater Sydney LGAs.');
    // 7 of 34 is 20.6%, which rounds up to 21 (the old mid-rank wording said 19%)
    expect(keyNeedText('X', car(80, 7, 34), gsyd, null)).toContain('ranks in the highest-need 21% of Greater Sydney LGAs');
    expect(keyNeedText('X', car(80, 1, 20), { universeLabel: 'NSW LGAs', universeSize: 20 }, null))
      .toContain('ranks in the highest-need 5% of NSW LGAs');
  });
});

describe('key needs on real data (R57)', () => {
  const keyNeedTexts = (ids: string[], universe: Universe) => of(buildInsights(assess(ids, 'separate', universe)), 'key_need')
    .map(i => i.text);

  test('Broken Hill in the Far West region (8 LGAs) ranks by ordinal', () => {
    const texts = keyNeedTexts(['lga_broken_hill'], 'region');
    expect(texts).toContain('On car dependency, Broken Hill (91.9%) ranks 1st of 8 LGAs in the Far West region, '
      + '14.2 pp above the Greater Sydney figure of 77.8%.');
    expect(texts.some(t => t.startsWith('On residents aged 65+, Broken Hill (23.2%) ranks 2nd of 8 LGAs in the Far West region'))).toBe(true);
    expect(texts.every(t => !t.includes('highest-need'))).toBe(true);
  });

  test('Wollondilly in Greater Sydney (34 LGAs) is in the highest-need 3%, not 1%', () => {
    expect(keyNeedTexts(['lga_wollondilly'], 'gsyd')).toContain(
      'On car dependency, Wollondilly (91.1%) ranks in the highest-need 3% of Greater Sydney LGAs, '
      + '13.4 pp above the Greater Sydney figure of 77.8%.',
    );
  });
});

describe('fitLinear', () => {
  test('an exact line', () => {
    expect(fitLinear([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }])).toMatchObject({ intercept: 1, slope: 2, r2: 1, n: 3 });
  });

  test('a noisy fit: R² and residual SD on n − 2 degrees of freedom', () => {
    const fit = fitLinear([{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 1 }, { x: 3, y: 3 }]);
    expect(fit.slope).toBeCloseTo(0.8, 10);
    expect(fit.intercept).toBeCloseTo(0.3, 10);
    expect(fit.r2).toBeCloseTo(0.64, 10);                    // 1 − SSE 1.8 ÷ SST 5
    expect(fit.residualSd).toBeCloseTo(Math.sqrt(0.9), 10);  // √(1.8 ÷ 2)
  });

  test('degenerate inputs give finite numbers', () => {
    for (const points of [[], [{ x: 1, y: 2 }], [{ x: 1, y: 2 }, { x: 1, y: 4 }], [{ x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }]]) {
      const fit = fitLinear(points);
      expect([fit.intercept, fit.slope, fit.r2, fit.residualSd].every(Number.isFinite)).toBe(true);
      expect(fit.n).toBe(points.length);
    }
  });
});

describe('expectedCarDependencyModel', () => {
  test('metro model on the real snapshot', () => {
    const m = expectedCarDependencyModel(NEEDS_SNAPSHOT.records, 'metro');
    expect(m.n).toBe(34); expect(m.predictor).toBe('frequent_stop_share'); expect(m.setting).toBe('metro');
    expect(m.r2).toBeGreaterThan(0.4); expect(m.slope).toBeLessThan(0);      // probe: R² 0.51, slope −0.52
    expect(m.residualSd).toBeCloseTo(8.8, 1);                              // spec: residual SD 8.8 pp
  });

  test('non-metro model uses ln(population)', () => {
    const m = expectedCarDependencyModel(NEEDS_SNAPSHOT.records, 'non_metro');
    expect(m.n).toBe(94); expect(m.predictor).toBe('ln_population'); expect(m.setting).toBe('non_metro');
    expect(m.r2).toBeGreaterThan(0.4);                                     // probe: R² 0.52
    expect(m.residualSd).toBeCloseTo(3.3, 1);                              // spec: residual SD 3.3 pp
  });

  test('records without the predictor or car dependency are left out of the fit', () => {
    const records = [
      ...weakMetroRecords(),
      makeRecord(METRO_IDS[25], { values: { car_dependency: { value: 80 } } }),       // no frequent-stop share
      makeRecord(METRO_IDS[26], { values: { frequent_stop_share: { value: 10 } } }),  // no car dependency
      makeRecord('lga_test_0', { values: { car_dependency: { value: 90 }, frequent_stop_share: { value: 5 } } }),
    ];
    expect(expectedCarDependencyModel(records, 'metro').n).toBe(25);
    expect(expectedCarDependencyModel(records, 'non_metro').n).toBe(1);
  });
});

describe('carDependencyMismatch', () => {
  test('mismatch is unusable when the fit is weak', () => {
    const records = weakMetroRecords();
    const m = carDependencyMismatch(records[24], records)!;
    expect(m.fit.n).toBe(25);
    expect(m.fit.r2).toBeLessThan(0.3);
    expect(Math.abs(m.z)).toBeGreaterThanOrEqual(1);
    expect(m.usable).toBe(false);
  });

  test('mismatch is unusable with fewer than 20 LGAs, however strong the fit', () => {
    const records = METRO_IDS.slice(0, 19).map((id, i) => makeRecord(id, {
      values: { frequent_stop_share: { value: i * 5 }, car_dependency: { value: 90 - i + (i % 2 === 0 ? 0.5 : -0.5) } },
    }));
    const m = carDependencyMismatch(records[0], records)!;
    expect(m.fit.r2).toBeGreaterThan(0.9);
    expect(m.usable).toBe(false);
  });

  test('mismatch z = residual / residualSd', () => {
    const blacktown = snapshotRecord('lga_blacktown');
    const m = carDependencyMismatch(blacktown, NEEDS_SNAPSHOT.records)!;
    const fit = expectedCarDependencyModel(NEEDS_SNAPSHOT.records, 'metro');
    expect(m.areaId).toBe('lga_blacktown');
    expect(m.fit).toEqual(fit);
    expect(m.actual).toBe(blacktown.values.car_dependency.value);
    expect(m.x).toBe(blacktown.values.frequent_stop_share.value);
    expect(m.expected).toBeCloseTo(fit.intercept + fit.slope * blacktown.values.frequent_stop_share.value!, 10);
    expect(m.residual).toBeCloseTo(m.actual - m.expected, 10);
    expect(m.z).toBeCloseTo(m.residual / fit.residualSd, 10);
    expect(m.usable).toBe(true);
  });

  test('non-metropolitan LGAs use the ln(population) model', () => {
    const newcastle = snapshotRecord('lga_newcastle');
    const m = carDependencyMismatch(newcastle, NEEDS_SNAPSHOT.records)!;
    expect(m.fit.setting).toBe('non_metro');
    expect(m.x).toBeCloseTo(Math.log(newcastle.population), 10);
    expect(m.expected).toBeCloseTo(m.fit.intercept + m.fit.slope * Math.log(newcastle.population), 10);
  });

  test('null when the record has no car dependency or no predictor', () => {
    const records = weakMetroRecords();
    expect(carDependencyMismatch(makeRecord(METRO_IDS[0], { values: { frequent_stop_share: { value: 20 } } }), records)).toBeNull();
    expect(carDependencyMismatch(makeRecord(METRO_IDS[0], { values: { car_dependency: { value: 80 } } }), records)).toBeNull();
  });

  test('a combined area is compared with the population-weighted mean of its members\' expected values', () => {
    const records = NEEDS_SNAPSHOT.records;
    const members = [snapshotRecord('lga_blacktown'), snapshotRecord('lga_penrith')];
    const combined = aggregateRecords(members, 'Blacktown + Penrith', 'combined');
    const m = carDependencyMismatch(combined, records)!;
    const one = members.map(r => carDependencyMismatch(r, records)!);
    const weight = members[0].population + members[1].population;
    expect(m.areaId).toBe('combined');
    expect(m.actual).toBe(combined.values.car_dependency.value);
    expect(m.expected).toBeCloseTo((one[0].expected * members[0].population + one[1].expected * members[1].population) / weight, 10);
    expect(m.residual).toBeCloseTo(m.actual - m.expected, 10);
    // x is the members' weighted mean predictor, so the combined expected value lies on the fitted line at x
    expect(m.x).toBeCloseTo((one[0].x * members[0].population + one[1].x * members[1].population) / weight, 10);
    expect(m.fit.intercept + m.fit.slope * m.x).toBeCloseTo(m.expected, 10);
  });

  test('a combined area spanning metropolitan and non-metropolitan LGAs has no single model', () => {
    const combined = aggregateRecords([snapshotRecord('lga_blacktown'), snapshotRecord('lga_newcastle')], 'x', 'combined');
    expect(carDependencyMismatch(combined, NEEDS_SNAPSHOT.records)).toBeNull();
  });
});

describe('trends', () => {
  const carSeries = (from: [2011 | 2016, number], to: number): Partial<InsightSeries> => ({
    carDependencyByYear: [{ year: from[0], value: from[1] }, { year: 2021, value: to }],
  });

  test('trend change compares with the universe median change', () => {
    const subject = makeRecord('s', { series: carSeries([2011, 70], 80) });
    const universe = [
      subject,
      makeRecord('a', { series: carSeries([2011, 60], 62) }),
      makeRecord('b', { series: carSeries([2011, 60], 64) }),
      makeRecord('c', { series: carSeries([2011, 60], 66) }),
      makeRecord('d', { series: carSeries([2016, 60], 90) }),   // no 2011: not measured over 2011 → 2021
    ];
    const [car] = trends(subject, universe).filter(t => t.metric === 'car_dependency');
    expect(car).toEqual({
      areaId: 's', metric: 'car_dependency',
      from: { label: '2011', value: 70 }, to: { label: '2021', value: 80 },
      change: 10, universeMedianChange: 5,                      // median of 10, 2, 4, 6
    });
  });

  test('population_growth trend (R39): from = actual annual growth 2021→latest ERP year, to = DPE projected annual growth 2021→2041', () => {
    const record = makeRecord('s', {
      series: {
        populationHistory: [{ year: 2021, population: 400000 }, { year: 2023, population: 410000 }, { year: 2025, population: 432000 }],
        population2041: 500000,
      },
    });
    const [growth] = trends(record, [record]).filter(t => t.metric === 'population_growth');
    const actual = (Math.pow(432000 / 400000, 1 / 4) - 1) * 100;      // 1.94% a year
    const projected = (Math.pow(500000 / 400000, 1 / 20) - 1) * 100;  // 1.12% a year
    expect(growth.from.label).toBe('2021–2025 actual');
    expect(growth.to.label).toBe('2021–2041 projected');
    expect(growth.from.value).toBeCloseTo(actual, 10);
    expect(growth.to.value).toBeCloseTo(projected, 10);
    expect(growth.change).toBeCloseTo(projected - actual, 10);
    expect(growth.universeMedianChange).toBeCloseTo(projected - actual, 10);
  });

  test('crash and approval trends are rates on the indicator denominators', () => {
    const blacktown = snapshotRecord('lga_blacktown');
    const all = trends(blacktown, NEEDS_SNAPSHOT.records);
    const crash = all.find(t => t.metric === 'crash_rate')!;
    const erp = (year: number) => blacktown.series.populationHistory.find(p => p.year === year)!.population;
    expect([crash.from.label, crash.to.label]).toEqual(['2020', '2024']);
    // 2020 has no ERP in the cache, so the nearest year's (2021) is used
    expect(blacktown.series.populationHistory.some(p => p.year === 2020)).toBe(false);
    expect(crash.from.value).toBeCloseTo(blacktown.series.crashesByYear[0].total / erp(2021) * 10000, 10);
    expect(crash.to.value).toBeCloseTo(blacktown.series.crashesByYear[4].total / erp(2024) * 10000, 10);
    expect(crash.to.value).toBeCloseTo(blacktown.values.crash_rate.value!, 3);
    const approvals = all.find(t => t.metric === 'approvals')!;
    expect([approvals.from.label, approvals.to.label]).toEqual(['previous 12 months', 'last 12 months']);
    expect(approvals.from.value).toBeCloseTo(blacktown.series.approvalsPrev12! / blacktown.population * 1000, 10);
    expect(approvals.to.value).toBeCloseTo(blacktown.values.approvals_per_1000.value!, 3);
    expect(all.map(t => t.metric)).toEqual(['car_dependency', 'crash_rate', 'population_growth', 'approvals']);
  });

  test('crash rates use each year\'s population: rising crashes in a faster-growing LGA are a falling rate', () => {
    const growing = makeRecord('s', {
      population: 9000,   // the Census count, which must not be the denominator
      series: {
        crashesByYear: [{ year: 2020, total: 100 }, { year: 2022, total: 105 }, { year: 2024, total: 110 }],
        populationHistory: [{ year: 2021, population: 10000 }, { year: 2024, population: 12500 }],
      },
    });
    const [crash] = trends(growing, [growing]).filter(t => t.metric === 'crash_rate');
    expect(crash.from).toEqual({ label: '2020', value: 100 });     // 100 ÷ 10,000 (2021 ERP, the nearest year)
    expect(crash.to).toEqual({ label: '2024', value: 88 });        // 110 ÷ 12,500
    expect(crash.change).toBeCloseTo(-12, 10);

    const with2020 = makeRecord('s', {
      series: {
        crashesByYear: [{ year: 2020, total: 100 }, { year: 2024, total: 110 }],
        populationHistory: [{ year: 2020, population: 8000 }, { year: 2021, population: 10000 }, { year: 2024, population: 12500 }],
      },
    });
    expect(trends(with2020, [with2020]).find(t => t.metric === 'crash_rate')!.from.value).toBe(125);   // 100 ÷ 8,000

    const noErp = makeRecord('s', { series: { crashesByYear: [{ year: 2020, total: 100 }, { year: 2024, total: 110 }] } });
    expect(trends(noErp, [noErp])).toEqual([]);
  });

  test('trends skip metrics without both endpoints', () => {
    const no2011 = makeRecord('s', { series: carSeries([2016, 70], 75) });
    expect(trends(no2011, [no2011]).map(t => [t.metric, t.from.label, t.to.label])).toEqual([['car_dependency', '2016', '2021']]);

    const oneEach = makeRecord('s', {
      series: {
        carDependencyByYear: [{ year: 2021, value: 80 }],
        crashesByYear: [{ year: 2024, total: 100 }],
        populationHistory: [{ year: 2021, population: 1000 }],
        population2041: 2000,
        approvalsLast12: 50,
        approvalsPrev12: null,
      },
    });
    expect(trends(oneEach, [oneEach])).toEqual([]);

    const no2041 = makeRecord('s', {
      series: { populationHistory: [{ year: 2021, population: 1000 }, { year: 2025, population: 1100 }], population2041: null },
    });
    expect(trends(no2041, [no2041])).toEqual([]);
    expect(trends(makeRecord('s'), [makeRecord('s')])).toEqual([]);
  });
});

describe('growthVsService', () => {
  const withService = (amPeakDepartures: number | null, population2041: number | null = 500000) => makeRecord('s', {
    series: {
      populationHistory: [{ year: 2021, population: 380000 }, { year: 2025, population: 400000 }],
      population2041, amPeakDepartures,
    },
  });

  test('growthVsService', () => {
    expect(growthVsService(withService(6000))).toEqual({
      areaId: 's', per1000Now: 15, per1000In2041: 12, extraDeparturesNeeded: 1500,
    });
    expect(growthVsService(withService(0))).toBeNull();
    expect(growthVsService(withService(null))).toBeNull();
    expect(growthVsService(withService(6000, null))).toBeNull();
  });

  test('today is the latest ERP year, the denominator of am_peak_departures_per_1000', () => {
    const blacktown = snapshotRecord('lga_blacktown');
    expect(growthVsService(blacktown)!.per1000Now).toBeCloseTo(blacktown.values.am_peak_departures_per_1000.value!, 1);
  });
});

describe('jobsHousing', () => {
  test('jobs per resident from TZP24 jobs, ERP 2021 and the 2041 projection', () => {
    const record = makeRecord('s', {
      series: { populationHistory: [{ year: 2021, population: 400000 }], population2041: 500000, jobs2021: 140000, jobs2041: 200000 },
    });
    expect(jobsHousing(record)).toEqual({ areaId: 's', jobsPerResident2021: 0.35, jobsPerResident2041: 0.4 });
  });

  test('jobsHousing null without TZP24 data', () => {
    const base = { populationHistory: [{ year: 2021, population: 400000 }], population2041: 500000, jobs2021: 140000, jobs2041: 200000 };
    expect(jobsHousing(makeRecord('s', { series: { ...base, jobs2021: null, jobs2041: null } }))).toBeNull();
    expect(jobsHousing(makeRecord('s', { series: { ...base, jobs2041: null } }))).toBeNull();
    expect(jobsHousing(makeRecord('s', { series: { ...base, population2041: null } }))).toBeNull();
    expect(jobsHousing(makeRecord('s', { series: { ...base, populationHistory: [] } }))).toBeNull();
    const noTzp = NEEDS_SNAPSHOT.records.find(r => r.values.job_growth_2041.value === null)!;
    expect(jobsHousing(noTzp)).toBeNull();
  });
});

describe('buildInsights', () => {
  test('buildInsights: mismatch text', () => {
    // Camden: the metropolitan LGA furthest above its expected value (z 1.47 on the 2026-10-22 snapshot)
    const insights = buildInsights(assess(['lga_camden']));
    const m = carDependencyMismatch(snapshotRecord('lga_camden'), NEEDS_SNAPSHOT.records)!;
    expect(m.usable).toBe(true);
    expect(m.z).toBeGreaterThanOrEqual(1);
    const [mismatch] = of(insights, 'mismatch');
    expect(mismatch.text).toBe(
      `Camden's car dependency (${formatValue(CAR, m.actual)}) is ${formatDiff(CAR, Math.abs(m.residual))} higher than expected `
      + `for its level of frequent public transport service (model across 34 metropolitan LGAs, R² ${m.fit.r2.toFixed(2)}).`,
    );
    expect(mismatch.severity).toBeCloseTo(Math.min(1, Math.abs(m.z) / 2), 10);
    expect(mismatch.citations.map(c => c.short)).toEqual(['ABS Census 2021 G62', 'TfNSW GTFS']);
  });

  test('a usable mismatch under one residual SD is not an insight, but carDependencyMismatch still returns it', () => {
    const m = carDependencyMismatch(snapshotRecord('lga_blacktown'), NEEDS_SNAPSHOT.records)!;
    expect(m.usable).toBe(true);
    expect(Math.abs(m.z)).toBeGreaterThan(0.5);
    expect(Math.abs(m.z)).toBeLessThan(1);                    // 6.0 pp ÷ 8.8 pp = 0.69
    expect(of(buildInsights(assess(['lga_blacktown'])), 'mismatch')).toEqual([]);
  });

  test('non-metropolitan mismatch text, with a negative residual', () => {
    const records = nonMetroRecords();
    const target = records.find(r => r.areaId === 'lga_test_target')!;
    const m = carDependencyMismatch(target, records)!;
    expect(m.usable).toBe(true);
    expect(m.z).toBeLessThanOrEqual(-1);
    const [mismatch] = of(buildInsights(assess(['lga_test_target'], 'separate', 'nsw', records)), 'mismatch');
    expect(mismatch.text).toBe(
      `Testville's car dependency (${formatValue(CAR, m.actual)}) is ${formatDiff(CAR, Math.abs(m.residual))} lower than expected `
      + `for an LGA of its population size (model across 31 non-metropolitan LGAs, R² ${m.fit.r2.toFixed(2)}).`,
    );
    expect(mismatch.citations.map(c => c.short)).toEqual(['ABS Census 2021 G62', 'ABS Census 2021 G01']);
  });

  test('buildInsights: growth vs service text', () => {
    const insights = buildInsights(assess(['lga_blacktown']));
    const g = growthVsService(snapshotRecord('lga_blacktown'))!;
    expect(g.extraDeparturesNeeded).toBeGreaterThanOrEqual(1000);           // so rounded to the nearest 100
    const extra = (Math.round(g.extraDeparturesNeeded / 100) * 100).toLocaleString('en-AU');
    const [growth] = of(insights, 'growth_service');
    expect(growth.text).toBe(
      `If AM-peak service stays at today's level, departures per 1,000 residents in Blacktown fall from ${g.per1000Now.toFixed(1)} `
      + `to ${g.per1000In2041.toFixed(1)} by 2041; holding today's rate needs about ${extra} more AM-peak departures.`,
    );
    expect(extra).toMatch(/^\d{1,3}(,\d{3})*$/);
    expect(growth.severity).toBeCloseTo(Math.min(1, (1 - g.per1000In2041 / g.per1000Now) * 2), 10);
    expect(growth.citations.length).toBeGreaterThan(0);
  });

  test('extra departures: nearest 10 below 1,000, nearest 100 from 1,000; none when they round to 0', () => {
    const texts = (amPeakDepartures: number, latestErp: number, population2041: number) => of(buildInsights(assess(
      ['lga_test_g'], 'separate', 'nsw',
      [makeRecord('lga_test_g', {
        name: 'Testville',
        series: { populationHistory: [{ year: 2025, population: latestErp }], population2041, amPeakDepartures },
      })],
    )), 'growth_service').map(i => i.text);

    expect(texts(1200, 400000, 430000)).toEqual([   // 1,200 × 0.075 = 90
      "If AM-peak service stays at today's level, departures per 1,000 residents in Testville fall from 3.0 to 2.8 by 2041; "
      + "holding today's rate needs about 90 more AM-peak departures.",
    ]);
    expect(texts(1000, 400000, 797600)[0]).toContain('needs about 990 more AM-peak departures.');     // 994
    expect(texts(1000, 400000, 1000000)[0]).toContain('needs about 1,500 more AM-peak departures.');  // 1,500
    expect(texts(1000, 400000, 893600)[0]).toContain('needs about 1,200 more AM-peak departures.');   // 1,234
    expect(texts(20, 1000, 1200)).toEqual([]);   // 4 more rounds to 0 (although 20.0 → 16.7 per 1,000)
    expect(texts(70, 1000, 1100)[0]).toContain('needs about 10 more AM-peak departures.');            // 7
  });

  test('no growth vs service insight where the population is projected to fall', () => {
    const shrinking = NEEDS_SNAPSHOT.records.find(r => {
      const g = growthVsService(r);
      return g !== null && g.extraDeparturesNeeded < 0;
    })!;
    expect(of(buildInsights(assess([shrinking.areaId])), 'growth_service')).toEqual([]);
  });

  /** The median clause of a rate trend (R43): a signed median with units, or "no median change" when it shows as 0. */
  const medianClause = (def: IndicatorDef, median: number, universeLabel: string) => (
    Number(Math.abs(median).toFixed(def.decimals)) === 0
      ? `compared with no median change across ${universeLabel}.`
      : `compared with a median change of ${median > 0 ? '+' : '−'}${formatDiff(def, Math.abs(median))} across ${universeLabel}.`
  );

  test('car trend text carries the WFH caveat citation', () => {
    const a = assess(['lga_blacktown']);
    const [car] = trends(snapshotRecord('lga_blacktown'), NEEDS_SNAPSHOT.records).filter(t => t.metric === 'car_dependency');
    const [insight] = of(buildInsights(a), 'trend').filter(i => i.id.endsWith(':car_dependency'));
    expect(car.universeMedianChange!).toBeGreaterThan(0.05);
    expect(insight.text).toBe(
      `Blacktown's car dependency changed from ${formatValue(CAR, car.from.value)} (2011) to ${formatValue(CAR, car.to.value)} (2021), `
      + `compared with a median change of +${formatDiff(CAR, car.universeMedianChange!)} across NSW LGAs.`,
    );
    expect(insight.citations).toContainEqual(WFH_CAVEAT_CITATION);
    expect(insight.citations).toContainEqual(CAR.source);
  });

  test('crash and approval trend texts', () => {
    const insights = of(buildInsights(assess(['lga_blacktown'], 'separate', 'gsyd')), 'trend');
    const all = trends(snapshotRecord('lga_blacktown'), NEEDS_SNAPSHOT.records.filter(r => METRO_IDS.includes(r.areaId)));
    const text = (metric: string) => insights.find(i => i.id.endsWith(`:${metric}`))!.text;

    const crash = all.find(t => t.metric === 'crash_rate')!;
    const crashDef = INDICATOR_BY_ID.crash_rate;
    expect(text('crash_rate')).toBe(
      `Blacktown's road crashes per 10,000 residents changed from ${formatValue(crashDef, crash.from.value)} (2020) `
      + `to ${formatValue(crashDef, crash.to.value)} (2024), `
      + medianClause(crashDef, crash.universeMedianChange!, 'Greater Sydney LGAs'),
    );
    const approvals = all.find(t => t.metric === 'approvals')!;
    const approvalsDef = INDICATOR_BY_ID.approvals_per_1000;
    expect(text('approvals')).toBe(
      `Blacktown's dwelling approvals per 1,000 residents changed from ${formatValue(approvalsDef, approvals.from.value)} `
      + `(previous 12 months) to ${formatValue(approvalsDef, approvals.to.value)} (last 12 months), `
      + medianClause(approvalsDef, approvals.universeMedianChange!, 'Greater Sydney LGAs'),
    );
  });

  test('the median change carries its sign; one that shows as zero is "no median change" (R43)', () => {
    /** Testville's approvals go from 2 to 10 per 1,000; two other LGAs change as given. */
    const approvalsText = (other: { population: number; prev: number; last: number }) => {
      const records = [
        makeRecord('lga_test_s', { name: 'Testville', population: 1000, series: { approvalsPrev12: 2, approvalsLast12: 10 } }),
        ...['lga_test_a', 'lga_test_b'].map(id => makeRecord(id, {
          population: other.population, series: { approvalsPrev12: other.prev, approvalsLast12: other.last },
        })),
      ];
      return of(buildInsights(assess(['lga_test_s'], 'separate', 'nsw', records)), 'trend')[0].text;
    };
    const opening = "Testville's dwelling approvals per 1,000 residents changed from 2.0 per 1,000 (previous 12 months) "
      + 'to 10.0 per 1,000 (last 12 months), ';
    expect(approvalsText({ population: 1000, prev: 5, last: 4 }))
      .toBe(`${opening}compared with a median change of −1.0 per 1,000 across NSW LGAs.`);
    expect(approvalsText({ population: 1000, prev: 4, last: 6 }))
      .toBe(`${opening}compared with a median change of +2.0 per 1,000 across NSW LGAs.`);
    expect(approvalsText({ population: 1000, prev: 3, last: 3 }))
      .toBe(`${opening}compared with no median change across NSW LGAs.`);
    expect(approvalsText({ population: 100000, prev: 100, last: 102 }))   // +0.02 shows as 0.0
      .toBe(`${opening}compared with no median change across NSW LGAs.`);
  });

  test('a trend whose two values show the same reads "stayed at" (R47)', () => {
    const trendText = (subject: Partial<InsightSeries> & { population?: number }, others: Partial<InsightSeries>[] = []) => {
      const { population = 1000, ...series } = subject;
      const records = [
        makeRecord('lga_test_s', { name: 'Testville', population, series }),
        ...others.map((s, i) => makeRecord(`lga_test_${i}`, { population: 1000, series: s })),
      ];
      return of(buildInsights(assess(['lga_test_s'], 'separate', 'nsw', records)), 'trend').map(i => i.text);
    };

    expect(trendText(
      { approvalsPrev12: 5, approvalsLast12: 5 },
      [{ approvalsPrev12: 4, approvalsLast12: 6 }, { approvalsPrev12: 4, approvalsLast12: 6 }],
    )).toEqual([
      "Testville's dwelling approvals per 1,000 residents stayed at 5.0 per 1,000 between the previous 12 months "
      + 'and the last 12 months, compared with a median change of +2.0 per 1,000 across NSW LGAs.',
    ]);
    expect(trendText(   // 5.00 → 5.02 per 1,000 both show as 5.0
      { population: 100000, approvalsPrev12: 500, approvalsLast12: 502 },
      [{ approvalsPrev12: 3, approvalsLast12: 3 }, { approvalsPrev12: 3, approvalsLast12: 3 }],
    )).toEqual([
      "Testville's dwelling approvals per 1,000 residents stayed at 5.0 per 1,000 between the previous 12 months "
      + 'and the last 12 months, compared with no median change across NSW LGAs.',
    ]);
    expect(trendText({ carDependencyByYear: [{ year: 2016, value: 80.01 }, { year: 2021, value: 80.04 }] })).toEqual([
      "Testville's car dependency stayed at 80.0% between 2016 and 2021, compared with no median change across NSW LGAs.",
    ]);
    expect(trendText({
      crashesByYear: [{ year: 2020, total: 100 }, { year: 2024, total: 100 }],
      populationHistory: [{ year: 2021, population: 10000 }, { year: 2024, population: 10000 }],
    })).toEqual([
      "Testville's road crashes per 10,000 residents stayed at 100.0 per 10,000 between 2020 and 2024, "
      + 'compared with no median change across NSW LGAs.',
    ]);
  });

  describe('population trend text (R39)', () => {
    /** One LGA growing at `actual` % a year 2021–2025, projected at `projected` % a year 2021–2041. */
    function populationText(actual: number, projected: number): string {
      const base = 100000;
      const record = makeRecord('lga_test_pop', {
        name: 'Testville',
        series: {
          populationHistory: [{ year: 2021, population: base }, { year: 2025, population: base * Math.pow(1 + actual / 100, 4) }],
          population2041: base * Math.pow(1 + projected / 100, 20),
        },
      });
      const insights = buildInsights(assess(['lga_test_pop'], 'separate', 'nsw', [record]));
      return insights.find(i => i.id.endsWith(':population_growth'))!.text;
    }

    test('growth faster than, slower than and in line with the projection', () => {
      expect(populationText(1.94, 1.12)).toBe(
        "Testville's population grew by 1.9% a year between 2021 and 2025, faster than the 1.1% a year projected for 2021–2041.",
      );
      expect(populationText(0.5, 1.2)).toBe(
        "Testville's population grew by 0.5% a year between 2021 and 2025, slower than the 1.2% a year projected for 2021–2041.",
      );
      expect(populationText(1.27, 1.19)).toBe(
        "Testville's population grew by 1.3% a year between 2021 and 2025, in line with the 1.2% a year projected for 2021–2041.",
      );
    });

    test('a projection that shows as 0.0% a year is a flat population (R42)', () => {
      expect(populationText(0.5, 0.02)).toBe(
        "Testville's population grew by 0.5% a year between 2021 and 2025, against a flat population projected for 2021–2041.",
      );
      expect(populationText(-0.3, -0.03)).toBe(
        "Testville's population fell by 0.3% a year between 2021 and 2025, against a flat population projected for 2021–2041.",
      );
      expect(populationText(0.02, 0)).toBe(
        "Testville's population grew by 0.0% a year between 2021 and 2025, against a flat population projected for 2021–2041.",
      );
    });

    test('a falling population is never said to grow by a negative rate', () => {
      expect(populationText(-0.3, 0.5)).toBe(
        "Testville's population fell by 0.3% a year between 2021 and 2025, against growth of 0.5% a year projected for 2021–2041.",
      );
      expect(populationText(0.4, -0.2)).toBe(
        "Testville's population grew by 0.4% a year between 2021 and 2025, against a decline of 0.2% a year projected for 2021–2041.",
      );
      expect(populationText(-0.6, -0.2)).toBe(
        "Testville's population fell by 0.6% a year between 2021 and 2025, faster than the 0.2% a year decline projected for 2021–2041.",
      );
      expect(populationText(-0.1, -0.4)).toBe(
        "Testville's population fell by 0.1% a year between 2021 and 2025, slower than the 0.4% a year decline projected for 2021–2041.",
      );
    });

    test('population trend cites ABS ERP and the DPE projections', () => {
      const insights = buildInsights(assess(['lga_blacktown']));
      const growth = insights.find(i => i.id.endsWith(':population_growth'))!;
      expect(growth.citations.map(c => c.short)).toEqual(['ABS ERP', 'NSW DPE projections']);
    });
  });

  test('jobs–housing text', () => {
    const j = jobsHousing(snapshotRecord('lga_blacktown'))!;
    const [jobs] = of(buildInsights(assess(['lga_blacktown'])), 'jobs_housing');
    expect(jobs.text).toBe(
      `Blacktown has ${j.jobsPerResident2021.toFixed(2)} local jobs per resident in 2021, `
      + `projected to be ${j.jobsPerResident2041.toFixed(2)} in 2041 (TfNSW TZP24).`,
    );
    expect(jobs.severity).toBeCloseTo(Math.min(1, Math.abs(j.jobsPerResident2041 - j.jobsPerResident2021) * 2), 10);
    expect(jobs.citations.map(c => c.short)).toContain('TfNSW TZP24');
  });

  test('key needs: the narrative\'s key-need sentence, severity = percentile / 100, never an unscored indicator', () => {
    const a = assess(['lga_brewarrina', 'lga_blacktown', 'lga_sydney']);
    const keyNeeds = of(buildInsights(a), 'key_need');
    const paragraphs = buildNarrative(a).flatMap(s => s.paragraphs.map(p => p.text));
    const expected = a.areas.flatMap(area => area.indicators.filter(s => s.keyNeed));
    expect(keyNeeds).toHaveLength(expected.length);
    for (const insight of keyNeeds) {
      expect(paragraphs).toContain(insight.text);
      const area = a.areas.find(x => x.areaId === insight.areaId)!;
      const score = area.indicators.find(s => insight.id.endsWith(`:${s.id}`))!;
      expect(insight.severity).toBeCloseTo(score.percentile! / 100, 10);
      expect(insight.citations).toEqual([INDICATOR_BY_ID[score.id].source]);
    }
    const brewarrina = a.areas[0].indicators.find(s => s.id === 'indigenous_share')!;
    expect(brewarrina.percentile).toBeGreaterThanOrEqual(80);
    expect(keyNeeds.some(i => i.id.endsWith(':indigenous_share'))).toBe(false);
  });

  test('a combined area is "The combined area" in every insight', () => {
    const a = assess(['lga_camden', 'lga_hills'], 'combined', 'gsyd');
    const insights = buildInsights(a);
    expect(insights.every(i => i.areaId === 'combined')).toBe(true);
    expect(insights.some(i => i.text.includes('Camden') || i.text.includes('Hills'))).toBe(false);
    expect(insights.find(i => i.id.endsWith(':car_dependency') && i.kind === 'trend')!.text)
      .toMatch(/^The combined area's car dependency changed from /);
    expect(insights.find(i => i.id.endsWith(':population_growth'))!.text).toMatch(/^The combined area's population /);
    expect(of(insights, 'mismatch')[0].text).toMatch(/^The combined area's car dependency \(/);
    expect(of(insights, 'growth_service')[0].text).toContain(' in the combined area fall from ');
    expect(of(insights, 'jobs_housing')[0].text).toMatch(/^The combined area has /);
  });

  test('a combined selection of one LGA uses its name', () => {
    const insights = buildInsights(assess(['lga_blacktown'], 'combined'));
    expect(of(insights, 'jobs_housing')[0].text).toMatch(/^Blacktown has /);
  });

  test('buildInsights omits unusable mismatches and sorts by severity', () => {
    const records = weakMetroRecords();
    expect(carDependencyMismatch(records[24], records)!.usable).toBe(false);
    expect(of(buildInsights(assess([records[24].areaId], 'separate', 'nsw', records)), 'mismatch')).toEqual([]);

    const a = assess(['lga_blacktown', 'lga_newcastle', 'lga_sydney', 'lga_brewarrina']);
    const insights = buildInsights(a);
    expect(new Set(insights.map(i => i.kind)).size).toBe(6);
    const kinds: Insight['kind'][] = ['key_need', 'mismatch', 'trend', 'growth_service', 'quadrant', 'jobs_housing'];
    const areaIndex = (i: Insight) => a.areas.findIndex(x => x.areaId === i.areaId);
    for (let k = 1; k < insights.length; k++) {
      const [prev, next] = [insights[k - 1], insights[k]];
      expect(prev.severity).toBeGreaterThanOrEqual(next.severity);
      if (prev.severity === next.severity) {
        const order = (i: Insight) => [kinds.indexOf(i.kind), areaIndex(i)];
        const [pk, pa] = order(prev);
        const [nk, na] = order(next);
        expect(pk < nk || (pk === nk && pa <= na)).toBe(true);
      }
    }
    expect(new Set(insights.map(i => i.id)).size).toBe(insights.length);
  });

  test('buildInsights includes the quadrant insights, with both indicators cited', () => {
    const insights = buildInsights(assess(['lga_blacktown', 'lga_penrith'], 'separate', 'gsyd'));
    const quadrant = of(insights, 'quadrant');
    expect(quadrant.length).toBeGreaterThan(0);
    for (const insight of quadrant) {
      expect(insight.text).toMatch(/^(Blacktown|Penrith) is in the high-(growth|disadvantage), low-service group: /);
      expect(insight.text.endsWith(' among Greater Sydney LGAs.')).toBe(true);
      expect(insight.citations).toHaveLength(2);
    }
  });

  test('ties keep kind order, then area order', () => {
    // Twins A and B tie with each other, and each one's key need (p87.5 of 8) ties with its jobs–housing
    // severity (|0.9375 − 0.5| × 2 = 0.875). All values are exact in binary floating point.
    const twin = (id: string, name: string) => makeRecord(id, {
      name,
      values: { zero_car_households: { value: 50 } },
      series: { populationHistory: [{ year: 2021, population: 1000 }], population2041: 1000, jobs2021: 500, jobs2041: 937.5 },
    });
    const others = Array.from({ length: 6 }, (_, i) => makeRecord(`lga_test_${i}`, { values: { zero_car_households: { value: 5 } } }));
    const records = [...others, twin('lga_test_a', 'A'), twin('lga_test_b', 'B')];
    const insights = buildInsights(assess(['lga_test_b', 'lga_test_a'], 'separate', 'nsw', records));
    expect(insights.map(i => [i.kind, i.areaId, i.severity])).toEqual([
      ['key_need', 'lga_test_b', 0.875], ['key_need', 'lga_test_a', 0.875],
      ['jobs_housing', 'lga_test_b', 0.875], ['jobs_housing', 'lga_test_a', 0.875],
    ]);
  });

  test('never an insight from missing data', () => {
    const empty = makeRecord('lga_test_empty');
    expect(buildInsights(assess(['lga_test_empty'], 'separate', 'nsw', [empty]))).toEqual([]);
    expect(buildInsights(assess([]))).toEqual([]);
  });

  test('every insight is cited', () => {
    const insights = buildInsights(assess(['lga_blacktown', 'lga_newcastle']));
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.every(i => i.citations.length > 0 && i.citations.every(c => c.full.length > 0))).toBe(true);
  });
});
