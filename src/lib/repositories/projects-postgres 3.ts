import { randomUUID } from 'crypto';
import { ensurePostgresProjectsSchema, getPostgresPool } from '@/lib/postgres';
import type {
  EnsureUserAccountInput,
  ProjectsRepository,
  SaveProjectSnapshotInput,
  SavedProjectRecord,
  SavedProjectSnapshot,
} from './projects-sqlite';
import type {
  BusinessCaseDraft,
  ProjectDraftEnvelope,
  ProjectionUploadDraft,
  StrategicAlignmentDraft,
} from '@/lib/persistence/project-state';

type SupportedProjectDraftKind = 'business-case' | 'strategic-alignment' | 'projection-upload';

type ProjectDraftPayloadMap = {
  'business-case': BusinessCaseDraft;
  'strategic-alignment': StrategicAlignmentDraft;
  'projection-upload': ProjectionUploadDraft;
};

type ProjectRow = {
  project_id: string;
  owner_id: string;
  name: string;
  project_type: 'road' | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type DraftRow = {
  draft_kind: SupportedProjectDraftKind;
  data_json: ProjectDraftEnvelope<SupportedProjectDraftKind, unknown>;
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseDraftEnvelope<TKind extends SupportedProjectDraftKind>(
  rawValue: unknown,
  expectedKind: TKind,
  projectId: string
): ProjectDraftEnvelope<TKind, ProjectDraftPayloadMap[TKind]> {
  const parsed = rawValue as ProjectDraftEnvelope<TKind, ProjectDraftPayloadMap[TKind]>;

  if (!parsed || parsed.kind !== expectedKind) {
    throw new Error(
      `Project draft kind mismatch for ${projectId}: expected ${expectedKind}, received ${
        parsed && typeof parsed === 'object' && 'kind' in parsed ? String(parsed.kind) : 'unknown'
      }`
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
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function getAreaIds(projectId: string): Promise<string[]> {
  await ensurePostgresProjectsSchema();
  const pool = getPostgresPool();
  const result = await pool.query<{ area_id: string }>(
    `SELECT area_id
     FROM project_area_selections
     WHERE project_id = $1
     ORDER BY area_id`,
    [projectId]
  );

  return result.rows.map((row: { area_id: string }) => row.area_id);
}

async function ensureProjectUserAccount(input: EnsureUserAccountInput): Promise<void> {
  await ensurePostgresProjectsSchema();
  const pool = getPostgresPool();
  await pool.query(
    `INSERT INTO app_users (user_id, email, display_name, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       email = EXCLUDED.email,
       display_name = EXCLUDED.display_name,
       role = EXCLUDED.role,
       updated_at = NOW()`,
    [input.userId, input.email ?? null, input.displayName, input.role ?? 'user']
  );
}

async function listProjectsForOwner(ownerId: string): Promise<SavedProjectRecord[]> {
  await ensurePostgresProjectsSchema();
  const pool = getPostgresPool();
  const result = await pool.query<ProjectRow>(
    `SELECT project_id, owner_id, name, project_type, created_at, updated_at
     FROM saved_projects
     WHERE owner_id = $1
     ORDER BY updated_at DESC, created_at DESC`,
    [ownerId]
  );

  return Promise.all(
    result.rows.map(async (row: ProjectRow) => mapProjectRow(row, await getAreaIds(row.project_id)))
  );
}

async function saveProjectSnapshot(input: SaveProjectSnapshotInput): Promise<SavedProjectRecord> {
  await ensurePostgresProjectsSchema();
  const pool = getPostgresPool();
  const projectId = input.projectId ?? randomUUID();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO saved_projects (project_id, owner_id, name, project_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (project_id) DO UPDATE SET
         owner_id = EXCLUDED.owner_id,
         name = EXCLUDED.name,
         project_type = EXCLUDED.project_type,
         updated_at = NOW()`,
      [projectId, input.ownerId, input.name, input.projectType]
    );

    await client.query('DELETE FROM project_area_selections WHERE project_id = $1', [projectId]);
    for (const areaId of input.areaIds) {
      await client.query(
        `INSERT INTO project_area_selections (project_id, area_id)
         VALUES ($1, $2)
         ON CONFLICT (project_id, area_id) DO NOTHING`,
        [projectId, areaId]
      );
    }

    const draftEntries = [
      ['business-case', input.drafts?.businessCase],
      ['strategic-alignment', input.drafts?.strategicAlignment],
      ['projection-upload', input.drafts?.projectionUpload],
    ] as const;

    for (const [draftKind, draft] of draftEntries) {
      if (!draft) continue;
      await client.query(
        `INSERT INTO project_drafts (project_id, draft_kind, version, data_json, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, NOW())
         ON CONFLICT (project_id, draft_kind) DO UPDATE SET
           version = EXCLUDED.version,
           data_json = EXCLUDED.data_json,
           updated_at = NOW()`,
        [projectId, draftKind, draft.version, JSON.stringify(draft)]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} could not be loaded after save`);
  }

  return project;
}

async function getProjectById(projectId: string): Promise<SavedProjectRecord | null> {
  await ensurePostgresProjectsSchema();
  const pool = getPostgresPool();
  const result = await pool.query<ProjectRow>(
    `SELECT project_id, owner_id, name, project_type, created_at, updated_at
     FROM saved_projects
     WHERE project_id = $1`,
    [projectId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return mapProjectRow(row, await getAreaIds(projectId));
}

async function getProjectSnapshot(projectId: string): Promise<SavedProjectSnapshot | null> {
  const project = await getProjectById(projectId);
  if (!project) {
    return null;
  }

  await ensurePostgresProjectsSchema();
  const pool = getPostgresPool();
  const result = await pool.query<DraftRow>(
    `SELECT draft_kind, data_json
     FROM project_drafts
     WHERE project_id = $1`,
    [projectId]
  );

  const drafts: SavedProjectSnapshot['drafts'] = {
    businessCase: null,
    strategicAlignment: null,
    projectionUpload: null,
  };

  for (const row of result.rows) {
    switch (row.draft_kind) {
      case 'business-case':
        drafts.businessCase = parseDraftEnvelope(row.data_json, 'business-case', projectId);
        break;
      case 'strategic-alignment':
        drafts.strategicAlignment = parseDraftEnvelope(
          row.data_json,
          'strategic-alignment',
          projectId
        );
        break;
      case 'projection-upload':
        drafts.projectionUpload = parseDraftEnvelope(
          row.data_json,
          'projection-upload',
          projectId
        );
        break;
    }
  }

  return {
    ...project,
    drafts,
  };
}

const postgresProjectsRepository: ProjectsRepository = {
  ensureProjectUserAccount,
  listProjectsForOwner,
  saveProjectSnapshot,
  getProjectById,
  getProjectSnapshot,
};

export function getProjectsRepository(): ProjectsRepository {
  return postgresProjectsRepository;
}
