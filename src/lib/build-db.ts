/**
 * Build-time SQLite database (data/build.db, gitignored).
 *
 * Holds the large intermediate tables the SA2 catchment pipeline derives its
 * committed outputs from (sa2_cache, mesh_blocks, gtfs_stop_frequency). The app never reads it and it never goes into the
 * committed data/cache.db. Override the location with BUILD_DB_PATH.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { StopFrequencyRow } from './gtfs-frequency';

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

    -- 2021 NSW mesh blocks: SA2, 2021 Census persons, centroid and the LGA the centroid falls in.
    -- lat/lng and lga_id are NULL for the blocks of the two non-spatial SA2s (no geometry, no LGA).
    CREATE TABLE IF NOT EXISTS mesh_blocks (
      mb_code TEXT PRIMARY KEY,
      sa2_code TEXT NOT NULL,
      lga_id TEXT,
      persons INTEGER NOT NULL,
      lat REAL,
      lng REAL
    );

    -- Weekday 07:00-09:00 departures for every stop in the GTFS bundle (0 where none), with the
    -- stop's location and mode from the same bundle so catchments need no other stop source.
    CREATE TABLE IF NOT EXISTS gtfs_stop_frequency (
      stop_id TEXT PRIMARY KEY,
      service_date TEXT NOT NULL,
      am_peak_departures INTEGER NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      mode TEXT NOT NULL
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

export interface MeshBlockRow {
  mb_code: string;
  sa2_code: string;
  /** LGA containing the centroid; null when none does, and always null for non-spatial SA2s. */
  lga_id: string | null;
  persons: number;
  /** Centroid (WGS84); null only for blocks of the non-spatial SA2s, which have no geometry. */
  lat: number | null;
  lng: number | null;
}

export const MESH_BLOCK_BATCH_SIZE = 5000;

/** Insert or replace mesh blocks, one transaction per batch of `batchSize`. */
export function upsertMeshBlocks(rows: readonly MeshBlockRow[], batchSize = MESH_BLOCK_BATCH_SIZE): void {
  const db = getBuildDb();
  const stmt = db.prepare(`
    INSERT INTO mesh_blocks (mb_code, sa2_code, lga_id, persons, lat, lng)
    VALUES (@mb_code, @sa2_code, @lga_id, @persons, @lat, @lng)
    ON CONFLICT(mb_code) DO UPDATE SET
      sa2_code = excluded.sa2_code,
      lga_id = excluded.lga_id,
      persons = excluded.persons,
      lat = excluded.lat,
      lng = excluded.lng
  `);
  const insertBatch = db.transaction((batch: readonly MeshBlockRow[]) => {
    for (const row of batch) stmt.run(row);
  });
  for (let i = 0; i < rows.length; i += batchSize) insertBatch(rows.slice(i, i + batchSize));
}

/** Replace the whole gtfs_stop_frequency table with `rows`, in one transaction. */
export function replaceGtfsStopFrequency(rows: readonly StopFrequencyRow[]): void {
  const db = getBuildDb();
  const stmt = db.prepare(`
    INSERT INTO gtfs_stop_frequency (stop_id, service_date, am_peak_departures, lat, lng, mode)
    VALUES (@stop_id, @service_date, @am_peak_departures, @lat, @lng, @mode)
  `);
  db.transaction(() => {
    db.prepare('DELETE FROM gtfs_stop_frequency').run();
    for (const row of rows) stmt.run(row);
  })();
}
