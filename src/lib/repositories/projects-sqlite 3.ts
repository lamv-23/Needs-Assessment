import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import type {
  BusinessCaseDraft,
  ProjectDraftEnvelope,
  ProjectionUploadDraft,
  StrategicAlignmentDraft,
} from '@/lib/persistence/project-state';

type SupportedProjectDraftKind = 'business-case' | 'strategic-alignment' | 'projection-upload';
type StoredProjectDraftKind =
  | SupportedProjectDraftKind
  | 'businessCase'
  | 'strategicAlignment'
  | 'projectionUpload';

type ProjectDraftPayloadMap = {
  'business-case': BusinessCaseDraft;
  'strategic-alignment': StrategicAlignmentDraft;
  'projection-upload': ProjectionUploadDraft;
};

export interface ProjectUserRecord {
  userId: string;
  email: string | null;
  displayName: string;
  role: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
}

export interface SavedProjectRecord {
  projectId: string;
  ownerId: string;
  name: string;
  projectType: 'road' | null;
  areaIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SavedProjectSnapshot extends SavedProjectRecord {
  drafts: {
    businessCase: ProjectDraftEnvelope<'business-case', BusinessCaseDraft> | null;
    strategicAlignment: ProjectDraftEnvelope<'strategic-alignment', StrategicAlignmentDraft> | null;
    projectionUpload: ProjectDraftEnvelope<'projection-upload', ProjectionUploadDraft> | null;
  };
}

export interface EnsureUserAccountInput {
  userId: string;
  displayName: string;
  email?: string | null;
  role?: 'user' | 'admin';
}

export interface SaveProjectSnapshotInput {
  projectId?: string;
  ownerId: string;
  name: string;
  projectType: 'road' | null;
  areaIds: string[];
  drafts?: Partial<{
    businessCase: ProjectDraftEnvelope<'business-case', BusinessCaseDraft>;
    strategicAlignment: ProjectDraftEnvelope<'strategic-alignment', StrategicAlignmentDraft>;
    projectionUpload: ProjectDraftEnvelope<'projection-upload', ProjectionUploadDraft>;
  }>;
}

export interface ProjectsRepository {
  ensureProjectUserAccount(input: EnsureUserAccountInput): Promise<void>;
  listProjectsForOwner(ownerId: string): Promise<SavedProjectRecord[]>;
  saveProjectSnapshot(input: SaveProjectSnapshotInput): Promise<SavedProjectRecord>;
  getProjectById(projectId: string): Promise<SavedProjectRecord | null>;
  getProjectSnapshot(projectId: string): Promise<SavedProjectSnapshot | null>;
}

type ProjectRow = {
  project_id: string;
  owner_id: string;
  name: string;
  project_type: 'road' | null;
  created_at: string;
  updated_at: string;
};

function parseDraftEnvelope<TKind extends SupportedProjectDraftKind>(
  rawJson: string,
  expectedKind: TKind,
  projectId: string
): ProjectDraftEnvelope<TKind, ProjectDraftPayloadMap[TKind]> {
  const parsed = JSON.parse(rawJson) as ProjectDraftEnvelope<TKind, ProjectDraftPayloadMap[TKind]>;

  if (parsed.kind !== expectedKind) {
    throw new Error(
      `Project draft kind mismatch for ${projectId}: expected ${expectedKind}, received ${parsed.kind}`
    );
  }

  return parsed;
}

function mapProjectRow(row: ProjectRow, areaIds: string[]): SavedProjectRecord {
  return {
    projectId: row.project_id,
    ownerId: row.owner_id,
    name: row.name,
    projectType: row.project_type,
    areaIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getAreaIds(projectId: string): string[] {
  const db = getDb();
  return (
    db.prepare(
      'SELECT area_id FROM project_area_selections WHERE project_id = ? ORDER BY area_id'
    ).all(projectId) as Array<{ area_id: string }>
  ).map((row) => row.area_id);
}

export async function ensureProjectUserAccount(input: EnsureUserAccountInput): Promise<void> {
  const db = getDb();
  db.prepare(`
    INSERT INTO app_users (user_id, email, display_name, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      role = excluded.role,
      updated_at = excluded.updated_at
  `).run(
    input.userId,
    input.email ?? null,
    input.displayName,
    input.role ?? 'user'
  );
}

export async function listProjectsForOwner(ownerId: string): Promise<SavedProjectRecord[]> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT project_id, owner_id, name, project_type, created_at, updated_at
    FROM saved_projects
    WHERE owner_id = ?
    ORDER BY updated_at DESC, created_at DESC
  `).all(ownerId) as ProjectRow[];

  return rows.map((row) => mapProjectRow(row, getAreaIds(row.project_id)));
}

export async function saveProjectSnapshot(input: SaveProjectSnapshotInput): Promise<SavedProjectRecord> {
  const db = getDb();
  const projectId = input.projectId ?? randomUUID();

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO saved_projects (project_id, owner_id, name, project_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(project_id) DO UPDATE SET
        owner_id = excluded.owner_id,
        name = excluded.name,
        project_type = excluded.project_type,
        updated_at = excluded.updated_at
    `).run(projectId, input.ownerId, input.name, input.projectType);

    db.prepare('DELETE FROM project_area_selections WHERE project_id = ?').run(projectId);

    const insertArea = db.prepare(`
      INSERT INTO project_area_selections (project_id, area_id)
      VALUES (?, ?)
    `);
    for (const areaId of input.areaIds) {
      insertArea.run(projectId, areaId);
    }

    const insertDraft = db.prepare(`
      INSERT INTO project_drafts (project_id, draft_kind, version, data_json, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(project_id, draft_kind) DO UPDATE SET
        version = excluded.version,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `);

    const draftEntries = [
      ['business-case', input.drafts?.businessCase],
      ['strategic-alignment', input.drafts?.strategicAlignment],
      ['projection-upload', input.drafts?.projectionUpload],
    ] as const;

    for (const [draftKind, draft] of draftEntries) {
      if (!draft) continue;
      insertDraft.run(projectId, draftKind, draft.version, JSON.stringify(draft));
    }
  });

  transaction();

  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} could not be loaded after save`);
  }

  return project;
}

export async function getProjectById(projectId: string): Promise<SavedProjectRecord | null> {
  const db = getDb();
  const row = db.prepare(`
    SELECT project_id, owner_id, name, project_type, created_at, updated_at
    FROM saved_projects
    WHERE project_id = ?
  `).get(projectId) as ProjectRow | undefined;

  if (!row) {
    return null;
  }

  return mapProjectRow(row, getAreaIds(projectId));
}

export async function getProjectSnapshot(projectId: string): Promise<SavedProjectSnapshot | null> {
  const project = await getProjectById(projectId);
  if (!project) {
    return null;
  }

  const db = getDb();
  const draftRows = db.prepare(`
    SELECT draft_kind, data_json
    FROM project_drafts
    WHERE project_id = ?
  `).all(projectId) as Array<{ draft_kind: StoredProjectDraftKind; data_json: string }>;

  const drafts: SavedProjectSnapshot['drafts'] = {
    businessCase: null,
    strategicAlignment: null,
    projectionUpload: null,
  };

  for (const draftRow of draftRows) {
    switch (draftRow.draft_kind) {
      case 'businessCase':
      case 'business-case':
        drafts.businessCase = parseDraftEnvelope(draftRow.data_json, 'business-case', projectId);
        break;
      case 'strategicAlignment':
      case 'strategic-alignment':
        drafts.strategicAlignment = parseDraftEnvelope(
          draftRow.data_json,
          'strategic-alignment',
          projectId
        );
        break;
      case 'projectionUpload':
      case 'projection-upload':
        drafts.projectionUpload = parseDraftEnvelope(
          draftRow.data_json,
          'projection-upload',
          projectId
        );
        break;
      default:
        throw new Error(`Unsupported draft kind for project ${projectId}: ${draftRow.draft_kind}`);
    }
  }

  return {
    ...project,
    drafts,
  };
}

const sqliteProjectsRepository: ProjectsRepository = {
  ensureProjectUserAccount,
  listProjectsForOwner,
  saveProjectSnapshot,
  getProjectById,
  getProjectSnapshot,
};

export function getProjectsRepository(): ProjectsRepository {
  return sqliteProjectsRepository;
}
