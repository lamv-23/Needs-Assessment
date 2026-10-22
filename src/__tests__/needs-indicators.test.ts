import { INDICATORS, INDICATOR_BY_ID, DOMAIN_LABELS } from '@/lib/needs/indicators';
import { extractIndicators } from '@/lib/needs/extract';
import type { IndicatorId } from '@/lib/needs/types';
import { makeBundle } from './fixtures/needs';

describe('indicator registry', () => {
  test('registry has 16 indicators with unique ids and a source each', () => {
    expect(INDICATORS).toHaveLength(16);
    expect(new Set(INDICATORS.map(d => d.id)).size).toBe(16);
    for (const def of INDICATORS) {
      expect(def.source.short.length).toBeGreaterThan(0);
      expect(def.source.full.length).toBeGreaterThan(0);
      expect(INDICATOR_BY_ID[def.id]).toBe(def);
    }
  });

  test('indicators follow the spec table order, grouped by domain', () => {
    expect(INDICATORS.map(d => d.id)).toEqual([
      'car_dependency', 'zero_car_households', 'frequent_stop_share', 'am_peak_departures_per_1000',
      'commute_distance_km', 'crash_rate',
      'seifa_irsd', 'unemployment_rate', 'low_income_households', 'needs_assistance',
      'limited_english', 'older_residents', 'indigenous_share',
      'pop_growth_2041', 'job_growth_2041', 'approvals_per_1000',
    ]);
    expect(INDICATORS.filter(d => d.domain === 'transport')).toHaveLength(6);
    expect(INDICATORS.filter(d => d.domain === 'socio')).toHaveLength(7);
    expect(INDICATORS.filter(d => d.domain === 'growth')).toHaveLength(3);
  });

  test('need direction is lower for SEIFA and the two service-frequency indicators only', () => {
    expect(INDICATORS.filter(d => d.direction === 'lower').map(d => d.id)).toEqual([
      'frequent_stop_share', 'am_peak_departures_per_1000', 'seifa_irsd',
    ]);
  });

  test('indigenous_share is the only unscored indicator', () => {
    expect(INDICATORS.filter(d => !d.scored).map(d => d.id)).toEqual(['indigenous_share']);
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
    expect(v.pop_growth_2041).toMatchObject({ value: 50, numerator: 200000, denominator: 400000 });
    expect(v.job_growth_2041.value).toBe(50);
    expect(v.crash_rate.value).toBe(25);           // latest year 2023: 1000 / 400000 × 10,000
    expect(v.approvals_per_1000.value).toBe(10);
    expect(v.low_income_households.value).toBeCloseTo(9.14, 2);
    expect(v.needs_assistance).toMatchObject({ numerator: 21032, denominator: 400000 });
    expect(v.limited_english).toMatchObject({ numerator: 20903, denominator: 400000 });
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
    const v = extractIndicators(makeBundle({ transport: { ptFrequency: undefined, crashTrend: [], commuteDistance2016: undefined } }));
    expect(v.frequent_stop_share.value).toBeNull();
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
      },
      economy: { householdIncomeDistribution: [] },
    }));
    for (const id of ['older_residents', 'indigenous_share', 'needs_assistance', 'limited_english', 'crash_rate',
      'approvals_per_1000', 'zero_car_households', 'frequent_stop_share', 'low_income_households'] as const) {
      expect(v[id]).toEqual({ value: null });
    }
  });

  test('a genuine zero is kept as a value', () => {
    const v = extractIndicators(makeBundle({
      demographics: { indigenousPopulation: 0 },
      transport: { ptFrequency: { frequentStops: 0, frequentStopShare: 0, amPeakDepartures: 0, departuresPer1000Residents: 0 } },
    }));
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
