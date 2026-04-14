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
  familyComposition?: { name: string; value: number }[];
}

export interface TransportData {
  journeyToWork: { name: string; value: number }[];
  vehicleOwnership: { name: string; value: number }[];
  modeShareTrend: { year: number; car: number; train: number; bus: number; active: number; wfh: number }[];
  ptPatronage: number | null;
  avgCommute: number | null;
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
