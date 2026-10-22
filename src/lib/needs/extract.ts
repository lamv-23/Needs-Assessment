import type { DemographicsData, EconomyData, GrowthData, TransportData } from '@/lib/data/sample-data';
import type { IndicatorId, IndicatorValue, InsightSeries, LiveBundle } from './types';

/**
 * The live data fields the indicators read. A LiveBundle has them all; an SA2's decoded Census tables fill the ones
 * its indicators need (see sa2.ts), so both go through the same formulas. A SEIFA score or unemployment rate
 * that is missing is null.
 */
export interface IndicatorInputs {
  demographics: Pick<
    DemographicsData, 'totalPopulation' | 'ageDistribution' | 'needsAssistance' | 'limitedEnglish' | 'indigenousPopulation'
  > & { seifaScore: number | null };
  transport: Pick<
    TransportData, 'journeyToWork' | 'vehicleOwnershipRaw' | 'ptFrequency' | 'commuteDistance2016' | 'crashTrend' | 'catchment'
  >;
  economy: Pick<EconomyData, 'lowIncomeHouseholds' | 'householdIncomeDistribution'> & { unemploymentRate: number | null };
  growth: Pick<GrowthData, 'populationHistory' | 'populationProjections' | 'employmentGrowth' | 'rollingAnnualApprovals'>;
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** A missing source or a zero denominator is `null`, never 0. */
const missing = (): IndicatorValue => ({ value: null });

/** numerator ÷ denominator × scale, keeping both parts so ratios can be summed across LGAs. */
function ratio(numerator: number | null | undefined, denominator: number | null | undefined, scale: number): IndicatorValue {
  if (!isNum(numerator) || !isNum(denominator) || denominator <= 0) return missing();
  return { value: (numerator * scale) / denominator, numerator, denominator };
}

/** Keep the pipeline's own published value, adding the parts needed to sum it across LGAs. */
function withParts(value: number | null | undefined, parts: IndicatorValue): IndicatorValue {
  return isNum(value) && parts.value !== null ? { ...parts, value } : missing();
}

const latest = <T extends { year: number }>(items: T[]): T | undefined =>
  items.reduce<T | undefined>((best, item) => (!best || item.year > best.year ? item : best), undefined);

/** A year's population in a series, ignoring entries that are not a positive number. */
function populationIn(series: { year: number; population: number }[], year: number): number | null {
  const entry = series.find(p => p.year === year && isNum(p.population) && p.population > 0);
  return entry ? entry.population : null;
}

/**
 * The population of `year`, else of the nearest year (equally near: the earlier), ignoring entries that are
 * not a positive number; null when there are none.
 */
export function populationNearest(series: { year: number; population: number }[], year: number): number | null {
  const nearer = (a: { year: number }, b: { year: number }) =>
    Math.abs(a.year - year) < Math.abs(b.year - year)
    || (Math.abs(a.year - year) === Math.abs(b.year - year) && a.year < b.year);
  const best = series
    .filter(p => isNum(p.year) && isNum(p.population) && p.population > 0)
    .reduce<{ year: number; population: number } | null>((found, p) => (!found || nearer(p, found) ? p : found), null);
  return best ? best.population : null;
}

/** A year's job count, ignoring entries that are not a positive number. */
function jobsIn(series: { year: number; jobs: number }[], year: number): number | null {
  const entry = series.find(j => j.year === year && isNum(j.jobs) && j.jobs > 0);
  return entry ? entry.jobs : null;
}

/** Growth from base to target as a ratio: the numerator is the increase, the denominator the base. */
function growth(base: number | null, target: number | null): IndicatorValue {
  return isNum(base) && isNum(target) ? ratio(target - base, base, 100) : missing();
}

/** Car share of commuters who travel to a workplace, car ÷ (100 − wfh) × 100; null without a usable denominator. */
function carShareOfTravellers(car: number | undefined, workFromHome: number | undefined): number | null {
  return isNum(car) && isNum(workFromHome) && workFromHome < 100 ? (car * 100) / (100 - workFromHome) : null;
}

/** 2021 car dependency (work from home excluded) from method of travel to work: the car_dependency indicator. */
function carDependency2021(transport: Pick<TransportData, 'journeyToWork'>): number | null {
  const modeShare = (name: string) => transport.journeyToWork.find(m => m.name === name)?.value;
  const carDriver = modeShare('Car (driver)');
  const carPassenger = modeShare('Car (passenger)');
  return isNum(carDriver) && isNum(carPassenger)
    ? carShareOfTravellers(carDriver + carPassenger, modeShare('Work from home'))
    : null;
}

/** Turn one LGA's live data (or an SA2's Census tables, as `IndicatorInputs`) into the 18 indicator values. */
export function extractIndicators(bundle: IndicatorInputs): Record<IndicatorId, IndicatorValue> {
  const { demographics, transport, economy, growth: growthData } = bundle;
  const population = demographics.totalPopulation;

  // Car dependency: car share of commuters who travel to a workplace (work from home excluded)
  const carDependencyValue = carDependency2021(transport);
  const carDependency: IndicatorValue = carDependencyValue === null ? missing() : { value: carDependencyValue };

  // Service frequency: the published (1 dp) values, with the parts needed to aggregate them.
  // Departures per 1,000 use the latest ERP year, the same denominator the pipeline used.
  const frequency = transport.ptFrequency;
  const latestErp = latest(growthData.populationHistory.filter(p => isNum(p.population) && p.population > 0));
  const frequentStopShare = frequency
    ? withParts(frequency.frequentStopShare, ratio(frequency.frequentStops, frequency.totalStops, 100))
    : missing();
  const departuresPer1000 = frequency
    ? withParts(frequency.departuresPer1000Residents, ratio(frequency.amPeakDepartures, latestErp?.population, 1000))
    : missing();

  const latestCrashYear = latest((transport.crashTrend ?? []).filter(c => isNum(c.totalCrashes)));

  // Straight-line walking catchments: residents (mesh-block persons) near a stop with frequent or any service
  const catchment = transport.catchment;

  const vehicles = transport.vehicleOwnershipRaw;
  const incomeHouseholds = economy.householdIncomeDistribution
    ?.reduce((sum, band) => sum + (isNum(band.count) ? band.count : 0), 0);

  const ageGroup = (label: string) => demographics.ageDistribution.find(a => a.ageGroup === label);
  const age65to74 = ageGroup('65-74');
  const age75plus = ageGroup('75+');
  const olderResidents = age65to74 && age75plus
    ? ratio(age65to74.male + age65to74.female + age75plus.male + age75plus.female, population, 100)
    : missing();

  // Base year 2021: ERP history, else the 2021 projection
  const populationBase = populationIn(growthData.populationHistory, 2021) ?? populationIn(growthData.populationProjections, 2021);

  return {
    car_dependency: carDependency,
    zero_car_households: ratio(vehicles?.noCar, vehicles?.totalDwellings, 100),
    frequent_stop_share: frequentStopShare,
    frequent_service_catchment: ratio(catchment?.frequentPersons, catchment?.persons, 100),
    any_service_catchment: ratio(catchment?.anyPersons, catchment?.persons, 100),
    am_peak_departures_per_1000: departuresPer1000,
    commute_distance_km: isNum(transport.commuteDistance2016?.avgKm)
      ? { value: transport.commuteDistance2016.avgKm }
      : missing(),
    // Per 10,000 residents of the crash year (ERP), so rates in growing LGAs are not overstated
    crash_rate: latestCrashYear
      ? ratio(latestCrashYear.totalCrashes, populationNearest(growthData.populationHistory, latestCrashYear.year), 10000)
      : missing(),

    // SEIFA scores are never 0, so a 0 is an absent value
    seifa_irsd: isNum(demographics.seifaScore) && demographics.seifaScore > 0
      ? { value: demographics.seifaScore }
      : missing(),
    unemployment_rate: isNum(economy.unemploymentRate) ? { value: economy.unemploymentRate } : missing(),
    low_income_households: ratio(economy.lowIncomeHouseholds, incomeHouseholds, 100),
    needs_assistance: ratio(demographics.needsAssistance, population, 100),
    limited_english: ratio(demographics.limitedEnglish, population, 100),
    older_residents: olderResidents,
    indigenous_share: ratio(demographics.indigenousPopulation, population, 100),

    pop_growth_2041: growth(populationBase, populationIn(growthData.populationProjections, 2041)),
    job_growth_2041: growth(jobsIn(growthData.employmentGrowth, 2021), jobsIn(growthData.employmentGrowth, 2041)),
    approvals_per_1000: ratio(growthData.rollingAnnualApprovals, population, 1000),
  };
}

/** Census years whose car dependency comes from modeShareTrend; 2021 is the car_dependency indicator. */
const EARLIER_CENSUS_YEARS = [2011, 2016] as const;

/** Building approvals over the latest 12 months and the 12 before; null unless the latest 24 months are consecutive. */
function approvalsWindows(
  periods: { year: number; month: number; residentialCount: number }[] | undefined,
): Pick<InsightSeries, 'approvalsLast12' | 'approvalsPrev12'> {
  const none = { approvalsLast12: null, approvalsPrev12: null };
  const months = (periods ?? [])
    .filter(p => isNum(p.year) && Number.isInteger(p.month) && p.month >= 1 && p.month <= 12 && isNum(p.residentialCount))
    .map(p => ({ index: p.year * 12 + p.month - 1, count: p.residentialCount }))
    .sort((a, b) => a.index - b.index)
    .slice(-24);
  if (months.length < 24 || months.some((m, i) => i > 0 && m.index - months[i - 1].index !== 1)) return none;
  const total = (window: typeof months) => window.reduce((sum, m) => sum + m.count, 0);
  return { approvalsLast12: total(months.slice(12)), approvalsPrev12: total(months.slice(0, 12)) };
}

/** Turn one LGA's live data into the time series the Part B insights draw on. */
export function extractSeries(bundle: LiveBundle): InsightSeries {
  const { transport, growth: growthData } = bundle;

  // Same definition as car_dependency: work from home excluded (modeShareTrend's car share is of all workers).
  // The 2021 point is the car_dependency indicator itself (journeyToWork), so one 2021 figure is used everywhere;
  // modeShareTrend's own 2021 point can differ from it by a few tenths of a percentage point.
  const earlier = EARLIER_CENSUS_YEARS.flatMap(year => {
    const point = transport.modeShareTrend.find(p => p.year === year);
    const value = point ? carShareOfTravellers(point.car, point.wfh) : null;
    return value === null ? [] : [{ year, value }];
  });
  const latest2021 = carDependency2021(transport);
  const carDependencyByYear: InsightSeries['carDependencyByYear'] =
    latest2021 === null ? earlier : [...earlier, { year: 2021, value: latest2021 }];

  const crashesByYear = (transport.crashTrend ?? [])
    .filter(c => isNum(c.year) && isNum(c.totalCrashes))
    .map(c => ({ year: c.year, total: c.totalCrashes }))
    .sort((a, b) => a.year - b.year);

  const populationHistory = growthData.populationHistory
    .filter(p => isNum(p.year) && isNum(p.population) && p.population > 0)
    .map(p => ({ year: p.year, population: p.population }))
    .sort((a, b) => a.year - b.year);

  const amPeak = transport.ptFrequency?.amPeakDepartures;

  return {
    carDependencyByYear,
    crashesByYear,
    populationHistory,
    population2041: populationIn(growthData.populationProjections, 2041),
    amPeakDepartures: isNum(amPeak) ? amPeak : null,
    ...approvalsWindows(growthData.buildingApprovals),
    jobs2021: jobsIn(growthData.employmentGrowth, 2021),
    jobs2041: jobsIn(growthData.employmentGrowth, 2041),
  };
}
