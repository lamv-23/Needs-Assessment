/**
 * SQLite database wrapper for periodic data caching.
 * Uses WAL journal mode for concurrent multi-user reads.
 * Database file: data/cache.db (created on first use)
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

function getDbPath(): string {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'cache.db');
}

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  db = new Database(dbPath);

  // WAL mode: allows concurrent readers + one writer
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  initSchema(db);
  return db;
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
      ('static_last_seed', '');
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

export interface RefreshLogRow {
  id: number;
  source: string;
  status: string;
  lgas_updated: number;
  error_message: string | null;
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
  errorMessage?: string
): void {
  const db = getDb();
  db.prepare(`
    UPDATE refresh_log
    SET status = ?, lgas_updated = ?, error_message = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(status, lgasUpdated, errorMessage ?? null, id);
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
