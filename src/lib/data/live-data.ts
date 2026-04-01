/**
 * Live data merge layer.
 * 
 * Reads from SQLite cache (seeded by `npm run seed`), falls back to sample data
 * on a field-by-field basis. Returns the same types as sample-data.ts so all
 * page components remain type-safe with zero changes.
 * 
 * Each function also returns a `meta` object describing which fields are live
 * vs. sample, and the data source + collection date for attribution.
 */

import {
  getABSCacheEntry,
  getNSWProjection,
  getTransportStaticForLGA,
} from '../db';
import {
  getDemographicsData,
  getTransportData,
  getEconomyData,
  getEducationData,
  getHousingData,
  getGrowthData,
  type DemographicsData,
  type TransportData,
  type EconomyData,
  type EducationData,
  type HousingData,
  type GrowthData,
} from './sample-data';
import { getProjectionsForArea } from './nsw-projections-data';
import {
  getEmploymentProjections,
  type EmploymentProjection,
} from './nsw-employment-projections';
import { LGA_CODE_MAP } from '../abs-fetchers';
import type {
  G01Data, G02Data, G33Data, G36Data, G51Data, G55Data, SEIFAData, LabourData, ERPData,
  EducationData as G46Data, QualificationData,
  VehicleData, DisabilityData, HouseholdIncomeData, LanguageData, BirthplaceData,
  FamilyData, OccupationData, HousingStressData, BuildingApprovalsData,
} from '../abs-fetchers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DataMeta {
  /** Human-readable source attribution, e.g. "ABS Census 2021, NSW DPE Projections 2024" */
  source: string;
  /** ISO date string when data was last refreshed from source */
  lastRefreshed: string | null;
  /** Fields populated from live data */
  liveFields: string[];
  /** Fields populated from sample/estimated data */
  sampleFields: string[];
  /** Whether any live data was found */
  hasLiveData: boolean;
}

export interface LiveDemographicsResult {
  data: DemographicsData;
  meta: DataMeta;
}
export interface LiveTransportResult {
  data: TransportData;
  meta: DataMeta;
}
export interface LiveEconomyResult {
  data: EconomyData;
  meta: DataMeta;
}
export interface LiveEducationResult {
  data: EducationData;
  meta: DataMeta;
}
export interface LiveHousingResult {
  data: HousingData;
  meta: DataMeta;
}
export interface LiveGrowthResult {
  data: GrowthData;
  meta: DataMeta;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLGACode(areaId: string): string | null {
  return LGA_CODE_MAP[areaId] ?? null;
}

function getABS<T>(lgaCode: string, dataset: string): T | null {
  const row = getABSCacheEntry(lgaCode, dataset);
  if (!row) return null;
  try {
    return JSON.parse(row.data_json) as T;
  } catch {
    return null;
  }
}

function getABSMeta(lgaCode: string, dataset: string): { fetchedAt: string; censusYear: number } | null {
  const row = getABSCacheEntry(lgaCode, dataset);
  if (!row) return null;
  return { fetchedAt: row.fetched_at, censusYear: row.census_year };
}

function buildMeta(
  sources: string[],
  fetchedAt: string | null,
  liveFields: string[],
  sampleFields: string[]
): DataMeta {
  return {
    source: sources.filter(Boolean).join('; ') || 'Sample data',
    lastRefreshed: fetchedAt,
    liveFields,
    sampleFields,
    hasLiveData: liveFields.length > 0,
  };
}

// ─── Demographics ─────────────────────────────────────────────────────────────

export function getLiveDemographicsData(areaId: string, year: number): LiveDemographicsResult {
  const sample = getDemographicsData(areaId, year);
  const lgaCode = getLGACode(areaId);

  if (!lgaCode) {
    return {
      data: sample,
      meta: buildMeta([], null, [], ['all']),
    };
  }

  const g01 = getABS<G01Data>(lgaCode, 'G01');
  const g02 = getABS<G02Data>(lgaCode, 'G02');
  const seifa = getABS<SEIFAData>(lgaCode, 'SEIFA');
  const g01Meta = getABSMeta(lgaCode, 'G01');

  const liveFields: string[] = [];
  const sampleFields: string[] = [];
  const sources: string[] = [];
  let fetchedAt: string | null = null;

  // Total/male/female population from G01
  let totalPopulation = sample.totalPopulation;
  let malePopulation = sample.malePopulation;
  let femalePopulation = sample.femalePopulation;

  if (g01) {
    totalPopulation = g01.totalPopulation;
    malePopulation = g01.malePopulation;
    femalePopulation = g01.femalePopulation;
    liveFields.push('totalPopulation', 'malePopulation', 'femalePopulation');
    sources.push('ABS Census 2021');
    fetchedAt = g01Meta?.fetchedAt ?? null;
  } else {
    sampleFields.push('totalPopulation', 'malePopulation', 'femalePopulation');
  }

  // Age distribution from G01
  let ageDistribution = sample.ageDistribution;
  if (g01 && Object.keys(g01.ageGroups).length > 0) {
    const maleRatio = totalPopulation > 0 ? malePopulation / totalPopulation : 0.49;
    // Map G01 PCHAR codes to display labels (ABS 2021 SDMX codes)
    const codeToLabel: Record<string, string> = {
      '0_4': '0-4',
      '5_14': '5-14',
      '15_19': '15-24', '20_24': '15-24',
      '25_34': '25-34', '35_44': '35-44', '45_54': '45-54',
      '55_64': '55-64', '65_74': '65-74', '75_84': '75+', 'GE85': '75+',
    };
    const merged: Record<string, number> = {};
    for (const [code, count] of Object.entries(g01.ageGroups)) {
      const label = codeToLabel[code];
      if (label) merged[label] = (merged[label] ?? 0) + count;
    }
    if (Object.keys(merged).length > 0) {
      ageDistribution = Object.entries(merged).map(([ageGroup, total]) => ({
        ageGroup,
        male: Math.round(total * maleRatio),
        female: total - Math.round(total * maleRatio),
      }));
      liveFields.push('ageDistribution');
    } else {
      sampleFields.push('ageDistribution');
    }
  } else {
    sampleFields.push('ageDistribution');
  }

  // Country of birth from G01
  let countriesOfBirth = sample.countriesOfBirth;
  if (g01) {
    const overseasTotal = g01.bornOverseas;
    const australiaTotal = g01.bornAustralia;
    if (australiaTotal > 0 || overseasTotal > 0) {
      // Use live totals but keep sample country breakdown proportions for individual countries
      // (individual country breakdown requires G09 which we can add later)
      const ratio = overseasTotal > 0 ? overseasTotal / (australiaTotal + overseasTotal) : 0;
      countriesOfBirth = sample.countriesOfBirth.map(c =>
        c.name === 'Australia'
          ? { ...c, value: australiaTotal }
          : { ...c, value: Math.round(c.value * ratio / (1 - sample.countriesOfBirth[0].value / totalPopulation)) }
      );
      liveFields.push('countriesOfBirth');
    } else {
      sampleFields.push('countriesOfBirth');
    }
  } else {
    sampleFields.push('countriesOfBirth');
  }

  // Median age from G02
  let medianAge = sample.medianAge;
  if (g02?.medianAge && g02.medianAge > 0) {
    medianAge = g02.medianAge;
    liveFields.push('medianAge');
  } else {
    sampleFields.push('medianAge');
  }

  // SEIFA score
  let seifaScore = sample.seifaScore;
  if (seifa?.irsd && seifa.irsd > 0) {
    seifaScore = seifa.irsd;
    liveFields.push('seifaScore');
    if (!sources.includes('ABS Census 2021')) sources.push('ABS Census 2021');
  } else {
    sampleFields.push('seifaScore');
  }

  // Birthplace detail from G09 (replaces G01 binary born-overseas when available)
  let birthplaceGroups = sample.birthplaceGroups;
  if (lgaCode) {
    const g09 = getABS<BirthplaceData>(lgaCode, 'G09');
    if (g09 && g09.birthplaceGroups.length > 0) {
      birthplaceGroups = g09.birthplaceGroups;
      // Also update countriesOfBirth to use real counts from G09
      countriesOfBirth = g09.birthplaceGroups.slice(0, 9).map(b => ({ name: b.name, value: b.count }));
      liveFields.push('birthplaceGroups', 'countriesOfBirth');
      if (!sources.includes('ABS Census 2021')) sources.push('ABS Census 2021');
    }
  }

  // Language spoken at home from G13
  let languageGroups = sample.languageGroups;
  let englishOnly = sample.englishOnly;
  let limitedEnglish = sample.limitedEnglish;
  if (lgaCode) {
    const g13 = getABS<LanguageData>(lgaCode, 'G13');
    if (g13 && g13.languageGroups.length > 0) {
      languageGroups = g13.languageGroups;
      englishOnly = g13.englishOnly;
      limitedEnglish = g13.limitedEnglish;
      liveFields.push('languageGroups', 'englishOnly', 'limitedEnglish');
      if (!sources.includes('ABS Census 2021')) sources.push('ABS Census 2021');
    }
  }

  // Disability / need for assistance from G18
  let disabilityRate = sample.disabilityRate;
  let needsAssistance = sample.needsAssistance;
  if (lgaCode) {
    const g18 = getABS<DisabilityData>(lgaCode, 'G18');
    if (g18 && g18.total > 0) {
      disabilityRate = g18.rate;
      needsAssistance = g18.needsAssistance;
      liveFields.push('disabilityRate', 'needsAssistance');
      if (!sources.includes('ABS Census 2021')) sources.push('ABS Census 2021');
    }
  }

  // Family composition from G25 (replaces sample householdComposition)
  let familyComposition = sample.familyComposition;
  let householdComposition = sample.householdComposition;
  if (lgaCode) {
    const g25 = getABS<FamilyData>(lgaCode, 'G25');
    if (g25 && g25.totalHouseholds > 0) {
      familyComposition = [
        { name: 'Couple with children', value: g25.coupleWithChildren },
        { name: 'Couple without children', value: g25.coupleNoChildren },
        { name: 'One-parent family', value: g25.oneParentFamily },
        { name: 'Other family', value: g25.otherFamily },
        { name: 'Lone person', value: g25.lonePersonHousehold },
        { name: 'Group household', value: g25.groupHousehold },
      ].filter(f => f.value > 0);
      householdComposition = familyComposition;
      liveFields.push('familyComposition', 'householdComposition');
      if (!sources.includes('ABS Census 2021')) sources.push('ABS Census 2021');
    } else {
      sampleFields.push('familyComposition');
    }
  } else {
    sampleFields.push('familyComposition');
  }

  sampleFields.push(...(['populationDensity'].filter(f => !liveFields.includes(f))));
  if (!liveFields.includes('householdComposition')) sampleFields.push('householdComposition');

  return {
    data: {
      ...sample,
      totalPopulation,
      malePopulation,
      femalePopulation,
      medianAge,
      ageDistribution,
      countriesOfBirth,
      seifaScore,
      birthplaceGroups,
      languageGroups,
      englishOnly,
      limitedEnglish,
      disabilityRate,
      needsAssistance,
      familyComposition,
      householdComposition,
    },
    meta: buildMeta(sources, fetchedAt, liveFields, sampleFields),
  };
}

// ─── Transport ────────────────────────────────────────────────────────────────

export function getLiveTransportData(areaId: string, year: number): LiveTransportResult {
  const sample = getTransportData(areaId, year);
  const lgaCode = getLGACode(areaId);

  const liveFields: string[] = [];
  const sampleFields: string[] = [];
  const sources: string[] = [];
  let fetchedAt: string | null = null;

  // Try G62 first (correct MTWP table), then G55 as fallback
  let journeyToWork = sample.journeyToWork;
  if (lgaCode) {
    const g62 = getABS<G55Data>(lgaCode, 'G62');
    const g55 = g62 ?? getABS<G55Data>(lgaCode, 'G55');
    const jtw = g55;
    const jtwMeta = getABSMeta(lgaCode, g62 ? 'G62' : 'G55');
    if (jtw && jtw.total > 0) {
      const t = jtw.total;
      journeyToWork = [
        { name: 'Car (driver)', value: Math.round((jtw.car_driver / t) * 1000) / 10 },
        { name: 'Car (passenger)', value: Math.round((jtw.car_passenger / t) * 1000) / 10 },
        { name: 'Train', value: Math.round((jtw.train / t) * 1000) / 10 },
        { name: 'Bus', value: Math.round((jtw.bus / t) * 1000) / 10 },
        { name: 'Ferry', value: Math.round((jtw.ferry / t) * 1000) / 10 },
        { name: 'Cycling', value: Math.round((jtw.bicycle / t) * 1000) / 10 },
        { name: 'Walking', value: Math.round((jtw.walked / t) * 1000) / 10 },
        { name: 'Work from home', value: Math.round((jtw.worked_home / t) * 1000) / 10 },
        { name: 'Other', value: Math.round((jtw.other / t) * 1000) / 10 },
      ];
      liveFields.push('journeyToWork');
      sources.push('ABS Census 2021');
      fetchedAt = jtwMeta?.fetchedAt ?? null;
    } else {
      sampleFields.push('journeyToWork');
    }
  } else {
    sampleFields.push('journeyToWork');
  }

  // Try bundled TfNSW transport data for mode share trend + avg commute
  let modeShareTrend = sample.modeShareTrend;
  let avgCommute = sample.avgCommute;
  let ptPatronage = sample.ptPatronage;

  // Map area ID to TfNSW LGA name
  const AREA_TO_TFNSW: Record<string, string> = {
    lga_sydney: 'Sydney',
    lga_parramatta: 'Parramatta',
    lga_newcastle: 'Newcastle',
    lga_wollongong: 'Wollongong',
    lga_albury: 'Albury',
  };
  const tfnswLGAName = AREA_TO_TFNSW[areaId];

  if (tfnswLGAName) {
    const transportRows = getTransportStaticForLGA(tfnswLGAName);
    if (transportRows.length > 0) {
      // Build mode share trend from static TfNSW data
      const trendRows = transportRows
        .filter(r => [2019, 2021, 2023, 2024].includes(r.year))
        .map(r => ({
          year: r.year as number,
          car: r.modeShareCar as number,
          train: Math.max(0, ((r.modeSharePT as number) - 5) * 0.6),
          bus: Math.max(0, ((r.modeSharePT as number) - 5) * 0.4 + 5),
          active: r.modeShareActive as number,
          wfh: r.year === 2021 ? 8 : 4,
        }));
      if (trendRows.length > 0) {
        modeShareTrend = trendRows;
        liveFields.push('modeShareTrend');
      }

      // Get commute time for requested year or latest available
      const yearRow = transportRows.find(r => r.year === year)
        ?? transportRows[transportRows.length - 1];
      if (yearRow) {
        avgCommute = yearRow.averageCommuteTime as number;
        ptPatronage = Math.round((yearRow.ptPatronagePerCapita as number) * 1000);
        liveFields.push('avgCommute', 'ptPatronage');
        if (!sources.includes('TfNSW Open Data')) sources.push('TfNSW Open Data');
        if (!fetchedAt) fetchedAt = new Date().toISOString(); // static data, use now
      }
    }
  }

  // Vehicle ownership from G34
  let vehicleOwnership = sample.vehicleOwnership;
  let vehicleOwnershipRaw = sample.vehicleOwnershipRaw;
  if (lgaCode) {
    const g34 = getABS<VehicleData>(lgaCode, 'G34');
    if (g34 && g34.totalDwellings > 0) {
      const t = g34.totalDwellings;
      vehicleOwnership = [
        { name: '0 vehicles', value: Math.round((g34.noCar / t) * 1000) / 10 },
        { name: '1 vehicle',  value: Math.round((g34.oneCar / t) * 1000) / 10 },
        { name: '2 vehicles', value: Math.round((g34.twoCars / t) * 1000) / 10 },
        { name: '3+ vehicles', value: Math.round((g34.threePlusCars / t) * 1000) / 10 },
      ];
      vehicleOwnershipRaw = g34;
      liveFields.push('vehicleOwnership');
      if (!sources.includes('ABS Census 2021')) sources.push('ABS Census 2021');
    } else {
      sampleFields.push('vehicleOwnership');
    }
  } else {
    sampleFields.push('vehicleOwnership');
  }

  if (!liveFields.includes('modeShareTrend')) sampleFields.push('modeShareTrend');
  if (!liveFields.includes('avgCommute')) sampleFields.push('avgCommute', 'ptPatronage');

  return {
    data: {
      ...sample,
      journeyToWork,
      vehicleOwnership,
      vehicleOwnershipRaw,
      modeShareTrend,
      avgCommute,
      ptPatronage,
    },
    meta: buildMeta(sources, fetchedAt, liveFields, sampleFields),
  };
}

// ─── Economy ──────────────────────────────────────────────────────────────────

export function getLiveEconomyData(areaId: string, year: number): LiveEconomyResult {
  const sample = getEconomyData(areaId, year);
  const lgaCode = getLGACode(areaId);

  const liveFields: string[] = [];
  const sampleFields: string[] = [];
  const sources: string[] = [];
  let fetchedAt: string | null = null;

  let unemploymentRate = sample.unemploymentRate;
  let participationRate = sample.participationRate;
  let medianWeeklyIncome = sample.medianWeeklyIncome;
  let employmentByIndustry = sample.employmentByIndustry;

  if (lgaCode) {
    // Labour market data
    const labour = getABS<LabourData>(lgaCode, 'LABOUR');
    const labourMeta = getABSMeta(lgaCode, 'LABOUR');
    if (labour) {
      unemploymentRate = labour.unemploymentRate;
      participationRate = labour.participationRate;
      liveFields.push('unemploymentRate', 'participationRate');
      sources.push(`ABS Labour Force ${labour.dataYear}`);
      fetchedAt = labourMeta?.fetchedAt ?? null;
    } else {
      sampleFields.push('unemploymentRate', 'participationRate');
    }

    // Median income from G02
    const g02 = getABS<G02Data>(lgaCode, 'G02');
    if (g02?.medianWeeklyHouseholdIncome && g02.medianWeeklyHouseholdIncome > 0) {
      medianWeeklyIncome = g02.medianWeeklyHouseholdIncome;
      liveFields.push('medianWeeklyIncome');
      if (!sources.includes('ABS Census 2021')) sources.push('ABS Census 2021');
    } else {
      sampleFields.push('medianWeeklyIncome');
    }

    // Industry employment from G51
    const g51 = getABS<G51Data>(lgaCode, 'G51');
    const g51Meta = getABSMeta(lgaCode, 'G51');
    if (g51 && g51.industries.length > 0) {
      const total = g51.totalEmployed;
      employmentByIndustry = g51.industries.slice(0, 10).map(ind => ({
        name: ind.name,
        value: Math.round((ind.employed / total) * 1000) / 10,
      }));
      liveFields.push('employmentByIndustry');
      if (!sources.includes('ABS Census 2021')) sources.push('ABS Census 2021');
      if (!fetchedAt) fetchedAt = g51Meta?.fetchedAt ?? null;
    } else {
      sampleFields.push('employmentByIndustry');
    }
  } else {
    sampleFields.push('unemploymentRate', 'participationRate', 'medianWeeklyIncome', 'employmentByIndustry');
  }

  // Employment trend from TZP24 if available
  let employmentTrend = sample.employmentTrend;
  const empProjections: EmploymentProjection[] = getEmploymentProjections(areaId);
  if (empProjections && empProjections.length > 0) {
    const historicalYears = [2021, 2022, 2023];
    const projectionYears = [2026, 2031, 2036, 2041];
    const allEntries = [...historicalYears, ...projectionYears]
      .map(y => {
        const match = empProjections.find((p: EmploymentProjection) => p.year === y);
        return match ? { year: y, employed: match.totalEmployed, unemployed: 0 } : null;
      })
      .filter(Boolean) as { year: number; employed: number; unemployed: number }[];

    if (allEntries.length > 0) {
      employmentTrend = allEntries;
      liveFields.push('employmentTrend');
      if (!sources.includes('TfNSW TZP24 Employment Projections')) {
        sources.push('TfNSW TZP24 Employment Projections 2025');
      }
    }
  } else {
    sampleFields.push('employmentTrend');
  }

  // Occupation from G60
  let occupationByGroup = sample.occupationByGroup;
  if (lgaCode) {
    const g60 = getABS<OccupationData>(lgaCode, 'G60');
    if (g60 && g60.occupations.length > 0) {
      occupationByGroup = g60.occupations;
      liveFields.push('occupationByGroup');
      if (!sources.includes('ABS Census 2021')) sources.push('ABS Census 2021');
    }
  }

  // Household income distribution from G33_INCOME
  let householdIncomeDistribution = sample.householdIncomeDistribution;
  let lowIncomeHouseholds = sample.lowIncomeHouseholds;
  let highIncomeHouseholds = sample.highIncomeHouseholds;
  if (lgaCode) {
    const g33Inc = getABS<HouseholdIncomeData>(lgaCode, 'G33_INCOME');
    if (g33Inc && g33Inc.total > 0) {
      householdIncomeDistribution = g33Inc.incomeRanges;
      lowIncomeHouseholds = g33Inc.lowIncomeHouseholds;
      highIncomeHouseholds = g33Inc.highIncomeHouseholds;
      liveFields.push('householdIncomeDistribution', 'lowIncomeHouseholds', 'highIncomeHouseholds');
      if (!sources.includes('ABS Census 2021')) sources.push('ABS Census 2021');
    }
  }

  sampleFields.push('jobDensity');

  return {
    data: {
      ...sample,
      unemploymentRate,
      participationRate,
      medianWeeklyIncome,
      employmentByIndustry,
      employmentTrend,
      occupationByGroup,
      householdIncomeDistribution,
      lowIncomeHouseholds,
      highIncomeHouseholds,
    },
    meta: buildMeta(sources, fetchedAt, liveFields, sampleFields),
  };
}

// ─── Education ────────────────────────────────────────────────────────────────

export function getLiveEducationData(areaId: string, year: number): LiveEducationResult {
  const sample = getEducationData(areaId, year);
  const lgaCode = getLGACode(areaId);

  const liveFields: string[] = [];
  const sampleFields: string[] = [];
  const sources: string[] = [];
  let fetchedAt: string | null = null;

  let attainment = sample.attainment;

  if (lgaCode) {
    // G46: Highest year of school
    const g46 = getABS<G46Data>(lgaCode, 'G46');
    // G49: Non-school qualifications
    const g49 = getABS<QualificationData>(lgaCode, 'G49');
    const g49Meta = getABSMeta(lgaCode, 'G49');

    if (g49 && g49.total > 0) {
      const t = g49.total;
      attainment = [
        { name: 'Postgraduate', value: Math.round((g49.postgrad / t) * 1000) / 10 },
        { name: 'Bachelor Degree', value: Math.round((g49.bachelor / t) * 1000) / 10 },
        { name: 'Diploma', value: Math.round(((g49.grad_diploma + g49.adv_diploma) / t) * 1000) / 10 },
        { name: 'Certificate III/IV', value: Math.round((g49.cert3_4 / t) * 1000) / 10 },
        { name: 'Certificate I/II', value: Math.round((g49.cert1_2 / t) * 1000) / 10 },
        { name: 'No qualification', value: Math.round((g49.no_qualification / t) * 1000) / 10 },
      ];
      liveFields.push('attainment');
      sources.push('ABS Census 2021');
      fetchedAt = g49Meta?.fetchedAt ?? null;
    } else if (g46 && g46.totalPopulation > 0) {
      const t = g46.totalPopulation;
      // Map school completion to attainment array
      attainment = [
        { name: 'Year 12', value: Math.round((g46.year12 / t) * 1000) / 10 },
        { name: 'Year 11', value: Math.round((g46.year11 / t) * 1000) / 10 },
        { name: 'Year 10', value: Math.round((g46.year10 / t) * 1000) / 10 },
        { name: 'Year 9', value: Math.round((g46.year9 / t) * 1000) / 10 },
        { name: 'Year 8 or below', value: Math.round((g46.year8orBelow / t) * 1000) / 10 },
        { name: 'Not stated', value: Math.round((g46.notStated / t) * 1000) / 10 },
      ];
      liveFields.push('attainment');
      sources.push('ABS Census 2021');
    } else {
      sampleFields.push('attainment');
    }
  } else {
    sampleFields.push('attainment');
  }

  sampleFields.push('schoolEnrolment', 'qualificationTrend');

  return {
    data: { ...sample, attainment },
    meta: buildMeta(sources, fetchedAt, liveFields, sampleFields),
  };
}

// ─── Housing ──────────────────────────────────────────────────────────────────

export function getLiveHousingData(areaId: string, year: number): LiveHousingResult {
  const sample = getHousingData(areaId, year);
  const lgaCode = getLGACode(areaId);

  const liveFields: string[] = [];
  const sampleFields: string[] = [];
  const sources: string[] = [];
  let fetchedAt: string | null = null;

  let dwellingTypes = sample.dwellingTypes;
  let tenure = sample.tenure;
  let medianWeeklyRent = sample.medianWeeklyRent;

  if (lgaCode) {
    // G33: Dwelling structure
    const g33 = getABS<G33Data>(lgaCode, 'G33');
    const g33Meta = getABSMeta(lgaCode, 'G33');
    if (g33 && g33.totalDwellings > 0) {
      const t = g33.totalDwellings;
      dwellingTypes = [
        { name: 'Separate House', value: Math.round((g33.separateHouse / t) * 1000) / 10 },
        { name: 'Semi-detached / Townhouse', value: Math.round((g33.semiDetached / t) * 1000) / 10 },
        { name: 'Apartment', value: Math.round((g33.flatOrApartment / t) * 1000) / 10 },
        { name: 'Other', value: Math.round((g33.other / t) * 1000) / 10 },
      ];
      liveFields.push('dwellingTypes');
      sources.push('ABS Census 2021');
      fetchedAt = g33Meta?.fetchedAt ?? null;
    } else {
      sampleFields.push('dwellingTypes');
    }

    // G36: Tenure type
    const g36 = getABS<G36Data>(lgaCode, 'G36');
    if (g36) {
      const t = g36.owned + g36.mortgage + g36.rented + g36.other;
      if (t > 0) {
        tenure = [
          { name: 'Owned outright', value: Math.round((g36.owned / t) * 1000) / 10 },
          { name: 'Mortgage', value: Math.round((g36.mortgage / t) * 1000) / 10 },
          { name: 'Renting', value: Math.round((g36.rented / t) * 1000) / 10 },
          { name: 'Other', value: Math.round((g36.other / t) * 1000) / 10 },
        ];
        liveFields.push('tenure');
        if (!sources.includes('ABS Census 2021')) sources.push('ABS Census 2021');
      } else {
        sampleFields.push('tenure');
      }
    } else {
      sampleFields.push('tenure');
    }

    // G02: Median rent
    const g02 = getABS<G02Data>(lgaCode, 'G02');
    if (g02?.medianWeeklyRent && g02.medianWeeklyRent > 0) {
      medianWeeklyRent = g02.medianWeeklyRent;
      liveFields.push('medianWeeklyRent');
      if (!sources.includes('ABS Census 2021')) sources.push('ABS Census 2021');
    } else {
      sampleFields.push('medianWeeklyRent');
    }
  } else {
    sampleFields.push('dwellingTypes', 'tenure', 'medianWeeklyRent');
  }

  // Housing stress from G43/G44
  let mortgageStressRate = sample.mortgageStressRate;
  let rentStressRate = sample.rentStressRate;
  if (lgaCode) {
    const hs = getABS<HousingStressData>(lgaCode, 'HOUSING_STRESS');
    if (hs && (hs.rentTotal > 0 || hs.mortgageTotal > 0)) {
      mortgageStressRate = hs.mortgageStressRate;
      rentStressRate = hs.rentStressRate;
      liveFields.push('mortgageStressRate', 'rentStressRate');
      if (!sources.includes('ABS Census 2021')) sources.push('ABS Census 2021');
    }
  }

  sampleFields.push('medianHousePrice', 'housingTrend');

  return {
    data: { ...sample, dwellingTypes, tenure, medianWeeklyRent, mortgageStressRate, rentStressRate },
    meta: buildMeta(sources, fetchedAt, liveFields, sampleFields),
  };
}

// ─── Growth ───────────────────────────────────────────────────────────────────

export function getLiveGrowthData(areaId: string): LiveGrowthResult {
  const sample = getGrowthData(areaId);

  const liveFields: string[] = [];
  const sampleFields: string[] = [];
  const sources: string[] = [];
  let fetchedAt: string | null = null;

  let populationHistory = sample.populationHistory;
  let populationProjections = sample.populationProjections;
  let employmentGrowth = sample.employmentGrowth;
  let annualGrowthRate = sample.annualGrowthRate;
  let projectedGrowthRate = sample.projectedGrowthRate;

  // Try NSW DPE population projections (by area ID then by area name)
  let nswProjections = getProjectionsForArea(areaId);
  if (nswProjections.length === 0) {
    // getProjectionsForArea tries both id and name internally
    nswProjections = getProjectionsForArea(areaId.replace('lga_', '').replace(/_/g, ' '));
  }

  if (nswProjections.length > 0) {
    const sorted = [...nswProjections].sort((a, b) => a.year - b.year);
    const pop2011 = sorted.find(p => p.year === 2011)?.totalPopulation;
    const pop2016 = sorted.find(p => p.year === 2016)?.totalPopulation;
    const pop2021 = sorted.find(p => p.year === 2021)?.totalPopulation;

    if (pop2021) {
      populationHistory = [
        pop2011 ? { year: 2011, population: pop2011 } : null,
        pop2016 ? { year: 2016, population: pop2016 } : null,
        { year: 2021, population: pop2021 },
      ].filter(Boolean) as { year: number; population: number }[];

      populationProjections = sorted
        .filter(p => p.year > 2021)
        .map(p => ({ year: p.year, population: p.totalPopulation }));

      liveFields.push('populationHistory', 'populationProjections');
      sources.push('NSW DPE Population Projections 2024');
      fetchedAt = new Date().toISOString(); // bundled static data

      // Calc annual growth rate from NSW data
      if (pop2016 && pop2021) {
        annualGrowthRate = Math.round(((pop2021 / pop2016) ** (1 / 5) - 1) * 1000) / 10;
        liveFields.push('annualGrowthRate');
      }

      const pop2041 = sorted.find(p => p.year === 2041)?.totalPopulation;
      if (pop2041 && pop2021) {
        projectedGrowthRate = Math.round(((pop2041 / pop2021) ** (1 / 20) - 1) * 1000) / 10;
        liveFields.push('projectedGrowthRate');
      }
    }
  } else {
    sampleFields.push('populationHistory', 'populationProjections', 'annualGrowthRate', 'projectedGrowthRate');
  }

  // Employment growth from TZP24
  const empProjections: EmploymentProjection[] = getEmploymentProjections(areaId);
  if (empProjections && empProjections.length > 0) {
    const allYears = [2011, 2016, 2021, 2026, 2031, 2036, 2041];
    const mapped = allYears
      .map(y => {
        const match = empProjections.find((p: EmploymentProjection) => p.year === y);
        return match ? { year: y, jobs: match.totalEmployed } : null;
      })
      .filter(Boolean) as { year: number; jobs: number }[];

    if (mapped.length > 0) {
      employmentGrowth = mapped;
      liveFields.push('employmentGrowth');
      if (!sources.includes('TfNSW TZP24 Employment Projections 2025')) {
        sources.push('TfNSW TZP24 Employment Projections 2025');
      }
    }
  } else {
    sampleFields.push('employmentGrowth');
  }

  // Also pull ERP historical data from ABS if available
  const lgaCode = getLGACode(areaId);
  if (lgaCode && !liveFields.includes('populationHistory')) {
    const erp = getABS<ERPData>(lgaCode, 'ERP');
    const erpMeta = getABSMeta(lgaCode, 'ERP');
    if (erp && Object.keys(erp.byYear).length > 0) {
      populationHistory = Object.entries(erp.byYear)
        .map(([yr, pop]) => ({ year: Number(yr), population: pop }))
        .sort((a, b) => a.year - b.year);
      liveFields.push('populationHistory');
      sources.push('ABS Estimated Resident Population');
      if (!fetchedAt) fetchedAt = erpMeta?.fetchedAt ?? null;
    }
  }

  // Building approvals from ABS_BA_LGA
  let buildingApprovals = sample.buildingApprovals;
  let rollingAnnualApprovals = sample.rollingAnnualApprovals;
  const lgaCodeForBA = getLGACode(areaId);
  if (lgaCodeForBA) {
    const ba = getABS<BuildingApprovalsData>(lgaCodeForBA, 'BUILDING_APPROVALS');
    if (ba && ba.periods.length > 0) {
      buildingApprovals = ba.periods;
      rollingAnnualApprovals = ba.rollingAnnualDwellings;
      liveFields.push('buildingApprovals', 'rollingAnnualApprovals');
      if (!sources.includes('ABS Building Approvals')) sources.push('ABS Building Approvals');
    }
  }

  return {
    data: {
      populationHistory,
      populationProjections,
      employmentGrowth,
      annualGrowthRate,
      projectedGrowthRate,
      buildingApprovals,
      rollingAnnualApprovals,
    },
    meta: buildMeta(sources, fetchedAt, liveFields, sampleFields),
  };
}
