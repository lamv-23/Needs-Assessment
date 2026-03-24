// Comprehensive sample data for Greater Sydney transport needs assessment
// Uses deterministic seeding based on area ID for realistic variation

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function seeded(areaId: string, salt: string, min: number, max: number): number {
  const h = hashCode(areaId + salt);
  return min + (h % 1000) / 1000 * (max - min);
}

function seededInt(areaId: string, salt: string, min: number, max: number): number {
  return Math.round(seeded(areaId, salt, min, max));
}

// Area characteristics for more realistic data
const AREA_PROFILES: Record<string, {
  density: 'high' | 'medium' | 'low';
  urbanType: 'inner' | 'middle' | 'outer' | 'regional';
  ptAccess: 'high' | 'medium' | 'low';
  affluence: 'high' | 'medium' | 'low';
}> = {
  lga_sydney: { density: 'high', urbanType: 'inner', ptAccess: 'high', affluence: 'high' },
  lga_north_sydney: { density: 'high', urbanType: 'inner', ptAccess: 'high', affluence: 'high' },
  lga_woollahra: { density: 'high', urbanType: 'inner', ptAccess: 'high', affluence: 'high' },
  lga_waverley: { density: 'high', urbanType: 'inner', ptAccess: 'high', affluence: 'high' },
  lga_inner_west: { density: 'high', urbanType: 'inner', ptAccess: 'high', affluence: 'medium' },
  lga_randwick: { density: 'high', urbanType: 'inner', ptAccess: 'medium', affluence: 'high' },
  lga_bayside: { density: 'medium', urbanType: 'middle', ptAccess: 'medium', affluence: 'medium' },
  lga_parramatta: { density: 'medium', urbanType: 'middle', ptAccess: 'high', affluence: 'medium' },
  lga_ryde: { density: 'medium', urbanType: 'middle', ptAccess: 'medium', affluence: 'medium' },
  lga_canterbury_bankstown: { density: 'medium', urbanType: 'middle', ptAccess: 'medium', affluence: 'low' },
  lga_cumberland: { density: 'medium', urbanType: 'middle', ptAccess: 'medium', affluence: 'low' },
  lga_strathfield: { density: 'medium', urbanType: 'middle', ptAccess: 'high', affluence: 'medium' },
  lga_burwood: { density: 'medium', urbanType: 'middle', ptAccess: 'high', affluence: 'medium' },
  lga_canada_bay: { density: 'medium', urbanType: 'middle', ptAccess: 'medium', affluence: 'high' },
  lga_georges_river: { density: 'medium', urbanType: 'middle', ptAccess: 'medium', affluence: 'medium' },
  lga_ku_ring_gai: { density: 'low', urbanType: 'middle', ptAccess: 'medium', affluence: 'high' },
  lga_willoughby: { density: 'medium', urbanType: 'middle', ptAccess: 'high', affluence: 'high' },
  lga_lane_cove: { density: 'medium', urbanType: 'middle', ptAccess: 'medium', affluence: 'high' },
  lga_hornsby: { density: 'low', urbanType: 'middle', ptAccess: 'medium', affluence: 'high' },
  lga_northern_beaches: { density: 'low', urbanType: 'middle', ptAccess: 'low', affluence: 'high' },
  lga_hills: { density: 'low', urbanType: 'outer', ptAccess: 'medium', affluence: 'high' },
  lga_blacktown: { density: 'medium', urbanType: 'outer', ptAccess: 'medium', affluence: 'low' },
  lga_penrith: { density: 'low', urbanType: 'outer', ptAccess: 'low', affluence: 'low' },
  lga_liverpool: { density: 'medium', urbanType: 'outer', ptAccess: 'medium', affluence: 'low' },
  lga_fairfield: { density: 'medium', urbanType: 'outer', ptAccess: 'medium', affluence: 'low' },
  lga_campbelltown: { density: 'low', urbanType: 'outer', ptAccess: 'low', affluence: 'low' },
  lga_camden: { density: 'low', urbanType: 'outer', ptAccess: 'low', affluence: 'medium' },
  lga_wollondilly: { density: 'low', urbanType: 'outer', ptAccess: 'low', affluence: 'medium' },
  lga_sutherland: { density: 'low', urbanType: 'outer', ptAccess: 'medium', affluence: 'medium' },
  lga_hawkesbury: { density: 'low', urbanType: 'outer', ptAccess: 'low', affluence: 'medium' },
  lga_blue_mountains: { density: 'low', urbanType: 'outer', ptAccess: 'low', affluence: 'medium' },
  lga_newcastle: { density: 'medium', urbanType: 'regional', ptAccess: 'medium', affluence: 'medium' },
  lga_lake_macquarie: { density: 'low', urbanType: 'regional', ptAccess: 'low', affluence: 'medium' },
  lga_wollongong: { density: 'medium', urbanType: 'regional', ptAccess: 'medium', affluence: 'medium' },
  lga_shellharbour: { density: 'low', urbanType: 'regional', ptAccess: 'low', affluence: 'low' },
};

function getProfile(areaId: string) {
  // For SA2s and suburbs, use parent LGA profile or default
  const directProfile = AREA_PROFILES[areaId];
  if (directProfile) return directProfile;
  // Default middle suburb
  return { density: 'medium' as const, urbanType: 'middle' as const, ptAccess: 'medium' as const, affluence: 'medium' as const };
}

// ============ DEMOGRAPHICS ============

export interface DemographicsData {
  totalPopulation: number;
  malePopulation: number;
  femalePopulation: number;
  medianAge: number;
  ageDistribution: { ageGroup: string; male: number; female: number }[];
  countriesOfBirth: { name: string; value: number }[];
  householdComposition: { name: string; value: number }[];
  seifaScore: number;
  populationDensity: number;
}

export function getDemographicsData(areaId: string, year: number): DemographicsData {
  const p = getProfile(areaId);
  const yearFactor = year === 2011 ? 0.85 : year === 2016 ? 0.93 : 1.0;
  const densityMult = p.density === 'high' ? 1.4 : p.density === 'medium' ? 1.0 : 0.6;

  const basePop = seededInt(areaId, 'pop', 20000, 180000);
  const totalPopulation = Math.round(basePop * yearFactor * densityMult);
  const maleRatio = seeded(areaId, 'male', 0.47, 0.52);
  const malePopulation = Math.round(totalPopulation * maleRatio);
  const femalePopulation = totalPopulation - malePopulation;

  const medianAge = p.urbanType === 'inner' ? seeded(areaId, 'age', 30, 38)
    : p.urbanType === 'outer' ? seeded(areaId, 'age', 33, 40)
    : seeded(areaId, 'age', 35, 42);

  const ageGroups = ['0-4', '5-14', '15-24', '25-34', '35-44', '45-54', '55-64', '65-74', '75+'];
  const innerWeights = [0.04, 0.06, 0.12, 0.22, 0.18, 0.14, 0.10, 0.08, 0.06];
  const outerWeights = [0.07, 0.14, 0.13, 0.14, 0.15, 0.13, 0.10, 0.08, 0.06];
  const weights = p.urbanType === 'inner' ? innerWeights : outerWeights;

  const ageDistribution = ageGroups.map((ag, i) => {
    const w = weights[i] + seeded(areaId, `ag${i}`, -0.02, 0.02);
    const total = Math.round(totalPopulation * Math.max(0.02, w));
    return {
      ageGroup: ag,
      male: Math.round(total * maleRatio),
      female: total - Math.round(total * maleRatio),
    };
  });

  const diversityLevel = p.urbanType === 'inner' ? 0.5 : p.urbanType === 'middle' ? 0.45 : 0.3;
  const countriesOfBirth = [
    { name: 'Australia', value: Math.round(totalPopulation * (1 - diversityLevel + seeded(areaId, 'aus', -0.1, 0.1))) },
    { name: 'China', value: Math.round(totalPopulation * seeded(areaId, 'cn', 0.02, 0.12)) },
    { name: 'India', value: Math.round(totalPopulation * seeded(areaId, 'in', 0.02, 0.10)) },
    { name: 'UK', value: Math.round(totalPopulation * seeded(areaId, 'uk', 0.01, 0.05)) },
    { name: 'Philippines', value: Math.round(totalPopulation * seeded(areaId, 'ph', 0.01, 0.04)) },
    { name: 'Vietnam', value: Math.round(totalPopulation * seeded(areaId, 'vn', 0.01, 0.04)) },
    { name: 'Korea', value: Math.round(totalPopulation * seeded(areaId, 'kr', 0.005, 0.03)) },
    { name: 'Nepal', value: Math.round(totalPopulation * seeded(areaId, 'np', 0.005, 0.03)) },
    { name: 'Other', value: Math.round(totalPopulation * seeded(areaId, 'oth', 0.05, 0.15)) },
  ];

  const householdComposition = [
    { name: 'Couple with children', value: seededInt(areaId, 'hh1', 20, 40) },
    { name: 'Couple without children', value: seededInt(areaId, 'hh2', 15, 30) },
    { name: 'One parent family', value: seededInt(areaId, 'hh3', 8, 18) },
    { name: 'Lone person', value: p.urbanType === 'inner' ? seededInt(areaId, 'hh4', 20, 35) : seededInt(areaId, 'hh4', 12, 25) },
    { name: 'Group household', value: p.urbanType === 'inner' ? seededInt(areaId, 'hh5', 5, 12) : seededInt(areaId, 'hh5', 2, 7) },
  ];

  const seifaBase = p.affluence === 'high' ? 1050 : p.affluence === 'medium' ? 980 : 920;
  const seifaScore = Math.round(seifaBase + seeded(areaId, 'seifa', -40, 40));

  const popDensity = p.density === 'high' ? seeded(areaId, 'dens', 5000, 12000)
    : p.density === 'medium' ? seeded(areaId, 'dens', 1500, 5000)
    : seeded(areaId, 'dens', 100, 1500);

  return {
    totalPopulation,
    malePopulation,
    femalePopulation,
    medianAge: Math.round(medianAge * 10) / 10,
    ageDistribution,
    countriesOfBirth,
    householdComposition,
    seifaScore,
    populationDensity: Math.round(popDensity),
  };
}

// ============ TRANSPORT ============

export interface TransportData {
  journeyToWork: { name: string; value: number }[];
  vehicleOwnership: { name: string; value: number }[];
  modeShareTrend: { year: number; car: number; train: number; bus: number; active: number; wfh: number }[];
  ptPatronage: number;
  avgCommute: number;
}

export function getTransportData(areaId: string, year: number): TransportData {
  const p = getProfile(areaId);

  // Mode share varies dramatically by location
  let carDriver: number, carPassenger: number, train: number, bus: number;
  let ferry: number, cycling: number, walking: number, wfh: number, other: number;

  if (p.ptAccess === 'high' && p.urbanType === 'inner') {
    carDriver = seeded(areaId, 'car', 18, 32);
    carPassenger = seeded(areaId, 'carp', 2, 5);
    train = seeded(areaId, 'train', 18, 30);
    bus = seeded(areaId, 'bus', 8, 15);
    ferry = seeded(areaId, 'ferry', 0, 3);
    cycling = seeded(areaId, 'cycle', 2, 6);
    walking = seeded(areaId, 'walk', 8, 18);
    wfh = year === 2021 ? seeded(areaId, 'wfh', 12, 22) : seeded(areaId, 'wfh', 4, 8);
  } else if (p.urbanType === 'outer') {
    carDriver = seeded(areaId, 'car', 55, 72);
    carPassenger = seeded(areaId, 'carp', 4, 8);
    train = seeded(areaId, 'train', 5, 15);
    bus = seeded(areaId, 'bus', 2, 7);
    ferry = 0;
    cycling = seeded(areaId, 'cycle', 0.2, 1.5);
    walking = seeded(areaId, 'walk', 1, 4);
    wfh = year === 2021 ? seeded(areaId, 'wfh', 6, 14) : seeded(areaId, 'wfh', 2, 5);
  } else if (p.urbanType === 'regional') {
    carDriver = seeded(areaId, 'car', 58, 70);
    carPassenger = seeded(areaId, 'carp', 4, 8);
    train = seeded(areaId, 'train', 2, 8);
    bus = seeded(areaId, 'bus', 2, 6);
    ferry = 0;
    cycling = seeded(areaId, 'cycle', 0.5, 3);
    walking = seeded(areaId, 'walk', 2, 6);
    wfh = year === 2021 ? seeded(areaId, 'wfh', 8, 16) : seeded(areaId, 'wfh', 3, 6);
  } else {
    // Middle suburbs
    carDriver = seeded(areaId, 'car', 40, 58);
    carPassenger = seeded(areaId, 'carp', 3, 7);
    train = seeded(areaId, 'train', 10, 22);
    bus = seeded(areaId, 'bus', 4, 12);
    ferry = seeded(areaId, 'ferry', 0, 1);
    cycling = seeded(areaId, 'cycle', 0.5, 3);
    walking = seeded(areaId, 'walk', 3, 8);
    wfh = year === 2021 ? seeded(areaId, 'wfh', 8, 18) : seeded(areaId, 'wfh', 3, 7);
  }

  // Normalize to 100
  const total = carDriver + carPassenger + train + bus + ferry + cycling + walking + wfh;
  other = Math.max(0, 100 - total);
  const norm = 100 / (total + other);

  const journeyToWork = [
    { name: 'Car (driver)', value: Math.round(carDriver * norm * 10) / 10 },
    { name: 'Car (passenger)', value: Math.round(carPassenger * norm * 10) / 10 },
    { name: 'Train', value: Math.round(train * norm * 10) / 10 },
    { name: 'Bus', value: Math.round(bus * norm * 10) / 10 },
    { name: 'Ferry', value: Math.round(ferry * norm * 10) / 10 },
    { name: 'Cycling', value: Math.round(cycling * norm * 10) / 10 },
    { name: 'Walking', value: Math.round(walking * norm * 10) / 10 },
    { name: 'Work from home', value: Math.round(wfh * norm * 10) / 10 },
    { name: 'Other', value: Math.round(other * norm * 10) / 10 },
  ];

  const vehicleOwnership = [
    { name: '0 vehicles', value: p.urbanType === 'inner' ? seededInt(areaId, 'v0', 15, 30) : seededInt(areaId, 'v0', 3, 12) },
    { name: '1 vehicle', value: p.urbanType === 'inner' ? seededInt(areaId, 'v1', 35, 50) : seededInt(areaId, 'v1', 28, 40) },
    { name: '2 vehicles', value: p.urbanType === 'inner' ? seededInt(areaId, 'v2', 15, 25) : seededInt(areaId, 'v2', 30, 42) },
    { name: '3+ vehicles', value: p.urbanType === 'inner' ? seededInt(areaId, 'v3', 3, 8) : seededInt(areaId, 'v3', 10, 22) },
  ];

  const modeShareTrend = [
    { year: 2011, car: carDriver * 1.08, train: train * 0.88, bus: bus * 0.92, active: (cycling + walking) * 0.85, wfh: wfh * 0.4 },
    { year: 2016, car: carDriver * 1.03, train: train * 0.95, bus: bus * 0.96, active: (cycling + walking) * 0.93, wfh: wfh * 0.6 },
    { year: 2021, car: carDriver, train: train, bus: bus, active: cycling + walking, wfh: wfh },
  ].map(d => ({
    year: d.year,
    car: Math.round(d.car * 10) / 10,
    train: Math.round(d.train * 10) / 10,
    bus: Math.round(d.bus * 10) / 10,
    active: Math.round(d.active * 10) / 10,
    wfh: Math.round(d.wfh * 10) / 10,
  }));

  const pop = getDemographicsData(areaId, year).totalPopulation;
  const ptPatronage = Math.round(pop * (train + bus) / 100 * 250);

  const avgCommute = p.urbanType === 'inner' ? seeded(areaId, 'comm', 22, 35)
    : p.urbanType === 'outer' ? seeded(areaId, 'comm', 38, 55)
    : seeded(areaId, 'comm', 28, 42);

  return {
    journeyToWork,
    vehicleOwnership,
    modeShareTrend,
    ptPatronage: Math.round(ptPatronage),
    avgCommute: Math.round(avgCommute),
  };
}

// ============ ECONOMY ============

export interface EconomyData {
  employmentByIndustry: { name: string; value: number }[];
  unemploymentRate: number;
  participationRate: number;
  medianWeeklyIncome: number;
  jobDensity: number;
  employmentTrend: { year: number; employed: number; unemployed: number }[];
}

export function getEconomyData(areaId: string, year: number): EconomyData {
  const p = getProfile(areaId);
  const yearFactor = year === 2011 ? 0.88 : year === 2016 ? 0.94 : 1.0;

  const isInner = p.urbanType === 'inner';
  const employmentByIndustry = [
    { name: 'Professional Services', value: isInner ? seededInt(areaId, 'i1', 15, 25) : seededInt(areaId, 'i1', 6, 14) },
    { name: 'Health Care', value: seededInt(areaId, 'i2', 8, 16) },
    { name: 'Education & Training', value: seededInt(areaId, 'i3', 6, 12) },
    { name: 'Retail Trade', value: seededInt(areaId, 'i4', 7, 13) },
    { name: 'Construction', value: p.urbanType === 'outer' ? seededInt(areaId, 'i5', 8, 16) : seededInt(areaId, 'i5', 4, 10) },
    { name: 'Accommodation & Food', value: isInner ? seededInt(areaId, 'i6', 7, 14) : seededInt(areaId, 'i6', 5, 10) },
    { name: 'Public Admin', value: seededInt(areaId, 'i7', 4, 10) },
    { name: 'Financial Services', value: isInner ? seededInt(areaId, 'i8', 8, 16) : seededInt(areaId, 'i8', 3, 8) },
    { name: 'Transport & Logistics', value: seededInt(areaId, 'i9', 3, 9) },
    { name: 'Manufacturing', value: p.urbanType === 'outer' ? seededInt(areaId, 'i10', 5, 12) : seededInt(areaId, 'i10', 2, 6) },
  ];

  const unemploymentRate = p.affluence === 'high' ? seeded(areaId, 'unemp', 2.5, 4.5)
    : p.affluence === 'medium' ? seeded(areaId, 'unemp', 4, 7)
    : seeded(areaId, 'unemp', 5.5, 10);

  const participationRate = p.affluence === 'high' ? seeded(areaId, 'part', 62, 72)
    : seeded(areaId, 'part', 52, 65);

  const incomeBase = p.affluence === 'high' ? 1800 : p.affluence === 'medium' ? 1350 : 1050;
  const medianWeeklyIncome = Math.round((incomeBase + seeded(areaId, 'inc', -200, 200)) * yearFactor);

  const jobDensity = isInner ? seeded(areaId, 'jd', 1.5, 4.0) : seeded(areaId, 'jd', 0.3, 1.2);

  const pop = getDemographicsData(areaId, 2021).totalPopulation;
  const workingPop = pop * 0.65;
  const employmentTrend = [2011, 2016, 2021].map(y => ({
    year: y,
    employed: Math.round(workingPop * (participationRate / 100) * (1 - unemploymentRate / 100) * (y === 2011 ? 0.88 : y === 2016 ? 0.94 : 1)),
    unemployed: Math.round(workingPop * (unemploymentRate / 100) * (y === 2011 ? 1.2 : y === 2016 ? 1.1 : 1)),
  }));

  return {
    employmentByIndustry,
    unemploymentRate: Math.round(unemploymentRate * 10) / 10,
    participationRate: Math.round(participationRate * 10) / 10,
    medianWeeklyIncome,
    jobDensity: Math.round(jobDensity * 100) / 100,
    employmentTrend,
  };
}

// ============ EDUCATION ============

export interface EducationData {
  attainment: { name: string; value: number }[];
  schoolEnrolment: { name: string; value: number }[];
  qualificationTrend: { year: number; bachelor: number; diploma: number; certificate: number }[];
}

export function getEducationData(areaId: string, year: number): EducationData {
  const p = getProfile(areaId);

  const highEd = p.affluence === 'high';
  const attainment = [
    { name: 'Postgraduate', value: highEd ? seededInt(areaId, 'e1', 12, 22) : seededInt(areaId, 'e1', 4, 12) },
    { name: 'Bachelor Degree', value: highEd ? seededInt(areaId, 'e2', 20, 32) : seededInt(areaId, 'e2', 10, 20) },
    { name: 'Diploma', value: seededInt(areaId, 'e3', 7, 12) },
    { name: 'Certificate III/IV', value: highEd ? seededInt(areaId, 'e4', 8, 14) : seededInt(areaId, 'e4', 14, 24) },
    { name: 'Year 12', value: seededInt(areaId, 'e5', 12, 22) },
    { name: 'Year 10 or below', value: highEd ? seededInt(areaId, 'e6', 5, 12) : seededInt(areaId, 'e6', 12, 24) },
  ];

  const pop = getDemographicsData(areaId, year).totalPopulation;
  const schoolEnrolment = [
    { name: 'Primary School', value: Math.round(pop * seeded(areaId, 'se1', 0.06, 0.12)) },
    { name: 'Secondary School', value: Math.round(pop * seeded(areaId, 'se2', 0.04, 0.08)) },
    { name: 'TAFE', value: Math.round(pop * seeded(areaId, 'se3', 0.01, 0.03)) },
    { name: 'University', value: Math.round(pop * seeded(areaId, 'se4', 0.02, 0.06)) },
  ];

  const bachelorBase = highEd ? 24 : 14;
  const qualificationTrend = [2011, 2016, 2021].map(y => ({
    year: y,
    bachelor: Math.round((bachelorBase * (y === 2011 ? 0.82 : y === 2016 ? 0.91 : 1)) * 10) / 10,
    diploma: Math.round((9 + seeded(areaId, 'dt', -2, 2)) * 10) / 10,
    certificate: Math.round(((highEd ? 11 : 18) * (y === 2011 ? 1.05 : y === 2016 ? 1.02 : 1)) * 10) / 10,
  }));

  return { attainment, schoolEnrolment, qualificationTrend };
}

// ============ HOUSING ============

export interface HousingData {
  dwellingTypes: { name: string; value: number }[];
  tenure: { name: string; value: number }[];
  medianWeeklyRent: number;
  medianHousePrice: number;
  housingTrend: { year: number; houses: number; apartments: number; townhouses: number }[];
}

export function getHousingData(areaId: string, year: number): HousingData {
  const p = getProfile(areaId);
  const yearFactor = year === 2011 ? 0.65 : year === 2016 ? 0.82 : 1.0;

  const isInner = p.urbanType === 'inner';
  const dwellingTypes = isInner ? [
    { name: 'Apartment', value: seededInt(areaId, 'd1', 55, 80) },
    { name: 'Townhouse', value: seededInt(areaId, 'd2', 8, 18) },
    { name: 'Separate House', value: seededInt(areaId, 'd3', 5, 20) },
    { name: 'Other', value: seededInt(areaId, 'd4', 2, 6) },
  ] : p.urbanType === 'outer' ? [
    { name: 'Separate House', value: seededInt(areaId, 'd3', 60, 82) },
    { name: 'Townhouse', value: seededInt(areaId, 'd2', 8, 18) },
    { name: 'Apartment', value: seededInt(areaId, 'd1', 3, 15) },
    { name: 'Other', value: seededInt(areaId, 'd4', 1, 4) },
  ] : [
    { name: 'Separate House', value: seededInt(areaId, 'd3', 30, 55) },
    { name: 'Apartment', value: seededInt(areaId, 'd1', 20, 40) },
    { name: 'Townhouse', value: seededInt(areaId, 'd2', 10, 22) },
    { name: 'Other', value: seededInt(areaId, 'd4', 2, 5) },
  ];

  const tenure = [
    { name: 'Owned outright', value: p.urbanType === 'outer' ? seededInt(areaId, 't1', 25, 35) : seededInt(areaId, 't1', 15, 28) },
    { name: 'Mortgage', value: p.urbanType === 'outer' ? seededInt(areaId, 't2', 28, 40) : seededInt(areaId, 't2', 18, 30) },
    { name: 'Renting', value: isInner ? seededInt(areaId, 't3', 35, 55) : seededInt(areaId, 't3', 20, 35) },
    { name: 'Other', value: seededInt(areaId, 't4', 2, 6) },
  ];

  const rentBase = p.affluence === 'high' ? 650 : p.affluence === 'medium' ? 480 : 380;
  const medianWeeklyRent = Math.round((rentBase + seeded(areaId, 'rent', -60, 60)) * yearFactor);

  const priceBase = p.affluence === 'high' ? 1800000 : p.affluence === 'medium' ? 1100000 : 750000;
  const medianHousePrice = Math.round((priceBase + seeded(areaId, 'price', -200000, 200000)) * yearFactor);

  const popBase = getDemographicsData(areaId, 2021).totalPopulation;
  const housingTrend = [2011, 2016, 2021].map(y => {
    const f = y === 2011 ? 0.82 : y === 2016 ? 0.91 : 1;
    return {
      year: y,
      houses: Math.round(popBase * 0.35 * f * (isInner ? 0.3 : 1)),
      apartments: Math.round(popBase * 0.25 * f * (isInner ? 2.5 : 0.6)),
      townhouses: Math.round(popBase * 0.12 * f),
    };
  });

  return { dwellingTypes, tenure, medianWeeklyRent, medianHousePrice, housingTrend };
}

// ============ GROWTH ============

export interface GrowthData {
  populationHistory: { year: number; population: number }[];
  populationProjections: { year: number; population: number }[];
  employmentGrowth: { year: number; jobs: number }[];
  annualGrowthRate: number;
  projectedGrowthRate: number;
}

export function getGrowthData(areaId: string): GrowthData {
  const p = getProfile(areaId);
  const pop2021 = getDemographicsData(areaId, 2021).totalPopulation;

  // Growth rates vary by area type
  const historicalGrowth = p.urbanType === 'outer' ? seeded(areaId, 'hg', 0.018, 0.035)
    : p.urbanType === 'inner' ? seeded(areaId, 'hg', 0.015, 0.028)
    : p.urbanType === 'regional' ? seeded(areaId, 'hg', 0.008, 0.018)
    : seeded(areaId, 'hg', 0.012, 0.022);

  const pop2016 = Math.round(pop2021 / Math.pow(1 + historicalGrowth, 5));
  const pop2011 = Math.round(pop2016 / Math.pow(1 + historicalGrowth * 1.1, 5));

  const populationHistory = [
    { year: 2011, population: pop2011 },
    { year: 2016, population: pop2016 },
    { year: 2021, population: pop2021 },
  ];

  // Future growth (Camden/outer areas grow faster due to greenfield development)
  const futureGrowth = areaId === 'lga_camden' ? 0.04
    : areaId === 'lga_blacktown' ? 0.025
    : p.urbanType === 'outer' ? seeded(areaId, 'fg', 0.015, 0.03)
    : p.urbanType === 'inner' ? seeded(areaId, 'fg', 0.01, 0.02)
    : seeded(areaId, 'fg', 0.008, 0.018);

  const populationProjections = [2026, 2031, 2036, 2041].map(y => ({
    year: y,
    population: Math.round(pop2021 * Math.pow(1 + futureGrowth, y - 2021)),
  }));

  // Employment growth
  const jobs2021 = Math.round(pop2021 * seeded(areaId, 'jobs', 0.35, 0.65));
  const jobGrowth = futureGrowth * 0.8;
  const employmentGrowth = [
    { year: 2011, jobs: Math.round(jobs2021 * 0.82) },
    { year: 2016, jobs: Math.round(jobs2021 * 0.91) },
    { year: 2021, jobs: jobs2021 },
    { year: 2026, jobs: Math.round(jobs2021 * Math.pow(1 + jobGrowth, 5)) },
    { year: 2031, jobs: Math.round(jobs2021 * Math.pow(1 + jobGrowth, 10)) },
    { year: 2036, jobs: Math.round(jobs2021 * Math.pow(1 + jobGrowth, 15)) },
    { year: 2041, jobs: Math.round(jobs2021 * Math.pow(1 + jobGrowth, 20)) },
  ];

  return {
    populationHistory,
    populationProjections,
    employmentGrowth,
    annualGrowthRate: Math.round(historicalGrowth * 1000) / 10,
    projectedGrowthRate: Math.round(futureGrowth * 1000) / 10,
  };
}

// ============ BENCHMARKS ============

export function getGreaterSydneyBenchmark(year: number) {
  return {
    demographics: getDemographicsData('benchmark_gsy', year),
    transport: getTransportData('benchmark_gsy', year),
    economy: getEconomyData('benchmark_gsy', year),
    education: getEducationData('benchmark_gsy', year),
    housing: getHousingData('benchmark_gsy', year),
    growth: getGrowthData('benchmark_gsy'),
  };
}
