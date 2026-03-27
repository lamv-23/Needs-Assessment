/**
 * NSW Population and Employment Projection Types
 */

export interface NSWPopulationProjection {
  lgaId: string;
  lgaName: string;
  year: number;
  totalPopulation: number;
  malePopulation?: number;
  femalePopulation?: number;
  ageGroups?: Record<string, number>; // e.g., "0-4": 1000
}

export interface NSWEmploymentProjection {
  lgaId: string;
  lgaName: string;
  year: number;
  employmentLevel: number;
  unemploymentRate: number;
  participationRate: number;
  byIndustry?: Record<string, number>; // e.g., "Construction": 5000
}

export interface ProjectionImportResult {
  success: boolean;
  rowsProcessed: number;
  rowsSkipped: number;
  errors: string[];
  timestamp: Date;
  fileType: 'population' | 'employment';
  message?: string;
}

export interface ProjectionMetadata {
  fileType: 'population' | 'employment';
  uploadedAt: Date;
  source: string; // e.g., "NSW Planning 2024"
  yearsIncluded: [number, number]; // [startYear, endYear]
  lgaCount: number;
}
