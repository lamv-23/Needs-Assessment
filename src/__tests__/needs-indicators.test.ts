import { CATCHMENT_NOTE, INDICATORS, INDICATOR_BY_ID, DOMAIN_LABELS, SOURCES } from '@/lib/needs/indicators';
import { extractIndicators, extractSeries } from '@/lib/needs/extract';
import type { IndicatorId } from '@/lib/needs/types';
import { makeBundle } from './fixtures/needs';

describe('indicator registry', () => {
  test('registry has 18 indicators with unique ids and a source each', () => {
    expect(INDICATORS).toHaveLength(18);
    expect(new Set(INDICATORS.map(d => d.id)).size).toBe(18);
    for (const def of INDICATORS) {
      expect(def.source.short.length).toBeGreaterThan(0);
      expect(def.source.full.length).toBeGreaterThan(0);
      expect(INDICATOR_BY_ID[def.id]).toBe(def);
    }
  });

  test('indicators follow the spec table order, grouped by domain; the catchments follow the frequent-stop share', () => {
    expect(INDICATORS.map(d => d.id)).toEqual([
      'car_dependency', 'zero_car_households', 'frequent_stop_share', 'frequent_service_catchment',
      'any_service_catchment', 'am_peak_departures_per_1000', 'commute_distance_km', 'crash_rate',
      'seifa_irsd', 'unemployment_rate', 'low_income_households', 'needs_assistance',
      'limited_english', 'older_residents', 'indigenous_share',
      'pop_growth_2041', 'job_growth_2041', 'approvals_per_1000',
    ]);
    expect(INDICATORS.filter(d => d.domain === 'transport')).toHaveLength(8);
    expect(INDICATORS.filter(d => d.domain === 'socio')).toHaveLength(7);
    expect(INDICATORS.filter(d => d.domain === 'growth')).toHaveLength(3);
  });

  test('need direction is lower for SEIFA, the service-frequency indicators and the catchments only', () => {
    expect(INDICATORS.filter(d => d.direction === 'lower').map(d => d.id)).toEqual([
      'frequent_stop_share', 'frequent_service_catchment', 'any_service_catchment', 'am_peak_departures_per_1000',
      'seifa_irsd',
    ]);
  });

  test('registry: catchment indicators scored; frequent_stop_share and indigenous_share unscored', () => {
    expect(INDICATORS.filter(d => !d.scored).map(d => d.id)).toEqual(['frequent_stop_share', 'indigenous_share']);
    expect(INDICATOR_BY_ID.frequent_service_catchment.scored).toBe(true);
    expect(INDICATOR_BY_ID.any_service_catchment.scored).toBe(true);
  });

  test('the catchments are transport percentages of residents, summed as ratios, with the straight-line source (P2-R3)', () => {
    for (const id of ['frequent_service_catchment', 'any_service_catchment'] as const) {
      expect(INDICATOR_BY_ID[id]).toMatchObject({
        domain: 'transport', unit: '%', direction: 'lower', aggregation: 'ratio', scale: 100, decimals: 1,
        source: SOURCES.catchments,
      });
      expect(INDICATOR_BY_ID[id].label).toContain('(straight-line distance)');
    }
    expect(SOURCES.catchments.short).toBe('ABS Mesh Block Counts 2021 + TfNSW GTFS (straight-line catchments)');
    expect(SOURCES.catchments.full).toContain('straight-line distance');
  });

  test('P2-R17: the catchment labels say AM-peak, since only stops with weekday 7-9am departures count', () => {
    expect(INDICATOR_BY_ID.frequent_service_catchment.label)
      .toBe('Residents near frequent AM-peak public transport (straight-line distance)');
    expect(INDICATOR_BY_ID.any_service_catchment.label)
      .toBe('Residents near any AM-peak public transport (straight-line distance)');
  });

  test('P2-R17: the catchment note defines both measures', () => {
    expect(CATCHMENT_NOTE).toBe(
      'Share of residents living within a straight-line 400 m (bus, light rail) or 800 m (train, metro, ferry) of a '
      + 'stop with weekday 7–9am departures — frequent: 8 or more departures; any: at least 1. School-only services '
      + 'are excluded. Straight-line distance overstates real walking access.',
    );
  });

  test('every indicator is assessed for LGAs; SA2s get the spec subset (no growth domain)', () => {
    expect(INDICATORS.every(d => d.levels.includes('lga'))).toBe(true);
    expect(INDICATORS.filter(d => d.levels.includes('sa2')).map(d => d.id)).toEqual([
      'car_dependency', 'zero_car_households', 'frequent_service_catchment', 'any_service_catchment',
      'seifa_irsd', 'unemployment_rate', 'low_income_households', 'needs_assistance', 'limited_english',
      'older_residents', 'indigenous_share',
    ]);
    expect(INDICATORS.filter(d => d.levels.includes('sa2') && d.domain === 'growth')).toEqual([]);
  });

  test('car dependency, commute distance, SEIFA and unemployment aggregate as weighted means; the rest as ratios', () => {
    const weighted: IndicatorId[] = ['car_dependency', 'commute_distance_km', 'seifa_irsd', 'unemployment_rate'];
    for (const def of INDICATORS) {
      expect(def.aggregation).toBe(weighted.includes(def.id) ? 'weighted' : 'ratio');
      if (def.aggregation === 'weighted') expect(def.scale).toBe(1);
    }
  });

  test('domain labels', () => {
    expect(DOMAIN_LABELS).toEqual({
      transport: 'Transport disadvantage',
      socio: 'Socio-economic disadvantage',
      growth: 'Growth pressure',
    });
  });
});

describe('extractIndicators', () => {
  test('returns an entry for every registered indicator', () => {
    const v = extractIndicators(makeBundle());
    expect(Object.keys(v).sort()).toEqual(INDICATORS.map(d => d.id).sort());
  });

  test('older residents and Indigenous share', () => {
    const v = extractIndicators(makeBundle());
    expect(v.older_residents).toMatchObject({ value: 10, numerator: 40000, denominator: 400000 });
    expect(v.indigenous_share.value).toBeCloseTo(2.95, 2);
    expect(extractIndicators(makeBundle({ demographics: { indigenousPopulation: undefined } })).indigenous_share.value).toBeNull();
  });

  test('car_dependency excludes work from home from the denominator', () => {
    expect(extractIndicators(makeBundle()).car_dependency.value).toBeCloseTo(51.1 / 61 * 100, 1); // 83.8
  });

  test('ratio indicators carry numerator and denominator', () => {
    const v = extractIndicators(makeBundle());
    expect(v.zero_car_households).toEqual({ value: expect.closeTo(6.74, 2), numerator: 8045, denominator: 119420 });
    expect(v.frequent_stop_share).toMatchObject({ value: 25, numerator: 50, denominator: 200 });
    expect(v.am_peak_departures_per_1000).toMatchObject({ value: 12, numerator: 4800, denominator: 400000 });
    expect(v.frequent_service_catchment).toEqual({ value: 60, numerator: 240000, denominator: 400000 });
    expect(v.any_service_catchment).toEqual({ value: 95, numerator: 380000, denominator: 400000 });
    expect(v.pop_growth_2041).toMatchObject({ value: 50, numerator: 200000, denominator: 400000 });
    expect(v.job_growth_2041.value).toBe(50);
    expect(v.crash_rate.value).toBe(25);           // latest year 2023: 1000 / 400000 (2021 ERP, the nearest) × 10,000
    expect(v.approvals_per_1000.value).toBe(10);
    expect(v.low_income_households.value).toBeCloseTo(9.14, 2);
    expect(v.needs_assistance).toMatchObject({ numerator: 21032, denominator: 400000 });
    expect(v.limited_english).toMatchObject({ numerator: 20903, denominator: 400000 });
  });

  test('crash rate is the latest year\'s crashes per 10,000 residents of that year (ERP), not the Census count', () => {
    const withErp = (populationHistory: { year: number; population: number }[]) =>
      extractIndicators(makeBundle({ growth: { populationHistory } })).crash_rate;
    // Latest crash year 2023: 1,000 crashes
    expect(withErp([{ year: 2021, population: 400000 }, { year: 2023, population: 500000 }]))
      .toEqual({ value: 20, numerator: 1000, denominator: 500000 });
    // No 2023 ERP: the nearest year's
    expect(withErp([{ year: 2021, population: 380000 }, { year: 2024, population: 440000 }]))
      .toEqual({ value: (1000 * 10000) / 440000, numerator: 1000, denominator: 440000 });
    expect(withErp([{ year: 2021, population: 380000 }]))
      .toEqual({ value: (1000 * 10000) / 380000, numerator: 1000, denominator: 380000 });
    // Equally near: the earlier year
    expect(withErp([{ year: 2022, population: 390000 }, { year: 2024, population: 410000 }]).denominator).toBe(390000);
    expect(withErp([]).value).toBeNull();
  });

  test('weighted indicators carry the value only', () => {
    const v = extractIndicators(makeBundle());
    expect(v.seifa_irsd).toEqual({ value: 987 });
    expect(v.unemployment_rate).toEqual({ value: 5.8 });
    expect(v.commute_distance_km).toEqual({ value: 18.2 });
  });

  test('crash rate uses the latest year that has a crash count', () => {
    const v = extractIndicators(makeBundle({
      transport: {
        crashTrend: [
          { year: 2022, totalCrashes: 800, fatalCrashes: 5, injuryCrashes: 400 },
          { year: 2024, totalCrashes: undefined as unknown as number, fatalCrashes: 0, injuryCrashes: 0 },
        ],
      },
    }));
    expect(v.crash_rate).toMatchObject({ value: 20, numerator: 800, denominator: 400000 });
  });

  test('missing sources yield null, never 0', () => {
    const v = extractIndicators(makeBundle({
      transport: { ptFrequency: undefined, crashTrend: [], commuteDistance2016: undefined, catchment: undefined },
    }));
    expect(v.frequent_stop_share.value).toBeNull();
    expect(v.frequent_service_catchment).toEqual({ value: null });
    expect(v.any_service_catchment).toEqual({ value: null });
    expect(v.am_peak_departures_per_1000.value).toBeNull();
    expect(v.crash_rate.value).toBeNull();
    expect(v.commute_distance_km.value).toBeNull();
  });

  test('missing optional demographic and economy fields yield null, never 0', () => {
    const v = extractIndicators(makeBundle({
      demographics: { needsAssistance: undefined, limitedEnglish: undefined, ageDistribution: [] },
      economy: { lowIncomeHouseholds: undefined, householdIncomeDistribution: undefined },
      transport: { vehicleOwnershipRaw: undefined, journeyToWork: [] },
      growth: { rollingAnnualApprovals: undefined },
    }));
    for (const id of ['needs_assistance', 'limited_english', 'older_residents', 'low_income_households',
      'zero_car_households', 'car_dependency', 'approvals_per_1000'] as const) {
      expect(v[id]).toEqual({ value: null });
    }
  });

  test('a zero denominator yields null, not Infinity or 0', () => {
    const v = extractIndicators(makeBundle({
      demographics: { totalPopulation: 0 },
      transport: {
        vehicleOwnershipRaw: { noCar: 0, oneCar: 0, twoCars: 0, threePlusCars: 0, totalDwellings: 0 },
        ptFrequency: { totalStops: 0, frequentStops: 0 },
        catchment: { persons: 0, frequentPersons: 0, anyPersons: 0, frequentShare: null, anyShare: null },
      },
      economy: { householdIncomeDistribution: [] },
      growth: { populationHistory: [{ year: 2021, population: 0 }] },   // crash_rate's denominator is the ERP
    }));
    for (const id of ['older_residents', 'indigenous_share', 'needs_assistance', 'limited_english', 'crash_rate',
      'approvals_per_1000', 'zero_car_households', 'frequent_stop_share', 'low_income_households',
      'frequent_service_catchment', 'any_service_catchment'] as const) {
      expect(v[id]).toEqual({ value: null });
    }
  });

  test('a genuine zero is kept as a value', () => {
    const v = extractIndicators(makeBundle({
      demographics: { indigenousPopulation: 0 },
      transport: {
        ptFrequency: { frequentStops: 0, frequentStopShare: 0, amPeakDepartures: 0, departuresPer1000Residents: 0 },
        catchment: { frequentPersons: 0, frequentShare: 0 },
      },
    }));
    expect(v.frequent_service_catchment).toEqual({ value: 0, numerator: 0, denominator: 400000 });
    expect(v.indigenous_share).toMatchObject({ value: 0, numerator: 0, denominator: 400000 });
    expect(v.frequent_stop_share).toMatchObject({ value: 0, numerator: 0, denominator: 200 });
    expect(v.am_peak_departures_per_1000).toMatchObject({ value: 0, numerator: 0, denominator: 400000 });
  });

  test('pop growth falls back to the 2021 projection when history lacks 2021', () => {
    const v = extractIndicators(makeBundle({
      growth: {
        populationHistory: [{ year: 2019, population: 390000 }],
        populationProjections: [{ year: 2021, population: 380000 }, { year: 2041, population: 570000 }],
      },
    }));
    expect(v.pop_growth_2041).toMatchObject({ value: 50, numerator: 190000, denominator: 380000 });
  });

  test('growth is null when the 2041 projection or the 2021 base is missing', () => {
    expect(extractIndicators(makeBundle({ growth: { populationProjections: [] } })).pop_growth_2041.value).toBeNull();
    expect(extractIndicators(makeBundle({ growth: { populationHistory: [] } })).pop_growth_2041.value).toBeNull();
    expect(extractIndicators(makeBundle({ growth: { employmentGrowth: [{ year: 2021, jobs: 140000 }] } })).job_growth_2041.value).toBeNull();
    expect(extractIndicators(makeBundle({ growth: { employmentGrowth: [] } })).job_growth_2041.value).toBeNull();
  });
});

describe('extractSeries', () => {
  /** n consecutive months ending at endYear/endMonth, with a count of 1, 2, 3 ... oldest to newest. */
  function months(n: number, endYear = 2025, endMonth = 12) {
    return Array.from({ length: n }, (_, i) => {
      const index = endYear * 12 + (endMonth - 1) - (n - 1 - i);
      return { year: Math.floor(index / 12), month: (index % 12) + 1, residentialCount: i + 1 };
    });
  }
  const sum = (from: number, to: number) => (from + to) * (to - from + 1) / 2;

  /** The fixture's car_dependency indicator: (47 + 4.1) ÷ (100 − 39) × 100 = 83.77. */
  const indicator2021 = extractIndicators(makeBundle()).car_dependency.value!;

  test('car dependency by year excludes WFH; 2021 is the car_dependency indicator, not modeShareTrend', () => {
    const s = extractSeries(makeBundle({
      transport: {
        modeShareTrend: [
          { year: 2011, car: 70, train: 8, bus: 5, active: 5, wfh: 5 },
          { year: 2021, car: 60, train: 5, bus: 3, active: 4, wfh: 25 },   // would be 80
        ],
      },
    }));
    expect(s.carDependencyByYear).toHaveLength(2);
    expect(s.carDependencyByYear[0].year).toBe(2011);
    expect(s.carDependencyByYear[0].value).toBeCloseTo(73.684, 3);
    expect(s.carDependencyByYear[1]).toEqual({ year: 2021, value: indicator2021 });
    expect(indicator2021).toBeCloseTo(83.77, 2);
  });

  test('car dependency by year omits years with no data, never 0', () => {
    const point = (year: number, car: number, wfh: number) => ({ year, car, train: 0, bus: 0, active: 0, wfh });
    const s = extractSeries(makeBundle({
      transport: {
        modeShareTrend: [
          point(2011, 70, 100),                                   // everyone works from home: no denominator
          point(2016, undefined as unknown as number, 10),        // car share missing
        ],
      },
    }));
    expect(s.carDependencyByYear).toEqual([{ year: 2021, value: indicator2021 }]);
  });

  test('no 2021 point without a car_dependency indicator value, whatever modeShareTrend holds', () => {
    const bundle = makeBundle({
      transport: {
        journeyToWork: [{ name: 'Car (driver)', value: 47 }, { name: 'Car (passenger)', value: 4.1 }],   // no WFH
        modeShareTrend: [
          { year: 2016, car: 60, train: 5, bus: 3, active: 4, wfh: 4 },
          { year: 2021, car: 60, train: 5, bus: 3, active: 4, wfh: 25 },
        ],
      },
    });
    expect(extractIndicators(bundle).car_dependency.value).toBeNull();
    expect(extractSeries(bundle).carDependencyByYear).toEqual([{ year: 2016, value: 62.5 }]);
  });

  test('car dependency by year is sorted and limited to the Census years', () => {
    const point = (year: number, car: number) => ({ year, car, train: 0, bus: 0, active: 0, wfh: 0 });
    const s = extractSeries(makeBundle({
      transport: { modeShareTrend: [point(2021, 60), point(2019, 99), point(2011, 50), point(2016, 55)] },
    }));
    expect(s.carDependencyByYear).toEqual([
      { year: 2011, value: 50 }, { year: 2016, value: 55 }, { year: 2021, value: indicator2021 },
    ]);
    expect(extractSeries(makeBundle()).carDependencyByYear).toEqual([{ year: 2021, value: indicator2021 }]);
  });

  test('crashes by year come from crashTrend in year order, skipping years with no count', () => {
    const s = extractSeries(makeBundle({
      transport: {
        crashTrend: [
          { year: 2023, totalCrashes: 1000, fatalCrashes: 9, injuryCrashes: 540 },
          { year: 2022, totalCrashes: 900, fatalCrashes: 8, injuryCrashes: 500 },
          { year: 2024, totalCrashes: undefined as unknown as number, fatalCrashes: 0, injuryCrashes: 0 },
        ],
      },
    }));
    expect(s.crashesByYear).toEqual([{ year: 2022, total: 900 }, { year: 2023, total: 1000 }]);
    expect(extractSeries(makeBundle({ transport: { crashTrend: undefined } })).crashesByYear).toEqual([]);
  });

  test('population history is the ERP series in year order; 2041 population and AM-peak departures are single values', () => {
    const s = extractSeries(makeBundle({
      growth: { populationHistory: [{ year: 2022, population: 410000 }, { year: 2021, population: 400000 }] },
    }));
    expect(s.populationHistory).toEqual([{ year: 2021, population: 400000 }, { year: 2022, population: 410000 }]);
    expect(s.population2041).toBe(600000);
    expect(s.amPeakDepartures).toBe(4800);
  });

  test('missing 2041 population and AM-peak departures are null, a genuine zero is kept', () => {
    const missing = extractSeries(makeBundle({ growth: { populationProjections: [] }, transport: { ptFrequency: undefined } }));
    expect(missing.population2041).toBeNull();
    expect(missing.amPeakDepartures).toBeNull();
    expect(extractSeries(makeBundle({ transport: { ptFrequency: { amPeakDepartures: 0 } } })).amPeakDepartures).toBe(0);
  });

  test('jobs in 2021 and 2041', () => {
    expect(extractSeries(makeBundle())).toMatchObject({ jobs2021: 140000, jobs2041: 210000 });
    const s = extractSeries(makeBundle({ growth: { employmentGrowth: [{ year: 2021, jobs: 140000 }] } }));
    expect(s).toMatchObject({ jobs2021: 140000, jobs2041: null });
    expect(extractSeries(makeBundle({ growth: { employmentGrowth: [] } }))).toMatchObject({ jobs2021: null, jobs2041: null });
  });

  test('approvals need 24 months', () => {
    const short = extractSeries(makeBundle({ growth: { buildingApprovals: months(23) } }));
    expect(short.approvalsLast12).toBeNull();
    expect(short.approvalsPrev12).toBeNull();

    const full = extractSeries(makeBundle({ growth: { buildingApprovals: months(24) } }));
    expect(full.approvalsPrev12).toBe(sum(1, 12));
    expect(full.approvalsLast12).toBe(sum(13, 24));

    const absent = extractSeries(makeBundle());
    expect([absent.approvalsLast12, absent.approvalsPrev12]).toEqual([null, null]);
  });

  test('approvals use the 24 most recent months, whatever the order', () => {
    const shuffled = [...months(30)].reverse();
    const s = extractSeries(makeBundle({ growth: { buildingApprovals: shuffled } }));
    expect(s.approvalsPrev12).toBe(sum(7, 18));
    expect(s.approvalsLast12).toBe(sum(19, 30));
  });

  test('approvals are null when the latest 24 months have a gap, and a genuine zero is kept', () => {
    const gap = months(25).filter((_, i) => i !== 5);              // 24 entries spanning 25 months
    const gapped = extractSeries(makeBundle({ growth: { buildingApprovals: gap } }));
    expect([gapped.approvalsLast12, gapped.approvalsPrev12]).toEqual([null, null]);

    const old = months(30).filter((_, i) => i !== 2);               // the gap is older than the latest 24 months
    expect(extractSeries(makeBundle({ growth: { buildingApprovals: old } })).approvalsLast12).toBe(sum(19, 30));

    const zeros = months(24).map(m => ({ ...m, residentialCount: 0 }));
    const s = extractSeries(makeBundle({ growth: { buildingApprovals: zeros } }));
    expect([s.approvalsLast12, s.approvalsPrev12]).toEqual([0, 0]);
  });
});
