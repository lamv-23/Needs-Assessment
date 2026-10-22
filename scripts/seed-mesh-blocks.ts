#!/usr/bin/env tsx
/**
 * Load the 112,738 NSW mesh blocks of the 2021 ASGS into data/build.db (mesh_blocks):
 * SA2, 2021 Census persons, centroid (WGS84) and the LGA the centroid falls in. They are
 * the basis for the walking-catchment and SA2 -> LGA calculations. Only the gitignored
 * build database is written; data/cache.db is not touched.
 *
 * Sources:
 *   - persons: ABS "Mesh Block Counts, 2021" workbook (downloaded to the OS temp folder,
 *     or --counts <path>). Counts are randomly adjusted by the ABS, so they sum to
 *     slightly less than the Census total.
 *   - SA2 and centroid: ABS ArcGIS ASGS2021/MB FeatureServer, state_code_2021 = '1'.
 *   - LGA: the centroid tested against the full-resolution public/geo/lga-nsw.json.
 *
 * The blocks of the two non-spatial SA2s (Migratory - Offshore - Shipping, No usual address)
 * have no geometry. They are stored with their persons but with no centroid and no LGA, so they
 * never enter an LGA share or a catchment (Ruling P2-R7).
 *
 * Usage:
 *   npm run seed:mesh-blocks                              # downloads the workbook (~15 MB)
 *   npm run seed:mesh-blocks -- --counts <path-to-xlsx>   # use a copy you already have
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import { queryFeatureServer } from '../src/lib/arcgis';
import { SA2_AREAS } from '../src/lib/data/sa2-areas';
import { getBuildDb, upsertMeshBlocks, type MeshBlockRow } from '../src/lib/build-db';
import { NON_SPATIAL_SA2_CODES, buildLgaLocator, parseMeshBlockCounts } from '../src/lib/mesh-blocks';

const MB_LAYER_URL = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/MB/FeatureServer/0';
const COUNTS_URL = 'https://www.abs.gov.au/census/guide-census-data/mesh-block-counts/2021/Mesh%20Block%20Counts%2C%202021.xlsx';
const LGA_GEO_PATH = path.join(process.cwd(), 'public/geo/lga-nsw.json');

const NSW_WHERE = "state_code_2021='1'";
const NON_SPATIAL_LIST = [...NON_SPATIAL_SA2_CODES].map((c) => `'${c}'`).join(',');

// Verification targets (Step 6 of the task brief).
const NSW_CENSUS_PERSONS = 8_072_163; // Census 2021 NSW usual-residence count
const NSW_PERSONS_TOLERANCE = 0.005;
const BLACKTOWN_LGA_ID = 'lga_blacktown';
const BLACKTOWN_G01_PERSONS = 396_776; // C21_G01_LGA total persons for LGA 10750
const BLACKTOWN_TOLERANCE = 0.01;
const UNLOCATED_MAX_SHARE = 0.001; // persons in located blocks with no LGA, of all persons

const args = process.argv.slice(2);
const countsFlag = args.indexOf('--counts');
const countsArg = countsFlag >= 0 ? args[countsFlag + 1] : null;
if (countsFlag >= 0 && !countsArg) {
  console.error('--counts needs the path to the Mesh Block Counts workbook');
  process.exit(1);
}

function pct(n: number, of: number): string {
  return `${((n / of) * 100).toFixed(3)}%`;
}

async function downloadCounts(dir: string): Promise<string> {
  console.log(`Downloading ${COUNTS_URL}`);
  const res = await fetch(COUNTS_URL, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`Mesh Block Counts download failed: HTTP ${res.status} ${res.statusText}`);
  const file = path.join(dir, 'mesh-block-counts-2021.xlsx');
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`  ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
  return file;
}

/** persons by NSW mesh block code, from every "Table n" sheet (other states' rows are dropped by the parser). */
function readCounts(file: string): Map<string, number> {
  const wb = XLSX.readFile(file, { dense: true });
  const counts = new Map<string, number>();
  for (const name of wb.SheetNames.filter((n) => /^Table \d/.test(n))) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: null });
    const sheet = parseMeshBlockCounts(rows);
    for (const [code, persons] of sheet) {
      if (counts.has(code)) throw new Error(`Mesh block ${code} appears on more than one sheet`);
      counts.set(code, persons);
    }
    if (sheet.size > 0) console.log(`  ${name}: ${sheet.size} NSW mesh blocks`);
  }
  return counts;
}

/** The server's count for a query, to cross-check the paged result against. */
async function featureCount(where: string): Promise<number> {
  const form = new URLSearchParams({ where, returnCountOnly: 'true', f: 'json' });
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    try {
      const res = await fetch(`${MB_LAYER_URL}/query`, { method: 'POST', body: form, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { count?: number; error?: { message?: string } };
      if (typeof body.count === 'number') return body.count;
      throw new Error(body.error?.message ?? 'no count in the response');
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`ArcGIS count query failed (${where}): ${lastError instanceof Error ? lastError.message : lastError}`);
}

/** Deduplicate by mb_code_2021 and require exactly `expected` distinct blocks. */
function distinctBlocks(features: GeoJSON.Feature[], expected: number, label: string): Map<string, GeoJSON.Feature> {
  const byCode = new Map<string, GeoJSON.Feature>();
  for (const f of features) {
    const code = f.properties?.mb_code_2021;
    if (typeof code !== 'string' || !f.properties?.sa2_code_2021) {
      throw new Error(`${label}: feature without mb_code_2021 / sa2_code_2021: ${JSON.stringify(f.properties)}`);
    }
    byCode.set(code, f);
  }
  if (byCode.size !== expected) {
    throw new Error(`${label}: ${byCode.size} distinct mesh blocks from ${features.length} features, the server counts ${expected}`);
  }
  if (features.length !== byCode.size) console.warn(`  ${label}: dropped ${features.length - byCode.size} duplicate features`);
  return byCode;
}

async function main(): Promise<void> {
  const started = performance.now();
  const elapsed = () => `${((performance.now() - started) / 1000).toFixed(0)}s`;

  // The registry and the ruling must agree on which SA2s have no geometry.
  const noArea = SA2_AREAS.filter((a) => a.areaKm2 === 0).map((a) => a.code);
  if (noArea.length !== NON_SPATIAL_SA2_CODES.size || noArea.some((c) => !NON_SPATIAL_SA2_CODES.has(c))) {
    throw new Error(`SA2 registry has zero-area SA2s [${noArea.join(', ')}], expected [${[...NON_SPATIAL_SA2_CODES].join(', ')}]`);
  }

  // 1. Persons per mesh block.
  let counts: Map<string, number>;
  if (countsArg) {
    if (!fs.existsSync(countsArg)) throw new Error(`--counts file not found: ${countsArg}`);
    console.log(`Reading ${countsArg}`);
    counts = readCounts(countsArg);
  } else {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-block-counts-'));
    try {
      const file = await downloadCounts(tempDir);
      console.log(`Reading ${file}`);
      counts = readCounts(file);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
  console.log(`  ${counts.size} NSW mesh blocks with a person count`);

  // 2. Mesh blocks from ArcGIS: those with a place on the map (with centroids), then the non-spatial SA2s'.
  const spatialWhere = `${NSW_WHERE} AND sa2_code_2021 NOT IN (${NON_SPATIAL_LIST})`;
  const nonSpatialWhere = `${NSW_WHERE} AND sa2_code_2021 IN (${NON_SPATIAL_LIST})`;
  const [total, spatialCount, nonSpatialCount] = await Promise.all([
    featureCount(NSW_WHERE),
    featureCount(spatialWhere),
    featureCount(nonSpatialWhere),
  ]);
  console.log(`ArcGIS counts: ${total} NSW mesh blocks (${spatialCount} spatial + ${nonSpatialCount} in non-spatial SA2s)`);
  if (spatialCount + nonSpatialCount !== total) {
    throw new Error(`ArcGIS counts do not add up: ${spatialCount} + ${nonSpatialCount} != ${total}`);
  }

  const outFields = ['mb_code_2021', 'sa2_code_2021'];
  console.log('Fetching mesh-block centroids ...');
  const spatial = distinctBlocks(
    await queryFeatureServer(MB_LAYER_URL, { where: spatialWhere, outFields, returnGeometry: false, returnCentroid: true }),
    spatialCount,
    'spatial query',
  );
  const nonSpatial = distinctBlocks(
    await queryFeatureServer(MB_LAYER_URL, { where: nonSpatialWhere, outFields, returnGeometry: false }),
    nonSpatialCount,
    'non-spatial query',
  );
  console.log(`  ${spatial.size + nonSpatial.size} distinct mesh blocks (${elapsed()})`);

  // The two sources must describe the same set of blocks.
  const all = new Set([...spatial.keys(), ...nonSpatial.keys()]);
  const noCount = [...all].filter((c) => !counts.has(c));
  const noBlock = [...counts.keys()].filter((c) => !all.has(c));
  if (noCount.length || noBlock.length) {
    throw new Error(
      `Mesh blocks differ between ArcGIS and the counts workbook: ${noCount.length} without a count (${noCount.slice(0, 5)}), ` +
        `${noBlock.length} counted but not in the layer (${noBlock.slice(0, 5)})`,
    );
  }

  // 3. LGA for each centroid, against the full-resolution boundaries.
  console.log(`Reading ${path.relative(process.cwd(), LGA_GEO_PATH)} ...`);
  const geo = JSON.parse(fs.readFileSync(LGA_GEO_PATH, 'utf8')) as GeoJSON.FeatureCollection;
  const locate = buildLgaLocator(geo);
  console.log(`  ${geo.features.length} LGAs; assigning ${spatial.size} centroids (${elapsed()})`);

  const rows: MeshBlockRow[] = [];
  let done = 0;
  for (const [code, f] of spatial) {
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
    rows.push({
      mb_code: code,
      sa2_code: String(f.properties!.sa2_code_2021),
      lga_id: locate(lng, lat),
      persons: counts.get(code)!,
      lat,
      lng,
    });
    if (++done % 20_000 === 0) console.log(`  ${done}/${spatial.size} (${elapsed()})`);
  }
  for (const [code, f] of nonSpatial) {
    rows.push({ mb_code: code, sa2_code: String(f.properties!.sa2_code_2021), lga_id: null, persons: counts.get(code)!, lat: null, lng: null });
  }

  // 4. Verify before replacing the table.
  const sum = (rs: MeshBlockRow[]) => rs.reduce((s, r) => s + r.persons, 0);
  const nswPersons = sum(rows);
  const blacktownPersons = sum(rows.filter((r) => r.lga_id === BLACKTOWN_LGA_ID));
  const nonSpatialPersons = sum(rows.filter((r) => r.lat === null));
  const unlocated = rows.filter((r) => r.lat !== null && r.lga_id === null && r.persons > 0);
  const unlocatedPersons = sum(unlocated);
  const lgaCount = new Set(rows.map((r) => r.lga_id).filter(Boolean)).size;

  const checks: [string, boolean, string][] = [
    [
      `NSW persons within ${NSW_PERSONS_TOLERANCE * 100}% of ${NSW_CENSUS_PERSONS}`,
      Math.abs(nswPersons - NSW_CENSUS_PERSONS) / NSW_CENSUS_PERSONS <= NSW_PERSONS_TOLERANCE,
      `${nswPersons} (${((nswPersons / NSW_CENSUS_PERSONS - 1) * 100).toFixed(3)}%)`,
    ],
    [
      `Blacktown persons within ${BLACKTOWN_TOLERANCE * 100}% of ${BLACKTOWN_G01_PERSONS}`,
      Math.abs(blacktownPersons - BLACKTOWN_G01_PERSONS) / BLACKTOWN_G01_PERSONS <= BLACKTOWN_TOLERANCE,
      `${blacktownPersons} (${((blacktownPersons / BLACKTOWN_G01_PERSONS - 1) * 100).toFixed(3)}%)`,
    ],
    [
      `persons in located blocks with no LGA under ${UNLOCATED_MAX_SHARE * 100}% of persons`,
      unlocatedPersons / nswPersons < UNLOCATED_MAX_SHARE,
      `${unlocatedPersons} persons in ${unlocated.length} blocks (${pct(unlocatedPersons, nswPersons)})`,
    ],
  ];

  console.log(`\nMesh blocks: ${rows.length}; LGAs with a block: ${lgaCount}`);
  console.log(`Non-spatial SA2 blocks (no centroid, no LGA): ${nonSpatial.size}, ${nonSpatialPersons} persons`);
  for (const [label, ok, detail] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${detail}`);
  if (checks.some(([, ok]) => !ok)) {
    throw new Error('Verification failed; mesh_blocks was not changed');
  }

  // 5. Replace the table in one transaction so a failure cannot leave it half-loaded.
  const db = getBuildDb();
  db.transaction(() => {
    db.exec('DELETE FROM mesh_blocks');
    upsertMeshBlocks(rows);
  })();
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM mesh_blocks').get() as { n: number };
  console.log(`\nWrote ${n} rows to mesh_blocks in ${elapsed()}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
