/**
 * Build-time database (data/build.db): opened lazily at BUILD_DB_PATH, with the
 * sa2_cache table created on first use. Uses a temp file, never data/build.db.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { getBuildDb, upsertSa2Cache, getSa2Cache } from '../lib/build-db';

describe('build-db', () => {
  let dir: string;
  const saved = process.env.BUILD_DB_PATH;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-db-test-'));
    process.env.BUILD_DB_PATH = path.join(dir, 'nested', 'build.db');
  });

  afterEach(() => {
    getBuildDb().close();
    if (saved === undefined) delete process.env.BUILD_DB_PATH;
    else process.env.BUILD_DB_PATH = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates the database file, its folder and the sa2_cache table on first use', () => {
    const db = getBuildDb();
    expect(fs.existsSync(process.env.BUILD_DB_PATH!)).toBe(true);
    const cols = db.prepare("PRAGMA table_info('sa2_cache')").all().map((c) => (c as { name: string }).name);
    expect(cols).toEqual(['sa2_code', 'dataset', 'data_json', 'fetched_at']);
  });

  it('round-trips JSON per (sa2_code, dataset) and returns null when absent', () => {
    upsertSa2Cache('116031317', 'G01', { totalPopulation: 9000, ageGroups: { '0_4': 600 } });
    expect(getSa2Cache('116031317', 'G01')).toEqual({ totalPopulation: 9000, ageGroups: { '0_4': 600 } });
    expect(getSa2Cache('116031317', 'G02')).toBeNull();
    expect(getSa2Cache('116021628', 'G01')).toBeNull();
  });

  it('upsert replaces the earlier row rather than adding one', () => {
    upsertSa2Cache('116031317', 'G18', { rate: 1 });
    upsertSa2Cache('116031317', 'G18', { rate: 2 });
    expect(getSa2Cache('116031317', 'G18')).toEqual({ rate: 2 });
    const { n } = getBuildDb().prepare('SELECT COUNT(*) AS n FROM sa2_cache').get() as { n: number };
    expect(n).toBe(1);
  });
});
