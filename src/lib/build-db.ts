/**
 * Build-time SQLite database (data/build.db, gitignored).
 *
 * Holds the large intermediate tables the SA2 catchment pipeline derives its
 * committed outputs from (sa2_cache, and later mesh_blocks and
 * gtfs_stop_frequency). The app never reads it and it never goes into the
 * committed data/cache.db. Override the location with BUILD_DB_PATH.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;
let dbPath: string | null = null;

function getBuildDbPath(): string {
  const explicit = process.env.BUILD_DB_PATH?.trim();
  return explicit ? path.resolve(explicit) : path.join(process.cwd(), 'data', 'build.db');
}

export function getBuildDb(): Database.Database {
  const target = getBuildDbPath();
  if (db?.open && dbPath === target) return db;
  db?.close();

  fs.mkdirSync(path.dirname(target), { recursive: true });
  db = new Database(target);
  dbPath = target;

  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    -- ABS Census indicators per SA2 (one JSON blob per SA2 per table)
    CREATE TABLE IF NOT EXISTS sa2_cache (
      sa2_code TEXT NOT NULL,
      dataset TEXT NOT NULL,
      data_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (sa2_code, dataset)
    );
  `);
  return db;
}

export function upsertSa2Cache(sa2Code: string, dataset: string, data: unknown): void {
  getBuildDb()
    .prepare(`
      INSERT INTO sa2_cache (sa2_code, dataset, data_json, fetched_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(sa2_code, dataset) DO UPDATE SET
        data_json = excluded.data_json,
        fetched_at = excluded.fetched_at
    `)
    .run(sa2Code, dataset, JSON.stringify(data));
}

export function getSa2Cache<T = unknown>(sa2Code: string, dataset: string): T | null {
  const row = getBuildDb()
    .prepare('SELECT data_json FROM sa2_cache WHERE sa2_code = ? AND dataset = ?')
    .get(sa2Code, dataset) as { data_json: string } | undefined;
  return row ? (JSON.parse(row.data_json) as T) : null;
}
