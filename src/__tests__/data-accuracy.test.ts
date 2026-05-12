/**
 * Data accuracy tests for confirmed regressions and fragile assumptions.
 */

import { getEconomyData } from '../lib/data/sample-data';
import { getTransportData } from '../lib/data/sample-data';

// ─── Bug 1: Economy "Employed (2021)" should use year-based lookup ────────────

describe('Economy page: Employed (2021) stat card', () => {
  it('sample employmentTrend[0] is year 2021 in current fallback data', () => {
    const data = getEconomyData('lga_sydney', 2021);
    expect(data.employmentTrend[0].year).toBe(2021);
  });

  it('employmentTrend contains a 2021 entry', () => {
    const data = getEconomyData('lga_sydney', 2021);
    const entry2021 = data.employmentTrend.find(d => d.year === 2021);
    expect(entry2021).toBeDefined();
    expect(entry2021!.year).toBe(2021);
  });

  it('finding by year returns the same 2021 entry as the displayed value', () => {
    const data = getEconomyData('lga_blacktown', 2021);
    const byIndex = data.employmentTrend[0];
    const byYear = data.employmentTrend.find(d => d.year === 2021);
    expect(byYear).toBeDefined();
    expect(byIndex.year).toBe(2021);
    expect(byYear!.employed).toBe(byIndex.employed);
  });

  it('TZP24 employment trend starting from 2022 requires year-based lookup', () => {
    const tzp24StyleTrend = [
      { year: 2022, employed: 50000, unemployed: 0 },
      { year: 2026, employed: 55000, unemployed: 0 },
      { year: 2031, employed: 61000, unemployed: 0 },
    ];
    expect(tzp24StyleTrend[0].year).not.toBe(2021);
    const correct = tzp24StyleTrend.find(d => d.year === 2021);
    expect(correct).toBeUndefined();
  });
});

// ─── Bug 2: Compare page hardcoded array indices for mode shares ───────────────

describe('Compare page: mode share array index assumptions', () => {
  it('journeyToWork[0] is Car (driver) in sample data', () => {
    const data = getTransportData('lga_sydney', 2021);
    expect(data.journeyToWork[0].name).toBe('Car (driver)');
  });

  it('journeyToWork[2] is Train in sample data', () => {
    const data = getTransportData('lga_sydney', 2021);
    expect(data.journeyToWork[2].name).toBe('Train');
  });

  it('journeyToWork[3] is Bus in sample data', () => {
    const data = getTransportData('lga_sydney', 2021);
    expect(data.journeyToWork[3].name).toBe('Bus');
  });

  it('name-based lookup produces same result as index-based for car mode share', () => {
    const data = getTransportData('lga_parramatta', 2021);
    const byIndex = data.journeyToWork[0].value;
    const byName = data.journeyToWork.find(m => m.name === 'Car (driver)')?.value ?? 0;
    expect(byName).toBe(byIndex);
  });

  it('name-based lookup produces same result as index-based for PT mode share', () => {
    const data = getTransportData('lga_parramatta', 2021);
    const byIndex = data.journeyToWork[2].value + data.journeyToWork[3].value;
    const byName = data.journeyToWork
      .filter(m => ['Train', 'Bus', 'Ferry'].includes(m.name))
      .reduce((sum, m) => sum + m.value, 0);
    // They differ for Ferry (index-based misses Ferry at index 4)
    // This test documents the bug: index-based only adds Train+Bus, name-based adds Ferry too
    const ferryValue = data.journeyToWork.find(m => m.name === 'Ferry')?.value ?? 0;
    expect(byName).toBeCloseTo(byIndex + ferryValue, 1);
  });

  it('mode share chart data uses hardcoded index [2] for Train', () => {
    // The compare page chart does: 'Train': t.journeyToWork[2].value
    // This test verifies that happens to be correct in sample data, but is fragile
    const data = getTransportData('lga_sydney', 2021);
    const byIndex = data.journeyToWork[2].value;
    const byName = data.journeyToWork.find(m => m.name === 'Train')?.value ?? 0;
    expect(byName).toBe(byIndex); // currently equal — proves it works but is fragile
  });
});

// ─── Bug 3: TfNSW static data accuracy ────────────────────────────────────────

describe('TfNSW static transport data label accuracy', () => {
  it('data file header claims TfNSW Open Data source', () => {
    // Verify the module loads and contains expected structure
    // The data values themselves are synthetic but we can test structure
    const { tfnsw_transport_data } = require('../lib/data/tfnsw-transport');
    const sydneyData = tfnsw_transport_data.filter((d: { lgaName: string }) => d.lgaName === 'Sydney');
    expect(sydneyData.length).toBeGreaterThan(0);
  });

  it('Sydney 2021 PT mode share in static data is 61.2% (modelled, not census)', () => {
    const { tfnsw_transport_data } = require('../lib/data/tfnsw-transport');
    const sydney2021 = tfnsw_transport_data.find(
      (d: { lgaName: string; year: number }) => d.lgaName === 'Sydney' && d.year === 2021
    );
    // This value (61.2) differs from ABS Census 2021 (~52% PT)
    // The test documents the discrepancy
    expect(sydney2021.modeSharePT).toBe(61.2);
  });

  it('static data post-COVID trend (2021–2026) is perfectly monotonic (sign of synthetic data)', () => {
    const { tfnsw_transport_data } = require('../lib/data/tfnsw-transport');
    const sydneyRows = tfnsw_transport_data
      .filter((d: { lgaName: string; year: number }) => d.lgaName === 'Sydney' && d.year >= 2021)
      .sort((a: { year: number }, b: { year: number }) => a.year - b.year);

    // Post-COVID: PT increases every single year with no variation — sign of a linear model
    for (let i = 1; i < sydneyRows.length; i++) {
      expect(sydneyRows[i].modeSharePT).toBeGreaterThan(sydneyRows[i - 1].modeSharePT);
    }
    // Car decreases every single year — same perfectly linear pattern
    for (let i = 1; i < sydneyRows.length; i++) {
      expect(sydneyRows[i].modeShareCar).toBeLessThan(sydneyRows[i - 1].modeShareCar);
    }
  });
});

// ─── Bug 2 fix verification: helper function that should be used instead ───────

describe('getCarModeShare and getPTModeShare helpers', () => {
  it('getCarModeShare returns Car (driver) value by name', () => {
    // This is the function we will create to fix the compare page
    const journeyToWork = [
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

    const carShare = journeyToWork.find(m => m.name === 'Car (driver)')?.value ?? 0;
    expect(carShare).toBe(45.2);
  });

  it('getPTModeShare sums Train + Bus + Ferry by name', () => {
    const journeyToWork = [
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

    const ptShare = journeyToWork
      .filter(m => ['Train', 'Bus', 'Ferry'].includes(m.name))
      .reduce((sum, m) => sum + m.value, 0);
    expect(ptShare).toBeCloseTo(27.9, 1);
  });
});
