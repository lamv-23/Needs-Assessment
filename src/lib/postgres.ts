import { Pool } from 'pg';

let postgresPool: Pool | null = null;
let appSchemaReady: Promise<void> | null = null;

function getSslConfig() {
  const sslMode = process.env.POSTGRES_SSL?.trim();
  if (!sslMode || sslMode === 'false') {
    return undefined;
  }

  return {
    rejectUnauthorized: sslMode !== 'allow-self-signed',
  };
}

export function getPostgresPool(): Pool {
  if (postgresPool) {
    return postgresPool;
  }

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required when a Postgres repository driver is enabled.');
  }

  postgresPool = new Pool({
    connectionString,
    ssl: getSslConfig(),
  });

  return postgresPool;
}

export async function ensurePostgresAppSchema(): Promise<void> {
  if (appSchemaReady) {
    return appSchemaReady;
  }

  appSchemaReady = (async () => {
    const pool = getPostgresPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS abs_cache (
        id BIGSERIAL PRIMARY KEY,
        lga_code TEXT NOT NULL,
        dataset TEXT NOT NULL,
        data_json JSONB NOT NULL,
        census_year INTEGER NOT NULL,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (lga_code, dataset)
      );

      CREATE TABLE IF NOT EXISTS tfnsw_cache (
        id BIGSERIAL PRIMARY KEY,
        lga_code TEXT NOT NULL,
        dataset TEXT NOT NULL,
        data_json JSONB NOT NULL,
        data_year INTEGER NOT NULL,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (lga_code, dataset)
      );

      CREATE TABLE IF NOT EXISTS nsw_projections (
        id BIGSERIAL PRIMARY KEY,
        lga_name TEXT NOT NULL,
        projection_type TEXT NOT NULL,
        data_json JSONB NOT NULL,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (lga_name, projection_type)
      );

      CREATE TABLE IF NOT EXISTS transport_static (
        id BIGSERIAL PRIMARY KEY,
        lga_name TEXT NOT NULL,
        year INTEGER NOT NULL,
        data_json JSONB NOT NULL,
        seeded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (lga_name, year)
      );

      CREATE TABLE IF NOT EXISTS refresh_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS refresh_log (
        id BIGSERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        lgas_updated INTEGER DEFAULT 0,
        error_message TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS refresh_jobs (
        id BIGSERIAL PRIMARY KEY,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        requested_by TEXT NOT NULL,
        lga_id TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        lock_token TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS app_users (
        user_id TEXT PRIMARY KEY,
        email TEXT,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS saved_projects (
        project_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        project_type TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS project_area_selections (
        project_id TEXT NOT NULL REFERENCES saved_projects(project_id) ON DELETE CASCADE,
        area_id TEXT NOT NULL,
        PRIMARY KEY (project_id, area_id)
      );

      CREATE TABLE IF NOT EXISTS project_drafts (
        project_id TEXT NOT NULL REFERENCES saved_projects(project_id) ON DELETE CASCADE,
        draft_kind TEXT NOT NULL,
        version INTEGER NOT NULL,
        data_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (project_id, draft_kind)
      );

      CREATE TABLE IF NOT EXISTS gtfs_stops (
        stop_id TEXT PRIMARY KEY,
        stop_name TEXT NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        mode TEXT NOT NULL,
        feed TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_abs_lga ON abs_cache(lga_code);
      CREATE INDEX IF NOT EXISTS idx_tfnsw_lga ON tfnsw_cache(lga_code);
      CREATE INDEX IF NOT EXISTS idx_projections_lga ON nsw_projections(lga_name);
      CREATE INDEX IF NOT EXISTS idx_transport_static_lga ON transport_static(lga_name);
      CREATE INDEX IF NOT EXISTS idx_refresh_log_started ON refresh_log(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_refresh_jobs_status_created ON refresh_jobs(status, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_projects_owner ON saved_projects(owner_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_project_drafts_project ON project_drafts(project_id);
      CREATE INDEX IF NOT EXISTS idx_gtfs_stops_lat ON gtfs_stops(lat);
      CREATE INDEX IF NOT EXISTS idx_gtfs_stops_lng ON gtfs_stops(lng);
      CREATE INDEX IF NOT EXISTS idx_gtfs_stops_mode ON gtfs_stops(mode);
    `);

    await pool.query(`
      INSERT INTO refresh_config (key, value, updated_at)
      VALUES
        ('abs_refresh_interval_days', '7', NOW()),
        ('tfnsw_refresh_interval_days', '7', NOW()),
        ('auto_refresh_enabled', 'false', NOW()),
        ('abs_last_refresh', '', NOW()),
        ('tfnsw_last_refresh', '', NOW()),
       ('static_last_seed', '', NOW())
      ON CONFLICT (key) DO NOTHING
    `);

    await pool.query(`
      ALTER TABLE refresh_jobs ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE refresh_jobs ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3;
    `);
  })();

  return appSchemaReady;
}

export async function ensurePostgresProjectsSchema(): Promise<void> {
  return ensurePostgresAppSchema();
}
