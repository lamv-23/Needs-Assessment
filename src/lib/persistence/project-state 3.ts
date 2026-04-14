import type { PriorityCode } from '@/lib/data/strategy-data';
import type { PopulationProjection, ProjectionDataSet } from '@/lib/excel-parser';

export const BUSINESS_CASE_THEME_KEYS = [
  'growth',
  'congestion',
  'car-dependency',
  'economy',
  'freight',
] as const;

export type ThemeSelectionKey = (typeof BUSINESS_CASE_THEME_KEYS)[number];

export const BUSINESS_CASE_SECTION_IDS = [
  'scene',
  'growth',
  'car-dependency',
  'congestion',
  'economy',
  'strategic-alignment',
  'gap',
  'evidence',
] as const;

export type BusinessCaseSectionId = (typeof BUSINESS_CASE_SECTION_IDS)[number];

export interface BusinessCaseDraft {
  projectName: string;
  projectType: 'road' | null;
  areaIds: string[];
  themes: ThemeSelectionKey[];
  sectionToggles: Record<BusinessCaseSectionId, boolean>;
}

export function createDefaultBusinessCaseDraft(): BusinessCaseDraft {
  return {
    projectName: '',
    projectType: null,
    areaIds: [],
    themes: [...BUSINESS_CASE_THEME_KEYS],
    sectionToggles: {
      scene: true,
      growth: true,
      'car-dependency': true,
      congestion: true,
      economy: true,
      'strategic-alignment': true,
      gap: true,
      evidence: true,
    },
  };
}

export interface StrategicAlignmentDraft {
  selectedStrategyIds: string[];
  strategyNotes: Record<string, string>;
  selectedPriorities: PriorityCode[];
  priorityNotes: Partial<Record<PriorityCode, string>>;
}

export function createDefaultStrategicAlignmentDraft(): StrategicAlignmentDraft {
  return {
    selectedStrategyIds: [],
    strategyNotes: {},
    selectedPriorities: [],
    priorityNotes: {},
  };
}

export interface ProjectionUploadDraft {
  populationProjections: PopulationProjection[];
  projectionMetadata: ProjectionDataSet | null;
}

export function createDefaultProjectionUploadDraft(): ProjectionUploadDraft {
  return {
    populationProjections: [],
    projectionMetadata: null,
  };
}

export const PROJECT_DRAFT_SCHEMA_VERSION = 1 as const;

export type ProjectDraftKind =
  | 'business-case'
  | 'strategic-alignment'
  | 'projection-upload';

export interface ProjectDraftEnvelope<TKind extends ProjectDraftKind, TPayload> {
  version: typeof PROJECT_DRAFT_SCHEMA_VERSION;
  kind: TKind;
  updatedAt: string | null;
  payload: TPayload;
}

export function createProjectDraftEnvelope<TKind extends ProjectDraftKind, TPayload>(
  kind: TKind,
  payload: TPayload,
  updatedAt: string | null = null
): ProjectDraftEnvelope<TKind, TPayload> {
  return {
    version: PROJECT_DRAFT_SCHEMA_VERSION,
    kind,
    updatedAt,
    payload,
  };
}
