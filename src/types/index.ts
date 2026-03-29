export interface Area {
  id: string;
  name: string;
  type: 'sa2' | 'lga' | 'suburb' | 'postcode' | 'custom';
  region?: string;
  parentId?: string;
  centroidLat?: number;
  centroidLng?: number;
}

export interface CensusDataPoint {
  areaId: string;
  year: number;
  category: string;
  indicator: string;
  value: number;
}

export interface TransportDataPoint {
  areaId: string;
  date: string;
  source: string;
  indicator: string;
  value: number;
}

export interface ProjectionDataPoint {
  areaId: string;
  year: number;
  category: string;
  indicator: string;
  value: number;
  source: string;
}

export interface ChartDataItem {
  name: string;
  value: number;
  [key: string]: string | number;
}

export interface ComparisonData {
  areas: Area[];
  indicators: {
    label: string;
    category: string;
    values: Record<string, number>;
    benchmark?: number;
  }[];
}

export interface MapFeatureProperties {
  id: string;
  name: string;
  type: string;
  value?: number;
  [key: string]: string | number | undefined;
}

export interface DataFilter {
  areaId?: string;
  areaType?: Area['type'];
  year?: number;
  category?: string;
}

export interface ExportOptions {
  format: 'png' | 'svg' | 'csv' | 'excel' | 'pdf';
  title?: string;
  includeMap?: boolean;
  includeCharts?: boolean;
  includeTables?: boolean;
}

export type DataCategory =
  | 'demographics'
  | 'transport'
  | 'economy'
  | 'education'
  | 'housing'
  | 'growth';

export const DATA_CATEGORIES: { key: DataCategory; label: string; icon: string }[] = [
  { key: 'demographics', label: 'Population & Demographics', icon: 'Users' },
  { key: 'transport', label: 'Transport & Commuting', icon: 'Train' },
  { key: 'economy', label: 'Economy & Employment', icon: 'TrendingUp' },
  { key: 'education', label: 'Education', icon: 'GraduationCap' },
  { key: 'housing', label: 'Housing & Land Use', icon: 'Home' },
  { key: 'growth', label: 'Growth & Projections', icon: 'BarChart3' },
];
