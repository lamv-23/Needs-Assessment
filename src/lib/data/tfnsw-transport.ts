/**
 * TfNSW Transport Data (2019-2026)
 *
 * IMPORTANT: The mode share, commute time and PT patronage values in this file
 * are modelled/estimated figures and are NOT sourced from official TfNSW Open Data.
 * They are indicative trend estimates only and should not be cited as authoritative data.
 * For verified statistics, contact TfNSW directly or consult the ABS Census journey-to-work data.
 */

/**
 * Disclaimer shown wherever this modelled data is displayed.
 */
export const TRANSPORT_DATA_NOTE =
  'Modelled estimates only — not sourced from official TfNSW data. Indicative trend purposes only.';

export interface TransportMetrics {
  year: number;
  lgaName: string;
  modeShareCar: number; // %
  modeSharePT: number; // %
  modeShareActive: number; // %
  averageCommuteTime: number; // minutes
  ptPatronagePerCapita: number; // trips per capita per day
}

// Historical data for major LGAs (2019-2026)
export const tfnsw_transport_data: TransportMetrics[] = [
  // Sydney CBD/Central
  { year: 2019, lgaName: 'Sydney', modeShareCar: 24.5, modeSharePT: 64.2, modeShareActive: 8.1, averageCommuteTime: 32, ptPatronagePerCapita: 2.3 },
  { year: 2020, lgaName: 'Sydney', modeShareCar: 28.1, modeSharePT: 58.6, modeShareActive: 9.2, averageCommuteTime: 28, ptPatronagePerCapita: 1.8 },
  { year: 2021, lgaName: 'Sydney', modeShareCar: 27.3, modeSharePT: 61.2, modeShareActive: 9.4, averageCommuteTime: 30, ptPatronagePerCapita: 2.1 },
  { year: 2022, lgaName: 'Sydney', modeShareCar: 26.4, modeSharePT: 62.1, modeShareActive: 9.8, averageCommuteTime: 31, ptPatronagePerCapita: 2.2 },
  { year: 2023, lgaName: 'Sydney', modeShareCar: 25.8, modeSharePT: 63.4, modeShareActive: 10.1, averageCommuteTime: 32, ptPatronagePerCapita: 2.3 },
  { year: 2024, lgaName: 'Sydney', modeShareCar: 25.2, modeSharePT: 64.1, modeShareActive: 10.4, averageCommuteTime: 33, ptPatronagePerCapita: 2.4 },
  { year: 2025, lgaName: 'Sydney', modeShareCar: 24.8, modeSharePT: 64.8, modeShareActive: 10.6, averageCommuteTime: 34, ptPatronagePerCapita: 2.5 },
  { year: 2026, lgaName: 'Sydney', modeShareCar: 24.3, modeSharePT: 65.2, modeShareActive: 10.8, averageCommuteTime: 35, ptPatronagePerCapita: 2.6 },

  // Parramatta (major growth centre)
  { year: 2019, lgaName: 'Parramatta', modeShareCar: 52.1, modeSharePT: 32.4, modeShareActive: 4.2, averageCommuteTime: 38, ptPatronagePerCapita: 0.8 },
  { year: 2020, lgaName: 'Parramatta', modeShareCar: 56.3, modeSharePT: 28.1, modeShareActive: 4.8, averageCommuteTime: 35, ptPatronagePerCapita: 0.6 },
  { year: 2021, lgaName: 'Parramatta', modeShareCar: 54.2, modeSharePT: 31.2, modeShareActive: 5.1, averageCommuteTime: 37, ptPatronagePerCapita: 0.7 },
  { year: 2022, lgaName: 'Parramatta', modeShareCar: 51.8, modeSharePT: 34.1, modeShareActive: 5.4, averageCommuteTime: 39, ptPatronagePerCapita: 0.8 },
  { year: 2023, lgaName: 'Parramatta', modeShareCar: 49.6, modeSharePT: 36.8, modeShareActive: 5.8, averageCommuteTime: 40, ptPatronagePerCapita: 0.9 },
  { year: 2024, lgaName: 'Parramatta', modeShareCar: 47.9, modeSharePT: 38.7, modeShareActive: 6.2, averageCommuteTime: 41, ptPatronagePerCapita: 1.0 },
  { year: 2025, lgaName: 'Parramatta', modeShareCar: 46.5, modeSharePT: 40.2, modeShareActive: 6.5, averageCommuteTime: 42, ptPatronagePerCapita: 1.1 },
  { year: 2026, lgaName: 'Parramatta', modeShareCar: 45.3, modeSharePT: 41.8, modeShareActive: 6.8, averageCommuteTime: 43, ptPatronagePerCapita: 1.2 },

  // Newcastle
  { year: 2019, lgaName: 'Newcastle', modeShareCar: 58.4, modeSharePT: 28.1, modeShareActive: 5.3, averageCommuteTime: 28, ptPatronagePerCapita: 0.5 },
  { year: 2020, lgaName: 'Newcastle', modeShareCar: 61.2, modeSharePT: 24.6, modeShareActive: 5.8, averageCommuteTime: 26, ptPatronagePerCapita: 0.4 },
  { year: 2021, lgaName: 'Newcastle', modeShareCar: 59.8, modeSharePT: 26.8, modeShareActive: 6.1, averageCommuteTime: 27, ptPatronagePerCapita: 0.45 },
  { year: 2022, lgaName: 'Newcastle', modeShareCar: 58.1, modeSharePT: 28.9, modeShareActive: 6.4, averageCommuteTime: 28, ptPatronagePerCapita: 0.5 },
  { year: 2023, lgaName: 'Newcastle', modeShareCar: 56.4, modeSharePT: 31.2, modeShareActive: 6.7, averageCommuteTime: 29, ptPatronagePerCapita: 0.55 },
  { year: 2024, lgaName: 'Newcastle', modeShareCar: 54.8, modeSharePT: 33.1, modeShareActive: 7.0, averageCommuteTime: 30, ptPatronagePerCapita: 0.6 },
  { year: 2025, lgaName: 'Newcastle', modeShareCar: 53.3, modeSharePT: 34.8, modeShareActive: 7.3, averageCommuteTime: 31, ptPatronagePerCapita: 0.65 },
  { year: 2026, lgaName: 'Newcastle', modeShareCar: 51.9, modeSharePT: 36.4, modeShareActive: 7.6, averageCommuteTime: 32, ptPatronagePerCapita: 0.7 },

  // Wollongong
  { year: 2019, lgaName: 'Wollongong', modeShareCar: 64.2, modeSharePT: 22.3, modeShareActive: 4.1, averageCommuteTime: 25, ptPatronagePerCapita: 0.3 },
  { year: 2020, lgaName: 'Wollongong', modeShareCar: 67.1, modeSharePT: 19.4, modeShareActive: 4.6, averageCommuteTime: 23, ptPatronagePerCapita: 0.2 },
  { year: 2021, lgaName: 'Wollongong', modeShareCar: 65.8, modeSharePT: 21.3, modeShareActive: 4.8, averageCommuteTime: 24, ptPatronagePerCapita: 0.25 },
  { year: 2022, lgaName: 'Wollongong', modeShareCar: 64.3, modeSharePT: 23.1, modeShareActive: 5.1, averageCommuteTime: 25, ptPatronagePerCapita: 0.3 },
  { year: 2023, lgaName: 'Wollongong', modeShareCar: 62.6, modeSharePT: 25.2, modeShareActive: 5.4, averageCommuteTime: 26, ptPatronagePerCapita: 0.35 },
  { year: 2024, lgaName: 'Wollongong', modeShareCar: 61.2, modeSharePT: 26.9, modeShareActive: 5.7, averageCommuteTime: 27, ptPatronagePerCapita: 0.4 },
  { year: 2025, lgaName: 'Wollongong', modeShareCar: 59.8, modeSharePT: 28.4, modeShareActive: 6.0, averageCommuteTime: 28, ptPatronagePerCapita: 0.45 },
  { year: 2026, lgaName: 'Wollongong', modeShareCar: 58.5, modeSharePT: 29.8, modeShareActive: 6.3, averageCommuteTime: 29, ptPatronagePerCapita: 0.5 },

  // Albury (regional)
  { year: 2019, lgaName: 'Albury', modeShareCar: 71.3, modeSharePT: 12.4, modeShareActive: 3.2, averageCommuteTime: 20, ptPatronagePerCapita: 0.1 },
  { year: 2020, lgaName: 'Albury', modeShareCar: 73.6, modeSharePT: 10.8, modeShareActive: 3.8, averageCommuteTime: 19, ptPatronagePerCapita: 0.08 },
  { year: 2021, lgaName: 'Albury', modeShareCar: 72.4, modeSharePT: 11.9, modeShareActive: 4.0, averageCommuteTime: 20, ptPatronagePerCapita: 0.09 },
  { year: 2022, lgaName: 'Albury', modeShareCar: 71.1, modeSharePT: 13.2, modeShareActive: 4.2, averageCommuteTime: 21, ptPatronagePerCapita: 0.1 },
  { year: 2023, lgaName: 'Albury', modeShareCar: 69.8, modeSharePT: 14.6, modeShareActive: 4.4, averageCommuteTime: 22, ptPatronagePerCapita: 0.12 },
  { year: 2024, lgaName: 'Albury', modeShareCar: 68.6, modeSharePT: 15.8, modeShareActive: 4.6, averageCommuteTime: 23, ptPatronagePerCapita: 0.15 },
  { year: 2025, lgaName: 'Albury', modeShareCar: 67.4, modeSharePT: 17.1, modeShareActive: 4.8, averageCommuteTime: 24, ptPatronagePerCapita: 0.18 },
  { year: 2026, lgaName: 'Albury', modeShareCar: 66.3, modeSharePT: 18.3, modeShareActive: 5.0, averageCommuteTime: 25, ptPatronagePerCapita: 0.2 },
];

export const TRANSPORT_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
export const TRANSPORT_LGAS = ['Sydney', 'Parramatta', 'Newcastle', 'Wollongong', 'Albury'];

// Mapping from dashboard area IDs/names to transport LGA names
const AREA_TO_TRANSPORT_LGA: Record<string, string> = {
  lga_sydney: 'Sydney',
  'city of sydney': 'Sydney',
  sydney: 'Sydney',
  lga_parramatta: 'Parramatta',
  'city of parramatta': 'Parramatta',
  parramatta: 'Parramatta',
  lga_newcastle: 'Newcastle',
  newcastle: 'Newcastle',
  lga_wollongong: 'Wollongong',
  'city of wollongong': 'Wollongong',
  wollongong: 'Wollongong',
  lga_albury: 'Albury',
  albury: 'Albury',
};

export function resolveTransportLGA(areaIdOrName: string): string | undefined {
  const key = areaIdOrName.toLowerCase().trim();
  
  // Try direct mapping first
  if (AREA_TO_TRANSPORT_LGA[key]) {
    return AREA_TO_TRANSPORT_LGA[key];
  }
  
  // Try to find by exact LGA name match
  const exactMatch = TRANSPORT_LGAS.find(
    lga => lga.toLowerCase() === key
  );
  if (exactMatch) return exactMatch;
  
  // Try to find by prefix match
  const prefixMatch = TRANSPORT_LGAS.find(
    lga => key.includes(lga.toLowerCase()) || lga.toLowerCase().includes(key)
  );
  return prefixMatch;
}

export function getTransportMetrics(lgaName: string, year: number): TransportMetrics | undefined {
  return tfnsw_transport_data.find(m => m.lgaName === lgaName && m.year === year);
}

export function getTransportMetricsForLGA(lgaName: string): TransportMetrics[] {
  return tfnsw_transport_data
    .filter(m => m.lgaName === lgaName)
    .sort((a, b) => a.year - b.year);
}

export function getTransportMetricsForYear(year: number): TransportMetrics[] {
  return tfnsw_transport_data
    .filter(m => m.year === year)
    .sort((a, b) => a.lgaName.localeCompare(b.lgaName));
}

export function getTransportMetricsForArea(areaIdOrName: string): TransportMetrics[] {
  const lgaName = resolveTransportLGA(areaIdOrName);
  if (!lgaName) return [];
  return getTransportMetricsForLGA(lgaName);
}

export function getTransportMetricsForAreaAndYear(areaIdOrName: string, year: number): TransportMetrics | undefined {
  const lgaName = resolveTransportLGA(areaIdOrName);
  if (!lgaName) return undefined;
  return getTransportMetrics(lgaName, year);
}

/**
 * Get latest available transport metrics for an area
 */
export function getLatestTransportMetrics(areaIdOrName: string): TransportMetrics | undefined {
  const metrics = getTransportMetricsForArea(areaIdOrName);
  return metrics.length > 0 ? metrics[metrics.length - 1] : undefined;
}
