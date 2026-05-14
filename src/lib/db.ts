/**
 * SQLite database wrapper for periodic data caching.
 * Uses WAL journal mode for concurrent multi-user reads.
 * Database file: data/cache.db (created on first use)
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

function canWriteToPath(targetPath: string): boolean {
  try {
    fs.accessSync(targetPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function findExistingDbPath(): string | null {
  const explicitPath = process.env.CACHE_DB_PATH?.trim();
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }

  const roots = [
    process.cwd(),
    __dirname,
    typeof require !== 'undefined' && require.main?.filename ? path.dirname(require.main.filename) : null,
  ].filter(Boolean) as string[];

  for (const root of roots) {
    let current = path.resolve(root);
    const { root: filesystemRoot } = path.parse(current);

    while (true) {
      const candidate = path.join(current, 'data', 'cache.db');
      if (fs.existsSync(candidate)) {
        return candidate;
      }

      if (current === filesystemRoot) break;
      current = path.dirname(current);
    }
  }

  return null;
}

function getDbPath(): string {
  const existingPath = findExistingDbPath();
  if (existingPath) {
    return existingPath;
  }

  const dataDir = path.join(process.cwd(), 'data');
  const dbPath = path.join(dataDir, 'cache.db');
  if (fs.existsSync(dbPath)) {
    return dbPath;
  }

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return dbPath;
}

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  const dataDir = path.dirname(dbPath);
  const dbExists = fs.existsSync(dbPath);
  const useReadonly = dbExists && (!canWriteToPath(dataDir) || process.env.VERCEL === '1');

  db = useReadonly
    ? new Database(dbPath, { readonly: true, fileMustExist: true })
    : new Database(dbPath);

  if (!useReadonly) {
    // WAL mode: allows concurrent readers + one writer
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');

    initSchema(db);
    cleanupZombieRefreshLogs(db);
  }
  return db;
}

function cleanupZombieRefreshLogs(database: Database.Database): void {
  database.exec(`
    UPDATE refresh_log
    SET status = 'error',
        completed_at = datetime('now'),
        error_message = 'Abandoned: process interrupted without completion'
    WHERE status = 'running' AND completed_at IS NULL
  `);
}

function initSchema(database: Database.Database): void {
  database.exec(`
    -- ABS Census / labour market data per LGA
    CREATE TABLE IF NOT EXISTS abs_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lga_code TEXT NOT NULL,
      dataset TEXT NOT NULL,
      data_json TEXT NOT NULL,
      census_year INTEGER NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(lga_code, dataset)
    );

    -- TfNSW transport metrics per LGA
    CREATE TABLE IF NOT EXISTS tfnsw_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lga_code TEXT NOT NULL,
      dataset TEXT NOT NULL,
      data_json TEXT NOT NULL,
      data_year INTEGER NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(lga_code, dataset)
    );

    -- NSW DPE population projections + TZP24 employment projections
    CREATE TABLE IF NOT EXISTS nsw_projections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lga_name TEXT NOT NULL,
      projection_type TEXT NOT NULL,
      data_json TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(lga_name, projection_type)
    );

    -- TfNSW bundled transport data (mode share, commute times)
    CREATE TABLE IF NOT EXISTS transport_static (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lga_name TEXT NOT NULL,
      year INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      seeded_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(lga_name, year)
    );

    -- Admin-adjustable settings (key-value)
    CREATE TABLE IF NOT EXISTS refresh_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Refresh operation history
    CREATE TABLE IF NOT EXISTS refresh_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      lgas_updated INTEGER DEFAULT 0,
      error_message TEXT,
      change_summary TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS refresh_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      requested_by TEXT NOT NULL,
      lga_id TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      lock_token TEXT,
      started_at TEXT,
      completed_at TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Server-backed user and project persistence foundation
    CREATE TABLE IF NOT EXISTS app_users (
      user_id TEXT PRIMARY KEY,
      email TEXT,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS saved_projects (
      project_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      project_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES app_users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_area_selections (
      project_id TEXT NOT NULL,
      area_id TEXT NOT NULL,
      PRIMARY KEY (project_id, area_id),
      FOREIGN KEY (project_id) REFERENCES saved_projects(project_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_drafts (
      project_id TEXT NOT NULL,
      draft_kind TEXT NOT NULL,
      version INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, draft_kind),
      FOREIGN KEY (project_id) REFERENCES saved_projects(project_id) ON DELETE CASCADE
    );

    -- Individual PT stops from GTFS for point-based catchment queries
    CREATE TABLE IF NOT EXISTS gtfs_stops (
      stop_id   TEXT PRIMARY KEY,
      stop_name TEXT NOT NULL,
      lat       REAL NOT NULL,
      lng       REAL NOT NULL,
      mode      TEXT NOT NULL,
      feed      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gtfs_stops_lat ON gtfs_stops(lat);
    CREATE INDEX IF NOT EXISTS idx_gtfs_stops_lng ON gtfs_stops(lng);
    CREATE INDEX IF NOT EXISTS idx_gtfs_stops_mode ON gtfs_stops(mode);

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_abs_lga ON abs_cache(lga_code);
    CREATE INDEX IF NOT EXISTS idx_tfnsw_lga ON tfnsw_cache(lga_code);
    CREATE INDEX IF NOT EXISTS idx_projections_lga ON nsw_projections(lga_name);
    CREATE INDEX IF NOT EXISTS idx_transport_static_lga ON transport_static(lga_name);
    CREATE INDEX IF NOT EXISTS idx_refresh_log_started ON refresh_log(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_refresh_jobs_status_created ON refresh_jobs(status, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_projects_owner ON saved_projects(owner_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_project_drafts_project ON project_drafts(project_id);

    -- Scheduled commute times (TfNSW Trip Planner + OpenRouteService)
    CREATE TABLE IF NOT EXISTS commute_times (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      lga_code        TEXT NOT NULL,
      destination     TEXT NOT NULL,
      mode            TEXT NOT NULL,
      duration_minutes REAL,
      distance_km     REAL,
      fetched_date    TEXT NOT NULL,
      UNIQUE(lga_code, destination, mode, fetched_date)
    );

    -- PT on-time performance from GTFS-RT
    CREATE TABLE IF NOT EXISTS gtfs_reliability (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      lga_code     TEXT NOT NULL,
      mode         TEXT NOT NULL,
      hour_of_day  INTEGER NOT NULL,
      week_start   TEXT NOT NULL,
      pct_on_time  REAL,
      trip_count   INTEGER,
      UNIQUE(lga_code, mode, hour_of_day, week_start)
    );

    -- NSW Spatial Services cycling/walking infrastructure
    CREATE TABLE IF NOT EXISTS nsw_infrastructure (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      lga_code        TEXT NOT NULL,
      feature_type    TEXT NOT NULL,
      total_length_km REAL,
      fetched_at      TEXT DEFAULT (datetime('now')),
      UNIQUE(lga_code, feature_type)
    );

    -- Default config values (only insert if not already present)
    INSERT OR IGNORE INTO refresh_config (key, value) VALUES
      ('abs_refresh_interval_days', '7'),
      ('tfnsw_refresh_interval_days', '7'),
      ('auto_refresh_enabled', 'false'),
      ('abs_last_refresh', ''),
      ('tfnsw_last_refresh', ''),
      ('static_last_seed', ''),
      ('data_snapshot_tag', '');

    -- Data snapshots for versioning and citation
    CREATE TABLE IF NOT EXISTS data_snapshots (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tag             TEXT NOT NULL UNIQUE,
      description     TEXT,
      abs_last_refresh TEXT,
      static_last_seed TEXT,
      tfnsw_last_refresh TEXT,
      abs_cache_count INTEGER,
      projection_count INTEGER,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Refresh change log: per-refresh diff summary
    CREATE TABLE IF NOT EXISTS refresh_changes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      refresh_log_id  INTEGER REFERENCES refresh_log(id),
      lga_code        TEXT,
      dataset         TEXT,
      field_name      TEXT,
      old_value       TEXT,
      new_value       TEXT,
      change_type     TEXT NOT NULL DEFAULT 'update'
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_changes_log ON refresh_changes(refresh_log_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_changes_lga ON refresh_changes(lga_code);
  `);

  const refreshJobColumns = database
    .prepare(`PRAGMA table_info(refresh_jobs)`)
    .all() as Array<{ name: string }>;
  const refreshJobColumnNames = new Set(refreshJobColumns.map((column) => column.name));

  if (!refreshJobColumnNames.has('attempt_count')) {
    database.exec(`
      ALTER TABLE refresh_jobs
      ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0
    `);
  }

  if (!refreshJobColumnNames.has('max_attempts')) {
    database.exec(`
      ALTER TABLE refresh_jobs
      ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3
    `);
  }

  const refreshLogColumns = database
    .prepare(`PRAGMA table_info(refresh_log)`)
    .all() as Array<{ name: string }>;
  const refreshLogColumnNames = new Set(refreshLogColumns.map((column) => column.name));

  if (!refreshLogColumnNames.has('change_summary')) {
    database.exec(`
      ALTER TABLE refresh_log
      ADD COLUMN change_summary TEXT
    `);
  }
}

// ─── ABS Cache ─────────────────────────────────────────────────────────────────

export interface ABSCacheRow {
  id: number;
  lga_code: string;
  dataset: string;
  data_json: string;
  census_year: number;
  fetched_at: string;
}

export function getABSCacheEntry(lgaCode: string, dataset: string): ABSCacheRow | undefined {
  const db = getDb();
  return db
    .prepare('SELECT * FROM abs_cache WHERE lga_code = ? AND dataset = ?')
    .get(lgaCode, dataset) as ABSCacheRow | undefined;
}

export function getAllABSForLGA(lgaCode: string): ABSCacheRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM abs_cache WHERE lga_code = ?')
    .all(lgaCode) as ABSCacheRow[];
}

export function upsertABSCache(
  lgaCode: string,
  dataset: string,
  data: unknown,
  censusYear: number
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO abs_cache (lga_code, dataset, data_json, census_year, fetched_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(lga_code, dataset) DO UPDATE SET
      data_json = excluded.data_json,
      census_year = excluded.census_year,
      fetched_at = excluded.fetched_at
  `).run(lgaCode, dataset, JSON.stringify(data), censusYear);
}

export function getABSLastRefreshDate(): string {
  return getConfigValue('abs_last_refresh') || '';
}

export function getABSCacheCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(DISTINCT lga_code) as count FROM abs_cache').get() as { count: number };
  return row.count;
}

// ─── TfNSW Cache ────────────────────────────────────────────────────────────────

export function upsertTfNSWCache(
  lgaCode: string,
  dataset: string,
  data: unknown,
  dataYear: number
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO tfnsw_cache (lga_code, dataset, data_json, data_year, fetched_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(lga_code, dataset) DO UPDATE SET
      data_json = excluded.data_json,
      data_year = excluded.data_year,
      fetched_at = excluded.fetched_at
  `).run(lgaCode, dataset, JSON.stringify(data), dataYear);
}

export function getTfNSWCacheEntry(lgaCode: string, dataset: string) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM tfnsw_cache WHERE lga_code = ? AND dataset = ?')
    .get(lgaCode, dataset) as { data_json: string; fetched_at: string; data_year: number } | undefined;
}

// ─── NSW Projections ──────────────────────────────────────────────────────────

export function upsertNSWProjection(
  lgaName: string,
  projectionType: string,
  data: unknown
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO nsw_projections (lga_name, projection_type, data_json, uploaded_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(lga_name, projection_type) DO UPDATE SET
      data_json = excluded.data_json,
      uploaded_at = excluded.uploaded_at
  `).run(lgaName, projectionType, JSON.stringify(data));
}

export function getNSWProjection(lgaName: string, projectionType: string): unknown | null {
  const db = getDb();
  const row = db
    .prepare('SELECT data_json FROM nsw_projections WHERE lga_name = ? AND projection_type = ?')
    .get(lgaName, projectionType) as { data_json: string } | undefined;
  return row ? JSON.parse(row.data_json) : null;
}

export function getNSWProjectionCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM nsw_projections').get() as { count: number };
  return row.count;
}

// ─── Transport Static ─────────────────────────────────────────────────────────

export function upsertTransportStatic(lgaName: string, year: number, data: unknown): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO transport_static (lga_name, year, data_json, seeded_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(lga_name, year) DO UPDATE SET
      data_json = excluded.data_json,
      seeded_at = excluded.seeded_at
  `).run(lgaName, year, JSON.stringify(data));
}

export function getTransportStaticEntry(lgaName: string, year: number) {
  const db = getDb();
  return db
    .prepare('SELECT data_json FROM transport_static WHERE lga_name = ? AND year = ?')
    .get(lgaName, year) as { data_json: string } | undefined;
}

export function getTransportStaticForLGA(lgaName: string) {
  const db = getDb();
  return (db
    .prepare('SELECT year, data_json FROM transport_static WHERE lga_name = ? ORDER BY year')
    .all(lgaName) as { year: number; data_json: string }[])
    .map(r => ({ year: r.year, ...JSON.parse(r.data_json) }));
}

// ─── Refresh Config ───────────────────────────────────────────────────────────

export function getConfigValue(key: string): string {
  const db = getDb();
  const row = db
    .prepare('SELECT value FROM refresh_config WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? '';
}

export function setConfigValue(key: string, value: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO refresh_config (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value);
}

export function getAllConfig(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM refresh_config').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ─── Refresh Log ──────────────────────────────────────────────────────────────

export interface ChangeSummary {
  before_abs_cache_count: number;
  after_abs_cache_count: number;
  before_projection_count: number;
  after_projection_count: number;
  datasets_changed: Record<string, { before: number; after: number }>;
}

export interface RefreshLogRow {
  id: number;
  source: string;
  status: string;
  lgas_updated: number;
  error_message: string | null;
  change_summary: string | null;
  started_at: string;
  completed_at: string | null;
}

export function startRefreshLog(source: string): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO refresh_log (source, status, started_at)
    VALUES (?, 'running', datetime('now'))
  `).run(source);
  return result.lastInsertRowid as number;
}

export function completeRefreshLog(
  id: number,
  status: 'success' | 'error' | 'partial',
  lgasUpdated: number,
  errorMessage?: string,
  changeSummary?: ChangeSummary
): void {
  const db = getDb();
  db.prepare(`
    UPDATE refresh_log
    SET status = ?, lgas_updated = ?, error_message = ?, change_summary = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(status, lgasUpdated, errorMessage ?? null, changeSummary ? JSON.stringify(changeSummary) : null, id);
}

export function getRecentRefreshLogs(limit = 10): RefreshLogRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM refresh_log ORDER BY started_at DESC LIMIT ?')
    .all(limit) as RefreshLogRow[];
}

export function getLastSuccessfulRefresh(source: string): RefreshLogRow | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM refresh_log
    WHERE source = ? AND status = 'success'
    ORDER BY completed_at DESC LIMIT 1
  `).get(source) as RefreshLogRow | undefined;
}

// ─── GTFS Stops ───────────────────────────────────────────────────────────────

export interface GtfsStop {
  stop_id: string;
  stop_name: string;
  lat: number;
  lng: number;
  mode: string;
  feed: string;
}

export function clearGtfsStops(): void {
  const db = getDb();
  db.prepare('DELETE FROM gtfs_stops').run();
}

export function upsertGtfsStopsBatch(stops: GtfsStop[]): void {
  if (stops.length === 0) return;
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO gtfs_stops (stop_id, stop_name, lat, lng, mode, feed)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows: GtfsStop[]) => {
    for (const s of rows) {
      insert.run(s.stop_id, s.stop_name, s.lat, s.lng, s.mode, s.feed);
    }
  });
  insertMany(stops);
}

export function queryGtfsStopsInBounds(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number
): GtfsStop[] {
  const db = getDb();
  return db.prepare(`
    SELECT stop_id, stop_name, lat, lng, mode, feed
    FROM gtfs_stops
    WHERE lat >= ? AND lat <= ? AND lng >= ? AND lng <= ?
  `).all(minLat, maxLat, minLng, maxLng) as GtfsStop[];
}

export function getGtfsStopsCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM gtfs_stops').get() as { count: number };
  return row.count;
}

// ─── Commute Times ────────────────────────────────────────────────────────────

export interface CommuteTimeRow {
  lga_code: string;
  destination: string;
  mode: string;
  duration_minutes: number | null;
  distance_km: number | null;
  fetched_date: string;
}

export function getCommuteTimesForLGA(lgaCode: string): CommuteTimeRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT lga_code, destination, mode, duration_minutes, distance_km, fetched_date
    FROM commute_times
    WHERE lga_code = ?
    ORDER BY fetched_date DESC
  `).all(lgaCode) as CommuteTimeRow[];
}

export function upsertCommuteTime(row: CommuteTimeRow): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO commute_times (lga_code, destination, mode, duration_minutes, distance_km, fetched_date)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(lga_code, destination, mode, fetched_date) DO UPDATE SET
      duration_minutes = excluded.duration_minutes,
      distance_km = excluded.distance_km
  `).run(row.lga_code, row.destination, row.mode, row.duration_minutes, row.distance_km, row.fetched_date);
}

// ─── GTFS Reliability ─────────────────────────────────────────────────────────

export interface GtfsReliabilityRow {
  lga_code: string;
  mode: string;
  hour_of_day: number;
  week_start: string;
  pct_on_time: number | null;
  trip_count: number | null;
}

export function getReliabilityForLGA(lgaCode: string, weekStart: string): GtfsReliabilityRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT lga_code, mode, hour_of_day, week_start, pct_on_time, trip_count
    FROM gtfs_reliability
    WHERE lga_code = ? AND week_start = ?
    ORDER BY mode, hour_of_day
  `).all(lgaCode, weekStart) as GtfsReliabilityRow[];
}

export function getLatestReliabilityWeek(lgaCode: string): string | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT week_start FROM gtfs_reliability WHERE lga_code = ? ORDER BY week_start DESC LIMIT 1
  `).get(lgaCode) as { week_start: string } | undefined;
  return row?.week_start ?? null;
}

export function upsertGtfsReliability(row: GtfsReliabilityRow): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO gtfs_reliability (lga_code, mode, hour_of_day, week_start, pct_on_time, trip_count)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(lga_code, mode, hour_of_day, week_start) DO UPDATE SET
      pct_on_time = excluded.pct_on_time,
      trip_count = excluded.trip_count
  `).run(row.lga_code, row.mode, row.hour_of_day, row.week_start, row.pct_on_time, row.trip_count);
}

// ─── NSW Infrastructure ───────────────────────────────────────────────────────

export interface NSWInfrastructureRow {
  lga_code: string;
  feature_type: string;
  total_length_km: number | null;
  fetched_at: string;
}

export function getNSWInfrastructureForLGA(lgaCode: string): NSWInfrastructureRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT lga_code, feature_type, total_length_km, fetched_at
    FROM nsw_infrastructure
    WHERE lga_code = ?
  `).all(lgaCode) as NSWInfrastructureRow[];
}

export function upsertNSWInfrastructure(row: Omit<NSWInfrastructureRow, 'fetched_at'>): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO nsw_infrastructure (lga_code, feature_type, total_length_km, fetched_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(lga_code, feature_type) DO UPDATE SET
      total_length_km = excluded.total_length_km,
      fetched_at = excluded.fetched_at
  `).run(row.lga_code, row.feature_type, row.total_length_km);
}

// ─── Data Snapshots ──────────────────────────────────────────────────────────

export interface DataSnapshotRow {
  id: number;
  tag: string;
  description: string | null;
  abs_last_refresh: string | null;
  static_last_seed: string | null;
  tfnsw_last_refresh: string | null;
  abs_cache_count: number | null;
  projection_count: number | null;
  created_at: string;
}

export function createSnapshot(tag: string, description?: string): DataSnapshotRow {
  const db = getDb();
  const config = getAllConfig();
  const absCount = getABSCacheCount();
  const projCount = getNSWProjectionCount();

  db.prepare(`
    INSERT INTO data_snapshots (tag, description, abs_last_refresh, static_last_seed, tfnsw_last_refresh, abs_cache_count, projection_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    tag,
    description ?? null,
    config['abs_last_refresh'] ?? '',
    config['static_last_seed'] ?? '',
    config['tfnsw_last_refresh'] ?? '',
    absCount,
    projCount,
  );

  setConfigValue('data_snapshot_tag', tag);

  return db.prepare('SELECT * FROM data_snapshots WHERE tag = ?').get(tag) as DataSnapshotRow;
}

export function listSnapshots(limit: number = 20): DataSnapshotRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM data_snapshots ORDER BY created_at DESC LIMIT ?').all(limit) as DataSnapshotRow[];
}

export function activateSnapshot(tag: string): boolean {
  const db = getDb();
  const snapshot = db.prepare('SELECT * FROM data_snapshots WHERE tag = ?').get(tag) as DataSnapshotRow | undefined;
  if (!snapshot) return false;
  setConfigValue('data_snapshot_tag', tag);
  return true;
}

export function deleteSnapshot(tag: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM data_snapshots WHERE tag = ?').run(tag);
  const config = getAllConfig();
  if (config['data_snapshot_tag'] === tag) {
    setConfigValue('data_snapshot_tag', '');
  }
  return result.changes > 0;
}

// ─── Refresh Changes ──────────────────────────────────────────────────────────

export interface RefreshChangeRow {
  id: number;
  refresh_log_id: number;
  lga_code: string | null;
  dataset: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  change_type: string;
}

export function insertRefreshChange(change: Omit<RefreshChangeRow, 'id'>): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO refresh_changes (refresh_log_id, lga_code, dataset, field_name, old_value, new_value, change_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    change.refresh_log_id,
    change.lga_code,
    change.dataset,
    change.field_name,
    change.old_value,
    change.new_value,
    change.change_type,
  );
}

export function getChangesForRefreshLog(refreshLogId: number): RefreshChangeRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM refresh_changes WHERE refresh_log_id = ? ORDER BY id').all(refreshLogId) as RefreshChangeRow[];
}

export function getABSDatasetCoverage(): Array<{ dataset: string; count: number; expected: number }> {
  const db = getDb();
  const LGA_COUNT = 128;
  const rows = db.prepare(`
    SELECT dataset, COUNT(DISTINCT lga_code) as cnt FROM abs_cache GROUP BY dataset ORDER BY dataset
  `).all() as Array<{ dataset: string; cnt: number }>;
  return rows.map(r => ({ dataset: r.dataset, count: r.cnt, expected: LGA_COUNT }));
}

export function getABSDatasetCounts(): Record<string, number> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT dataset, COUNT(DISTINCT lga_code) as cnt FROM abs_cache GROUP BY dataset ORDER BY dataset
  `).all() as Array<{ dataset: string; cnt: number }>;
  return Object.fromEntries(rows.map(r => [r.dataset, r.cnt]));
}

export function getChangeSummaryForRefreshLog(refreshLogId: number): { total: number; updates: number; additions: number; removals: number } {
  const db = getDb();
  const rows = db.prepare(`
    SELECT change_type, COUNT(*) as cnt FROM refresh_changes WHERE refresh_log_id = ? GROUP BY change_type
  `).all(refreshLogId) as Array<{ change_type: string; cnt: number }>;
  const summary = { total: 0, updates: 0, additions: 0, removals: 0 };
  for (const row of rows) {
    summary.total += row.cnt;
    if (row.change_type === 'update') summary.updates = row.cnt;
    else if (row.change_type === 'add') summary.additions = row.cnt;
    else if (row.change_type === 'remove') summary.removals = row.cnt;
  }
  return summary;
}
