import type { IndicatorDef, IndicatorId, NeedDomain, SourceRef } from './types';

// Indicators that share a source share one SourceRef, so the narrative and
// Word export can de-duplicate citations on `full`.
const ABS_CENSUS_URL = 'https://www.abs.gov.au/census';
const censusSource = (table: string, title: string, year = 2021): SourceRef => ({
  short: `ABS Census ${year} ${table}`,
  full: `Australian Bureau of Statistics, ${year} Census of Population and Housing: ${title} (${table})`,
  url: ABS_CENSUS_URL,
});

/**
 * Every source the assessment cites. The indicators use all but `erp`, `b46` and `g59`, which the insights use:
 * `b46` and `g59` are the 2011 and 2016 journey to work tables behind the earlier car dependency years.
 */
export const SOURCES = {
  g01: censusSource('G01', 'Selected person characteristics'),
  g13: censusSource('G13', 'Language used at home by proficiency in spoken English'),
  g18: censusSource('G18', 'Core activity need for assistance'),
  g33: censusSource('G33', 'Total household income (weekly)'),
  g34: censusSource('G34', 'Number of motor vehicles by dwellings'),
  g46: censusSource('G46', 'Labour force status'),
  g62: censusSource('G62', 'Method of travel to work'),
  b46: censusSource('B46', 'Method of travel to work', 2011),
  g59: censusSource('G59', 'Method of travel to work', 2016),
  gtfs: {
    short: 'TfNSW GTFS',
    full: 'Transport for NSW, GTFS timetable data: weekday 7-9am departures per stop',
    url: 'https://opendata.transport.nsw.gov.au',
  },
  commuteDistance: {
    short: 'ABS Data by Region (Census 2016)',
    full: 'Australian Bureau of Statistics, Data by Region: commuting distance, 2016 Census',
    url: 'https://dbr.abs.gov.au',
  },
  crashes: {
    short: 'TfNSW Centre for Road Safety',
    full: 'Transport for NSW, Centre for Road Safety: NSW road crash data',
    url: 'https://opendata.transport.nsw.gov.au/data/dataset/06f9cf3d-0a9d-4098-b0f0-fa9efbdd3921',
  },
  seifa: {
    short: 'ABS SEIFA 2021',
    full: 'Australian Bureau of Statistics, Socio-Economic Indexes for Areas (SEIFA) 2021: Index of Relative Socio-economic Disadvantage (IRSD)',
    url: 'https://www.abs.gov.au/statistics/people/people-and-communities/socio-economic-indexes-areas-seifa-australia/latest-release',
  },
  populationProjections: {
    short: 'NSW DPE projections',
    full: 'NSW Department of Planning, Housing and Infrastructure, NSW population projections by local government area',
    url: 'https://www.planning.nsw.gov.au/data-and-insights/population-projections/explore-the-data',
  },
  employmentProjections: {
    short: 'TfNSW TZP24',
    full: 'Transport for NSW, Travel Zone Projections 2024 (TZP24): employment projections by local government area',
    url: 'https://opendata.transport.nsw.gov.au/data/dataset/employment-projections',
  },
  buildingApprovals: {
    short: 'ABS Building Approvals',
    full: 'Australian Bureau of Statistics, Building Approvals, Australia: dwelling approvals by local government area',
    url: 'https://www.abs.gov.au/statistics/industry/building-and-construction/building-approvals-australia',
  },
  erp: {
    short: 'ABS ERP',
    full: 'Australian Bureau of Statistics, Regional population: estimated resident population (ERP) by local government area',
    url: 'https://www.abs.gov.au/statistics/people/population/regional-population/latest-release',
  },
} satisfies Record<string, SourceRef>;

/** In the spec table's order, grouped by domain. */
export const INDICATORS: IndicatorDef[] = [
  // Transport
  {
    id: 'car_dependency', domain: 'transport', label: 'Car dependency',
    unit: '%', direction: 'higher', aggregation: 'weighted', scored: true, scale: 1, decimals: 1,
    source: SOURCES.g62,
  },
  {
    id: 'zero_car_households', domain: 'transport', label: 'Households without a car',
    unit: '%', direction: 'higher', aggregation: 'ratio', scored: true, scale: 100, decimals: 1,
    source: SOURCES.g34,
  },
  {
    id: 'frequent_stop_share', domain: 'transport', label: 'Stops with frequent AM-peak service',
    unit: '%', direction: 'lower', aggregation: 'ratio', scored: true, scale: 100, decimals: 1,
    source: SOURCES.gtfs,
  },
  {
    id: 'am_peak_departures_per_1000', domain: 'transport', label: 'AM-peak departures per 1,000 residents',
    unit: 'per 1,000', direction: 'lower', aggregation: 'ratio', scored: true, scale: 1000, decimals: 1,
    source: SOURCES.gtfs,
  },
  {
    id: 'commute_distance_km', domain: 'transport', label: 'Average commuting distance',
    unit: 'km', direction: 'higher', aggregation: 'weighted', scored: true, scale: 1, decimals: 1,
    source: SOURCES.commuteDistance,
  },
  {
    // Latest-year totalCrashes ÷ ERP of that year (nearest ERP year if missing) × 10,000
    id: 'crash_rate', domain: 'transport', label: 'Road crashes per 10,000 residents',
    unit: 'per 10,000', direction: 'higher', aggregation: 'ratio', scored: true, scale: 10000, decimals: 1,
    source: SOURCES.crashes,
  },
  // Socio-economic
  {
    id: 'seifa_irsd', domain: 'socio', label: 'SEIFA disadvantage (IRSD)',
    unit: 'score', direction: 'lower', aggregation: 'weighted', scored: true, scale: 1, decimals: 0,
    source: SOURCES.seifa,
  },
  {
    id: 'unemployment_rate', domain: 'socio', label: 'Unemployment rate',
    unit: '%', direction: 'higher', aggregation: 'weighted', scored: true, scale: 1, decimals: 1,
    source: SOURCES.g46,
  },
  {
    id: 'low_income_households', domain: 'socio', label: 'Low-income households',
    unit: '%', direction: 'higher', aggregation: 'ratio', scored: true, scale: 100, decimals: 1,
    source: SOURCES.g33,
  },
  {
    id: 'needs_assistance', domain: 'socio', label: 'People needing assistance',
    unit: '%', direction: 'higher', aggregation: 'ratio', scored: true, scale: 100, decimals: 1,
    source: SOURCES.g18,
  },
  {
    id: 'limited_english', domain: 'socio', label: 'Limited English proficiency',
    unit: '%', direction: 'higher', aggregation: 'ratio', scored: true, scale: 100, decimals: 1,
    source: SOURCES.g13,
  },
  {
    id: 'older_residents', domain: 'socio', label: 'Residents aged 65+',
    unit: '%', direction: 'higher', aggregation: 'ratio', scored: true, scale: 100, decimals: 1,
    source: SOURCES.g01,
  },
  {
    // Context only (user decision 2026-10-22): shown with a percentile but not scored.
    id: 'indigenous_share', domain: 'socio', label: 'Aboriginal and Torres Strait Islander residents',
    unit: '%', direction: 'higher', aggregation: 'ratio', scored: false, scale: 100, decimals: 1,
    source: SOURCES.g01,
  },
  // Growth
  {
    id: 'pop_growth_2041', domain: 'growth', label: 'Population growth 2021–41',
    unit: '%', direction: 'higher', aggregation: 'ratio', scored: true, scale: 100, decimals: 1,
    source: SOURCES.populationProjections,
  },
  {
    id: 'job_growth_2041', domain: 'growth', label: 'Job growth 2021–41',
    unit: '%', direction: 'higher', aggregation: 'ratio', scored: true, scale: 100, decimals: 1,
    source: SOURCES.employmentProjections,
  },
  {
    id: 'approvals_per_1000', domain: 'growth', label: 'Dwelling approvals per 1,000 residents (last 12 months)',
    unit: 'per 1,000', direction: 'higher', aggregation: 'ratio', scored: true, scale: 1000, decimals: 1,
    source: SOURCES.buildingApprovals,
  },
];

export const INDICATOR_BY_ID = Object.fromEntries(
  INDICATORS.map(def => [def.id, def]),
) as Record<IndicatorId, IndicatorDef>;

/** The need domains, in display order. */
export const NEED_DOMAINS: NeedDomain[] = ['transport', 'socio', 'growth'];

export const DOMAIN_LABELS: Record<NeedDomain, string> = {
  transport: 'Transport disadvantage',
  socio: 'Socio-economic disadvantage',
  growth: 'Growth pressure',
};
