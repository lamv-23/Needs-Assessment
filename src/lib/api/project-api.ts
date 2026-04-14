import { LGA_CODE_MAP } from '@/lib/abs-fetchers';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import {
  createDefaultBusinessCaseDraft,
  createDefaultProjectionUploadDraft,
  createDefaultStrategicAlignmentDraft,
  type BusinessCaseDraft,
  type ProjectionUploadDraft,
  type StrategicAlignmentDraft,
} from '@/lib/persistence/project-state';

const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const MAX_PROJECT_NAME_LENGTH = 120;
const MAX_PROJECT_AREAS = 10;
const VALID_AREA_IDS = new Set([
  ...SAMPLE_AREAS.map((area) => area.id),
  ...Object.keys(LGA_CODE_MAP),
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ParsedProjectSaveRequest {
  projectId?: string;
  name: string;
  projectType: 'road' | null;
  areaIds: string[];
  businessCaseDraft: BusinessCaseDraft;
  strategicAlignmentDraft: StrategicAlignmentDraft;
  projectionUploadDraft: ProjectionUploadDraft;
}

export function parseProjectId(value: unknown): string | undefined | null {
  if (value == null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || !PROJECT_ID_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function parseProjectIdParam(value: string): string | null {
  return parseProjectId(value) ?? null;
}

function parseProjectName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_PROJECT_NAME_LENGTH) {
    return null;
  }

  return trimmed;
}

function parseProjectType(value: unknown): 'road' | null | undefined {
  if (value == null) {
    return null;
  }

  return value === 'road' ? 'road' : undefined;
}

function parseAreaIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== 'string') {
      return null;
    }

    const trimmed = entry.trim();
    if (!trimmed || !VALID_AREA_IDS.has(trimmed)) {
      return null;
    }

    deduped.add(trimmed);
  }

  if (deduped.size > MAX_PROJECT_AREAS) {
    return null;
  }

  return Array.from(deduped);
}

function parseDraftPayload<T>(value: unknown, fallback: () => T): T | null {
  if (value == null) {
    return fallback();
  }

  if (!isRecord(value)) {
    return null;
  }

  return value as T;
}

export function parseProjectSaveRequest(body: unknown): ParsedProjectSaveRequest | null {
  if (!isRecord(body)) {
    return null;
  }

  const name = parseProjectName(body.name);
  const projectId = parseProjectId(body.projectId);
  const projectType = parseProjectType(body.projectType);
  const areaIds = parseAreaIds(body.areaIds);
  const businessCaseDraft = parseDraftPayload<BusinessCaseDraft>(
    body.businessCaseDraft,
    createDefaultBusinessCaseDraft
  );
  const strategicAlignmentDraft = parseDraftPayload<StrategicAlignmentDraft>(
    body.strategicAlignmentDraft,
    createDefaultStrategicAlignmentDraft
  );
  const projectionUploadDraft = parseDraftPayload<ProjectionUploadDraft>(
    body.projectionUploadDraft,
    createDefaultProjectionUploadDraft
  );

  if (
    !name
    || projectId === null
    || projectType === undefined
    || areaIds === null
    || businessCaseDraft === null
    || strategicAlignmentDraft === null
    || projectionUploadDraft === null
  ) {
    return null;
  }

  return {
    projectId,
    name,
    projectType,
    areaIds,
    businessCaseDraft,
    strategicAlignmentDraft,
    projectionUploadDraft,
  };
}

export function canWriteProject(
  existingOwnerId: string | null,
  actingUserId: string
): boolean {
  return existingOwnerId === null || existingOwnerId === actingUserId;
}
