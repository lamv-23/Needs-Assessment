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

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_abs_lga ON abs_cache(lga_code);
    CREATE INDEX IF NOT EXISTS idx_tfnsw_lga ON tfnsw_cache(lga_code);
    CREATE INDEX IF NOT EXISTS idx_projections_lga ON nsw_projections(lga_name);
    CREATE INDEX IF NOT EXISTS idx_transport_static_lga ON transport_static(lga_name);
    CREATE INDEX IF NOT EXISTS idx_refresh_log_started ON refresh_log(started_at DESC);

    -- Default config values (only insert if not already present)
    INSERT OR IGNORE INTO refresh_config (key, value) VALUES
      ('abs_refresh_interval_days', '7'),
      ('tfnsw_refresh_interval_days', '7'),
      ('auto_refresh_enabled', 'false'),
      ('abs_last_refresh', ''),
      ('tfnsw_last_refresh', ''),
      ('static_last_seed', '');
  `);
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
