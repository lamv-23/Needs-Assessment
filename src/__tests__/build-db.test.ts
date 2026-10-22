/**
 * Build-time database (data/build.db): opened lazily at BUILD_DB_PATH, with the
 * sa2_cache and mesh_blocks tables created on first use. Uses a temp file, never data/build.db.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { getBuildDb, upsertSa2Cache, getSa2Cache, upsertMeshBlocks, type MeshBlockRow } from '../lib/build-db';

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

  describe('mesh_blocks', () => {
    const block = (n: number, over: Partial<MeshBlockRow> = {}): MeshBlockRow => ({
      mb_code: String(10000000000 + n),
      sa2_code: '116031317',
      lga_id: 'lga_blacktown',
      persons: n,
      lat: -33.77,
      lng: 150.91,
      ...over,
    });
    const count = () => (getBuildDb().prepare('SELECT COUNT(*) AS n FROM mesh_blocks').get() as { n: number }).n;

    it('creates the mesh_blocks table with a nullable lga_id, lat and lng', () => {
      const cols = getBuildDb().prepare("PRAGMA table_info('mesh_blocks')").all() as { name: string; notnull: number }[];
      expect(cols.map((c) => c.name)).toEqual(['mb_code', 'sa2_code', 'lga_id', 'persons', 'lat', 'lng']);
      expect(cols.filter((c) => c.notnull === 1).map((c) => c.name)).toEqual(['sa2_code', 'persons']);
    });

    it('inserts every row across batches', () => {
      upsertMeshBlocks(Array.from({ length: 12 }, (_, i) => block(i)), 5);
      expect(count()).toBe(12);
      const { total } = getBuildDb().prepare('SELECT SUM(persons) AS total FROM mesh_blocks').get() as { total: number };
      expect(total).toBe(66);
    });

    it('replaces an existing block rather than adding one, and stores NULL coordinates and LGA', () => {
      upsertMeshBlocks([block(1)]);
      upsertMeshBlocks([block(1, { persons: 99, lga_id: null, lat: null, lng: null })]);
      expect(count()).toBe(1);
      expect(getBuildDb().prepare('SELECT * FROM mesh_blocks').get()).toEqual({
        mb_code: '10000000001',
        sa2_code: '116031317',
        lga_id: null,
        persons: 99,
        lat: null,
        lng: null,
      });
    });

    it('accepts an empty list', () => {
      upsertMeshBlocks([]);
      expect(count()).toBe(0);
    });
  });
});
