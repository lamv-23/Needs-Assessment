/**
 * Demographic Indicators for Greater Sydney LGAs
 * Used for interactive choropleth map visualization
 * 
 * Includes:
 * - Population (2021 ABS Census / 2026 projection)
 * - Population density (persons per km²)
 * - Growth rate (2021-2041 projected annual %)
 * - Unemployment rate (%)
 * - SEIFA Score (Socio-Economic Indexes for Areas)
 */

export interface DemographicIndicators {
  lgaId: string;
  lgaName: string;
  population2021: number;
  populationProjected2041: number;
  populationDensity: number; // per km²
  growthRate: number; // annual %
  unemploymentRate: number; // %
  seifaScore: number; // 500-1500 scale, higher = more advantaged
  medianAge: number;
}

// Greater Sydney LGAs with demographic metrics
export const demographic_indicators: DemographicIndicators[] = [
  // ── Inner Sydney ──────────────────────────────────────────────────
  {
    lgaId: 'lga_sydney',
    lgaName: 'City of Sydney',
    population2021: 246343,
    populationProjected2041: 310000,
    populationDensity: 8900,
    growthRate: 1.16,
    unemploymentRate: 3.2,
    seifaScore: 1087,
    medianAge: 35.2,
  },
  {
    lgaId: 'lga_north_sydney',
    lgaName: 'North Sydney',
    population2021: 72470,
    populationProjected2041: 85000,
    populationDensity: 3800,
    growthRate: 0.82,
    unemploymentRate: 2.9,
    seifaScore: 1143,
    medianAge: 37.8,
  },
  {
    lgaId: 'lga_woollahra',
    lgaName: 'Woollahra',
    population2021: 57380,
    populationProjected2041: 62000,
    populationDensity: 4200,
    growthRate: 0.39,
    unemploymentRate: 2.5,
    seifaScore: 1172,
    medianAge: 41.5,
  },
  {
    lgaId: 'lga_waverley',
    lgaName: 'Waverley',
    population2021: 73280,
    populationProjected2041: 81000,
    populationDensity: 8200,
    growthRate: 0.50,
    unemploymentRate: 3.0,
    seifaScore: 1118,
    medianAge: 35.6,
  },
  {
    lgaId: 'lga_randwick',
    lgaName: 'Randwick',
    population2021: 143200,
    populationProjected2041: 161000,
    populationDensity: 3600,
    growthRate: 0.59,
    unemploymentRate: 3.1,
    seifaScore: 1089,
    medianAge: 37.2,
  },
  {
    lgaId: 'lga_bayside',
    lgaName: 'Bayside',
    population2021: 160310,
    populationProjected2041: 189000,
    populationDensity: 3100,
    growthRate: 0.83,
    unemploymentRate: 3.6,
    seifaScore: 1022,
    medianAge: 38.9,
  },
  {
    lgaId: 'lga_inner_west',
    lgaName: 'Inner West',
    population2021: 196920,
    populationProjected2041: 222000,
    populationDensity: 5400,
    growthRate: 0.61,
    unemploymentRate: 3.3,
    seifaScore: 1073,
    medianAge: 37.1,
  },
  {
    lgaId: 'lga_burwood',
    lgaName: 'Burwood',
    population2021: 42890,
    populationProjected2041: 52000,
    populationDensity: 7100,
    growthRate: 0.97,
    unemploymentRate: 3.8,
    seifaScore: 1019,
    medianAge: 35.4,
  },
  {
    lgaId: 'lga_strathfield',
    lgaName: 'Strathfield',
    population2021: 48780,
    populationProjected2041: 57000,
    populationDensity: 5700,
    growthRate: 0.79,
    unemploymentRate: 3.5,
    seifaScore: 1041,
    medianAge: 36.1,
  },
  {
    lgaId: 'lga_canada_bay',
    lgaName: 'Canada Bay',
    population2021: 87040,
    populationProjected2041: 103000,
    populationDensity: 4800,
    growthRate: 0.85,
    unemploymentRate: 2.8,
    seifaScore: 1128,
    medianAge: 39.4,
  },
  {
    lgaId: 'lga_mosman',
    lgaName: 'Mosman',
    population2021: 30420,
    populationProjected2041: 33000,
    populationDensity: 4300,
    growthRate: 0.42,
    unemploymentRate: 2.3,
    seifaScore: 1195,
    medianAge: 43.1,
  },
  {
    lgaId: 'lga_hunters_hill',
    lgaName: 'Hunters Hill',
    population2021: 14630,
    populationProjected2041: 16500,
    populationDensity: 1900,
    growthRate: 0.61,
    unemploymentRate: 2.6,
    seifaScore: 1181,
    medianAge: 44.2,
  },
  // ── Northern Sydney ───────────────────────────────────────────────
  {
    lgaId: 'lga_lane_cove',
    lgaName: 'Lane Cove',
    population2021: 39550,
    populationProjected2041: 47000,
    populationDensity: 3800,
    growthRate: 0.87,
    unemploymentRate: 2.7,
    seifaScore: 1159,
    medianAge: 40.3,
  },
  {
    lgaId: 'lga_willoughby',
    lgaName: 'Willoughby',
    population2021: 79950,
    populationProjected2041: 93000,
    populationDensity: 3500,
    growthRate: 0.77,
    unemploymentRate: 2.8,
    seifaScore: 1155,
    medianAge: 40.7,
  },
  {
    lgaId: 'lga_ryde',
    lgaName: 'City of Ryde',
    population2021: 133500,
    populationProjected2041: 163000,
    populationDensity: 3300,
    growthRate: 1.00,
    unemploymentRate: 3.1,
    seifaScore: 1063,
    medianAge: 37.5,
  },
  {
    lgaId: 'lga_ku_ring_gai',
    lgaName: 'Ku-ring-gai',
    population2021: 123800,
    populationProjected2041: 138000,
    populationDensity: 820,
    growthRate: 0.55,
    unemploymentRate: 2.6,
    seifaScore: 1178,
    medianAge: 43.9,
  },
  {
    lgaId: 'lga_northern_beaches',
    lgaName: 'Northern Beaches',
    population2021: 274900,
    populationProjected2041: 305000,
    populationDensity: 680,
    growthRate: 0.52,
    unemploymentRate: 2.9,
    seifaScore: 1140,
    medianAge: 41.8,
  },
  {
    lgaId: 'lga_hornsby',
    lgaName: 'Hornsby',
    population2021: 149490,
    populationProjected2041: 166000,
    populationDensity: 380,
    growthRate: 0.54,
    unemploymentRate: 3.0,
    seifaScore: 1104,
    medianAge: 42.3,
  },
  {
    lgaId: 'lga_georges_river',
    lgaName: 'Georges River',
    population2021: 102840,
    populationProjected2041: 122000,
    populationDensity: 3700,
    growthRate: 0.85,
    unemploymentRate: 3.4,
    seifaScore: 1050,
    medianAge: 39.6,
  },
  // ── Western Sydney ────────────────────────────────────────────────
  {
    lgaId: 'lga_parramatta',
    lgaName: 'City of Parramatta',
    population2021: 252000,
    populationProjected2041: 331000,
    populationDensity: 2140,
    growthRate: 1.38,
    unemploymentRate: 3.5,
    seifaScore: 1023,
    medianAge: 35.7,
  },
  {
    lgaId: 'lga_cumberland',
    lgaName: 'Cumberland',
    population2021: 241000,
    populationProjected2041: 281000,
    populationDensity: 4500,
    growthRate: 0.77,
    unemploymentRate: 4.6,
    seifaScore: 957,
    medianAge: 35.2,
  },
  {
    lgaId: 'lga_hills',
    lgaName: 'The Hills Shire',
    population2021: 181500,
    populationProjected2041: 238000,
    populationDensity: 390,
    growthRate: 1.38,
    unemploymentRate: 3.0,
    seifaScore: 1112,
    medianAge: 38.4,
  },
  {
    lgaId: 'lga_blacktown',
    lgaName: 'Blacktown',
    population2021: 385000,
    populationProjected2041: 464000,
    populationDensity: 1340,
    growthRate: 0.96,
    unemploymentRate: 4.2,
    seifaScore: 968,
    medianAge: 34.9,
  },
  {
    lgaId: 'lga_penrith',
    lgaName: 'Penrith',
    population2021: 220000,
    populationProjected2041: 271000,
    populationDensity: 320,
    growthRate: 1.05,
    unemploymentRate: 3.9,
    seifaScore: 955,
    medianAge: 37.2,
  },
  {
    lgaId: 'lga_hawkesbury',
    lgaName: 'Hawkesbury',
    population2021: 67500,
    populationProjected2041: 77000,
    populationDensity: 26,
    growthRate: 0.68,
    unemploymentRate: 3.6,
    seifaScore: 979,
    medianAge: 41.5,
  },
  {
    lgaId: 'lga_fairfield',
    lgaName: 'Fairfield',
    population2021: 218300,
    populationProjected2041: 242000,
    populationDensity: 2800,
    growthRate: 0.52,
    unemploymentRate: 6.1,
    seifaScore: 879,
    medianAge: 36.4,
  },
  {
    lgaId: 'lga_liverpool',
    lgaName: 'Liverpool',
    population2021: 236400,
    populationProjected2041: 317000,
    populationDensity: 750,
    growthRate: 1.49,
    unemploymentRate: 4.8,
    seifaScore: 937,
    medianAge: 34.9,
  },
  {
    lgaId: 'lga_canterbury_bankstown',
    lgaName: 'Canterbury-Bankstown',
    population2021: 380700,
    populationProjected2041: 437000,
    populationDensity: 4900,
    growthRate: 0.70,
    unemploymentRate: 5.2,
    seifaScore: 927,
    medianAge: 36.1,
  },
  {
    lgaId: 'lga_blue_mountains',
    lgaName: 'Blue Mountains',
    population2021: 82000,
    populationProjected2041: 86000,
    populationDensity: 25,
    growthRate: 0.24,
    unemploymentRate: 3.5,
    seifaScore: 1062,
    medianAge: 45.2,
  },
  // ── South & South-West Sydney ─────────────────────────────────────
  {
    lgaId: 'lga_sutherland',
    lgaName: 'Sutherland Shire',
    population2021: 227900,
    populationProjected2041: 255000,
    populationDensity: 780,
    growthRate: 0.57,
    unemploymentRate: 3.0,
    seifaScore: 1100,
    medianAge: 40.9,
  },
  {
    lgaId: 'lga_campbelltown',
    lgaName: 'Campbelltown',
    population2021: 178000,
    populationProjected2041: 226000,
    populationDensity: 490,
    growthRate: 1.19,
    unemploymentRate: 5.3,
    seifaScore: 929,
    medianAge: 34.8,
  },
  {
    lgaId: 'lga_camden',
    lgaName: 'Camden',
    population2021: 113000,
    populationProjected2041: 207000,
    populationDensity: 310,
    growthRate: 3.07,
    unemploymentRate: 3.5,
    seifaScore: 1002,
    medianAge: 33.1,
  },
  {
    lgaId: 'lga_wollondilly',
    lgaName: 'Wollondilly',
    population2021: 57500,
    populationProjected2041: 82000,
    populationDensity: 31,
    growthRate: 1.79,
    unemploymentRate: 3.7,
    seifaScore: 988,
    medianAge: 38.8,
  },
  // ── Hunter ────────────────────────────────────────────────────────
  {
    lgaId: 'lga_newcastle',
    lgaName: 'Newcastle',
    population2021: 167000,
    populationProjected2041: 195000,
    populationDensity: 1200,
    growthRate: 0.78,
    unemploymentRate: 4.1,
    seifaScore: 988,
    medianAge: 38.3,
  },
  {
    lgaId: 'lga_lake_macquarie',
    lgaName: 'Lake Macquarie',
    population2021: 210000,
    populationProjected2041: 237000,
    populationDensity: 490,
    growthRate: 0.61,
    unemploymentRate: 4.0,
    seifaScore: 997,
    medianAge: 42.1,
  },
  // ── Illawarra ─────────────────────────────────────────────────────
  {
    lgaId: 'lga_wollongong',
    lgaName: 'Wollongong',
    population2021: 211000,
    populationProjected2041: 238000,
    populationDensity: 530,
    growthRate: 0.61,
    unemploymentRate: 4.4,
    seifaScore: 986,
    medianAge: 39.5,
  },
  {
    lgaId: 'lga_shellharbour',
    lgaName: 'Shellharbour',
    population2021: 76500,
    populationProjected2041: 98000,
    populationDensity: 430,
    growthRate: 1.24,
    unemploymentRate: 4.6,
    seifaScore: 952,
    medianAge: 38.2,
  },
];

export type MetricKey = 'population2021' | 'populationProjected2041' | 'populationDensity' | 'growthRate' | 'unemploymentRate' | 'seifaScore' | 'medianAge';

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  description: string;
  unit: string;
  colorScheme: 'sequential' | 'diverging'; // sequential for normal trends, diverging for good/bad
  formatFn: (value: number) => string;
}

export const METRICS: Record<MetricKey, MetricDefinition> = {
  population2021: {
    key: 'population2021',
    label: 'Population (2021)',
    description: 'ABS Census 2021 resident population',
    unit: 'persons',
    colorScheme: 'sequential',
    formatFn: (v) => Number(v).toLocaleString(),
  },
  populationProjected2041: {
    key: 'populationProjected2041',
    label: 'Projected Population (2041)',
    description: 'NSW DPE projected population',
    unit: 'persons',
    colorScheme: 'sequential',
    formatFn: (v) => Number(v).toLocaleString(),
  },
  populationDensity: {
    key: 'populationDensity',
    label: 'Population Density',
    description: 'Persons per square kilometer',
    unit: 'per km²',
    colorScheme: 'sequential',
    formatFn: (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }),
  },
  growthRate: {
    key: 'growthRate',
    label: 'Annual Growth Rate',
    description: 'Projected annual growth 2021-2041',
    unit: '%',
    colorScheme: 'diverging',
    formatFn: (v) => `${(v * 100).toFixed(2)}%`,
  },
  unemploymentRate: {
    key: 'unemploymentRate',
    label: 'Unemployment Rate',
    description: 'ABS Labour force unemployment rate',
    unit: '%',
    colorScheme: 'diverging',
    formatFn: (v) => `${v.toFixed(1)}%`,
  },
  seifaScore: {
    key: 'seifaScore',
    label: 'SEIFA Score',
    description: 'Socio-Economic Indexes for Areas (higher = more advantaged)',
    unit: 'score',
    colorScheme: 'sequential',
    formatFn: (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }),
  },
  medianAge: {
    key: 'medianAge',
    label: 'Median Age',
    description: 'Median age of population',
    unit: 'years',
    colorScheme: 'sequential',
    formatFn: (v) => `${v.toFixed(1)} years`,
  },
};

export function getIndicatorForLGA(lgaId: string, metric: MetricKey): number | undefined {
  const lga = demographic_indicators.find(d => d.lgaId === lgaId);
  return lga ? lga[metric] : undefined;
}

export function getLGAByName(lgaName: string): DemographicIndicators | undefined {
  return demographic_indicators.find(d => d.lgaName.toLowerCase() === lgaName.toLowerCase());
}

export function getMetricColorScheme(metric: MetricKey): string[] {
  const def = METRICS[metric];
  
  if (def.colorScheme === 'diverging') {
    // Red (bad) to Green (good) diverging scale
    return ['#a50026', '#d73027', '#f46d43', '#fee090', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'];
  } else {
    // Sequential scale: light to dark
    return ['#eff3ff', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'];
  }
}

/**
 * Prepare GeoJSON features with metric values for choropleth
 */
export function enrichGeoJSONWithMetric(
  geoJson: any,
  metric: MetricKey
): any {
  const enriched = { ...geoJson };
  enriched.features = geoJson.features.map((feature: any) => {
    const lgaId = feature.properties?.id;
    const value = getIndicatorForLGA(lgaId, metric);
    return {
      ...feature,
      properties: {
        ...feature.properties,
        [metric]: value,
      },
    };
  });
  return enriched;
}
