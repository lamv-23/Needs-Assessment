/**
 * Shared fixtures for the needs-assessment tests.
 * `makeBundle()` returns a Blacktown-like LiveBundle; override any field with a
 * deep partial. Arrays are replaced whole, and an explicit `undefined` clears
 * an optional field (the "source missing" case).
 */

import type { InsightSeries, LiveBundle } from '@/lib/needs/types';

export type DeepPartial<T> =
  T extends readonly unknown[] ? T :
  T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } :
  T;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function merge<T>(base: T, overrides: DeepPartial<T> | undefined): T {
  if (!isPlainObject(base) || !isPlainObject(overrides)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overrides)) {
    const next = overrides[key];
    out[key] = isPlainObject(next) && isPlainObject(out[key]) ? merge(out[key], next) : next;
  }
  return out as T;
}

/** A series with nothing in it, for records the test does not read a series from. */
export const EMPTY_SERIES: InsightSeries = {
  carDependencyByYear: [],
  crashesByYear: [],
  populationHistory: [],
  population2041: null,
  amPeakDepartures: null,
  approvalsLast12: null,
  approvalsPrev12: null,
  jobs2021: null,
  jobs2041: null,
};

export function makeBundle(overrides: DeepPartial<LiveBundle> = {}): LiveBundle {
  const base: LiveBundle = {
    demographics: {
      totalPopulation: 400000,
      malePopulation: 199000,
      femalePopulation: 201000,
      medianAge: 34,
      ageDistribution: [
        { ageGroup: '0-4', male: 15000, female: 14000 },
        { ageGroup: '5-14', male: 30000, female: 29000 },
        { ageGroup: '15-24', male: 25000, female: 24000 },
        { ageGroup: '25-34', male: 31000, female: 30000 },
        { ageGroup: '35-44', male: 34000, female: 33000 },
        { ageGroup: '45-54', male: 24000, female: 24000 },
        { ageGroup: '55-64', male: 19000, female: 19000 },
        { ageGroup: '65-74', male: 13000, female: 14000 },
        { ageGroup: '75+', male: 7000, female: 6000 },
      ],
      countriesOfBirth: [{ name: 'Australia', value: 200000 }],
      householdComposition: [{ name: 'Family household', value: 100000 }],
      seifaScore: 987,
      populationDensity: 1100,
      limitedEnglish: 20903,
      needsAssistance: 21032,
      indigenousPopulation: 11812,
    },
    transport: {
      journeyToWork: [
        { name: 'Car (driver)', value: 47 },
        { name: 'Car (passenger)', value: 4.1 },
        { name: 'Train', value: 4 },
        { name: 'Bus', value: 3 },
        { name: 'Walking', value: 1.9 },
        { name: 'Cycling', value: 1 },
        { name: 'Work from home', value: 39 },
      ],
      vehicleOwnership: [{ name: 'No car', value: 6.7 }],
      modeShareTrend: [],
      ptPatronage: null,
      avgCommute: null,
      vehicleOwnershipRaw: { noCar: 8045, oneCar: 40000, twoCars: 50000, threePlusCars: 21375, totalDwellings: 119420 },
      ptFrequency: {
        serviceDate: '20260317',
        totalStops: 200,
        servicedStops: 180,
        frequentStops: 50,
        frequentStopShare: 25,
        amPeakDepartures: 4800,
        frequentStopsByMode: { train: 5, metro: 0, lightRail: 0, ferry: 0, bus: 45 },
        source: 'tfnsw_gtfs',
        departuresPer1000Residents: 12,
      },
      commuteDistance2016: { avgKm: 18.2, medianKm: 12 },
      crashTrend: [
        { year: 2022, totalCrashes: 900, fatalCrashes: 8, injuryCrashes: 500 },
        { year: 2023, totalCrashes: 1000, fatalCrashes: 9, injuryCrashes: 540 },
      ],
    },
    economy: {
      employmentByIndustry: [],
      unemploymentRate: 5.8,
      participationRate: 64,
      medianWeeklyIncome: 1900,
      jobDensity: null,
      employmentTrend: [],
      householdIncomeDistribution: [
        { label: 'Low income', count: 10967 },
        { label: 'Middle income', count: 70000 },
        { label: 'High income', count: 39033 },
      ],
      lowIncomeHouseholds: 10967,
    },
    growth: {
      populationHistory: [{ year: 2021, population: 400000 }],
      populationProjections: [{ year: 2041, population: 600000 }],
      employmentGrowth: [{ year: 2021, jobs: 140000 }, { year: 2041, jobs: 210000 }],
      annualGrowthRate: 1.5,
      projectedGrowthRate: 2,
      rollingAnnualApprovals: 4000,
    },
  };
  return merge<LiveBundle>(base, overrides);
}
