import type { CatchmentShare } from '@/lib/catchments';
import type { GTFSFrequencyData } from '@/lib/gtfs-frequency';
import type { HTSTravelSurveySummary } from '@/lib/hts-parser';
import type { JTWFlowSummary } from '@/lib/jtw-flows';
import { OFFICIAL_FALLBACKS } from './official-fallback-data';

export interface DemographicsData {
  totalPopulation: number;
  malePopulation: number;
  femalePopulation: number;
  medianAge: number;
  ageDistribution: { ageGroup: string; male: number; female: number }[];
  countriesOfBirth: { name: string; value: number }[];
  householdComposition: { name: string; value: number }[];
  seifaScore: number;
  populationDensity: number | null;
  birthplaceGroups?: { name: string; code: string; count: number }[];
  languageGroups?: { name: string; code: string; count: number }[];
  englishOnly?: number;
  limitedEnglish?: number;
  disabilityRate?: number;
  needsAssistance?: number;
  /** Aboriginal and/or Torres Strait Islander persons, Census 2021 (G01 PCHAR A_T). */
  indigenousPopulation?: number;
  familyComposition?: { name: string; value: number }[];
}

export interface TransportData {
  journeyToWork: { name: string; value: number }[];
  vehicleOwnership: { name: string; value: number }[];
  modeShareTrend: { year: number; car: number; train: number; bus: number; active: number; wfh: number }[];
  /** Annual rail, metro and light rail station entries per resident (TfNSW Opal). */
  ptPatronage: number | null;
  /** Average weekday one-way commute time in minutes (TfNSW Household Travel Survey). */
  avgCommute: number | null;
  commuteTrend?: {
    financialYear: string;
    avgMinutes: number;
    avgKm: number | null;
    reliability: 'reliable' | 'use_with_caution' | 'unreliable';
  }[];
  /** ABS Census 2016 commuting distance — the all-LGA fallback where HTS has no coverage. */
  commuteDistance2016?: { avgKm: number | null; medianKm: number | null };
  stationPatronage?: {
    months: { month: string; entries: number; exits: number }[];
    latest12mEntries: number;
    latest12mPeriod: { from: string; to: string };
    stations: { name: string; type: string; entries12m: number }[];
    suppressedCells: number;
  };
  trafficVolumeTrend?: { year: number; avgDailyVehicles: number; stationCount: number }[];
  crashTrend?: { year: number; totalCrashes: number; fatalCrashes: number; injuryCrashes: number }[];
  patronageSource?: {
    datasetUrl: string;
    viewUrl: string;
    source: 'tfnsw_tableau';
    structuredDataAvailable: false;
    lastCheckedAt: string;
  };
  vehicleOwnershipRaw?: { noCar: number; oneCar: number; twoCars: number; threePlusCars: number; totalDwellings: number };
  ptStops?: { train: number; bus: number; ferry: number; lightRail: number; metro: number; total: number };
  ptRoutes?: { train: number; bus: number; ferry: number; lightRail: number; metro: number; total: number };
  ptFrequency?: GTFSFrequencyData & { departuresPer1000Residents: number | null };
  /**
   * Residents (2021 mesh-block persons) within a straight-line walk of a stop with frequent (8+ weekday 7-9am
   * departures) or any service: 800 m of train, metro and ferry, 400 m of bus and light rail. Shares are percent.
   */
  catchment?: CatchmentShare;
  /** All-purpose weekday travel, TfNSW Household Travel Survey (Sydney GMA LGAs only). */
  travelSurvey?: HTSTravelSurveySummary;
  /** Census journey-to-work flows between LGAs (ABS TableBuilder export). */
  commuteFlows?: JTWFlowSummary & { censusYear: number };
}

export interface EconomyData {
  employmentByIndustry: { name: string; value: number }[];
  unemploymentRate: number;
  participationRate: number;
  medianWeeklyIncome: number;
  jobDensity: number | null;
  employmentTrend: { year: number; employed: number; unemployed: number }[];
  occupationByGroup?: { name: string; code: string; employed: number; male: number; female: number }[];
  householdIncomeDistribution?: { label: string; count: number }[];
  lowIncomeHouseholds?: number;
  highIncomeHouseholds?: number;
}

export interface EducationData {
  attainment: { name: string; value: number }[];
  schoolEnrolment: { name: string; value: number }[];
  qualificationTrend: { year: number; bachelor: number; diploma: number; certificate: number }[];
}

export interface HousingData {
  dwellingTypes: { name: string; value: number }[];
  tenure: { name: string; value: number }[];
  medianWeeklyRent: number;
  medianHousePrice: number | null;
  housingTrend: { year: number; houses: number; apartments: number; townhouses: number }[];
  mortgageStressRate?: number;
  rentStressRate?: number;
}

export interface GrowthData {
  populationHistory: { year: number; population: number }[];
  populationProjections: { year: number; population: number }[];
  employmentGrowth: { year: number; jobs: number }[];
  annualGrowthRate: number;
  projectedGrowthRate: number;
  buildingApprovals?: { year: number; month: number; residentialCount: number }[];
  rollingAnnualApprovals?: number;
}

type OfficialAreaFallback = {
  demographics: DemographicsData;
  transport: TransportData;
  economy: EconomyData;
  education: EducationData;
  housing: HousingData;
  growth: GrowthData;
};

type DeepMutable<T> =
  T extends readonly (infer U)[] ? DeepMutable<U>[] :
  T extends object ? { -readonly [K in keyof T]: DeepMutable<T[K]> } :
  T;

function clone<T>(value: T): DeepMutable<T> {
  return JSON.parse(JSON.stringify(value)) as DeepMutable<T>;
}

function getAreaFallback(areaId: string): OfficialAreaFallback {
  const fallback = OFFICIAL_FALLBACKS[areaId as keyof typeof OFFICIAL_FALLBACKS]
    ?? OFFICIAL_FALLBACKS.lga_sydney;
  return clone(fallback);
}

export function getDemographicsData(areaId: string, _year: number): DemographicsData {
  return getAreaFallback(areaId).demographics;
}

export function getTransportData(areaId: string, _year: number): TransportData {
  return getAreaFallback(areaId).transport;
}

export function getEconomyData(areaId: string, _year: number): EconomyData {
  return getAreaFallback(areaId).economy;
}

export function getEducationData(areaId: string, _year: number): EducationData {
  return getAreaFallback(areaId).education;
}

export function getHousingData(areaId: string, _year: number): HousingData {
  return getAreaFallback(areaId).housing;
}

export function getGrowthData(areaId: string): GrowthData {
  return getAreaFallback(areaId).growth;
}
