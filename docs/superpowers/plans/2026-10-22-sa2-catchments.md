# SA2 Needs and Walking Catchments Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank all 644 NSW SA2s on need, measure the share of residents within a straight-line walk of frequent and any public transport, and show the SA2 "pockets of need" inside the selected LGAs on `/needs` and in the Word export.

**Architecture:**
- **Build-time scripts:**
  - Fetch SA2 Census tables, using the existing pure `decodeXxx(get)` functions with an SA2 region code.
  - Fetch SA2 and mesh-block geometry from the ABS ArcGIS services.
  - Persist per-stop AM-peak departures from the GTFS seed.
  - Compute catchments with a grid-indexed nearest-stop search.
- **Outputs:**
  - `public/data/sa2-needs.json`, fetched on demand by the page and kept out of the JS bundle.
  - LGA catchment shares in `tfnsw_cache` (`CATCHMENT_COVERAGE`), which flow into `NEEDS_SNAPSHOT`.
- Scoring reuses `assessRecord` from Phase 1 Part A.

**Tech Stack:** TypeScript scripts (tsx), better-sqlite3, ABS Data API (SDMX-ML), ABS ArcGIS REST, `xlsx` (installed), `@turf/boolean-point-in-polygon` (installed), `mapshaper` (from Phase 1 Task 9), Jest.

**Spec:** `docs/superpowers/specs/2026-10-22-sa2-catchments-design.md`

## Global Constraints

- Every ABS code must be checked against the official codelist (`/rest/dataflow/ABS/<ID>?references=all&detail=referencepartial`) before use, as `CLAUDE.md` requires. Each new decoder gets a test in `src/__tests__/abs-decoders*.test.ts`, and one SA2 is verified against ABS QuickStats.
- New SQLite tables (`sa2_cache`, `mesh_blocks`, `gtfs_stop_frequency`) are **build-time only**: written and read by scripts.
  - The app reads `public/data/sa2-needs.json` and `tfnsw_cache` only. `tfnsw_cache` already exists for both repository drivers, so no Postgres migration is needed.
- Constants:
  - `FREQUENT_DEPARTURES_THRESHOLD` (8) from `src/lib/gtfs-frequency.ts`.
  - `CATCHMENT_RADIUS_M = { train: 800, metro: 800, ferry: 800, lightRail: 400, bus: 400 }`.
  - SA2 drill-down share threshold: `0.10`.
  - Low-population threshold: `100` persons.
- Every catchment figure, table and sentence says **"straight-line distance"**.
- Missing values are `null` and display as "No data", the same as Phase 1.

## Review Focus

1. **SA2s that straddle LGA boundaries.** They appear in each LGA's drill-down where that LGA's share is ≥ 10%, with the share shown. In combined mode they appear once. *Pinned in Task 6 (`sa2sForLgas` dedupe) and Task 3 (`lgaShares`).*
2. **SA2s with little or no residential population** (airport, industrial, national park). Exclude them from percentiles and show "Low population", not a misleading rank. *Pinned in Task 6.*
3. **A stop just across an LGA boundary from residents.** It still counts toward their catchment. *Pinned in Task 5 (`stops from any LGA count`).*
4. **Mesh Block Counts workbook layout** (title rows, several sheets, other states). The parser finds the header row by `MB_CODE_2021`, filters to NSW codes starting with `1`, and validates the NSW total. *Pinned in Task 3.*
5. **An empty `gtfs_stop_frequency` table** (GTFS not re-seeded). `build:catchments` fails with an instruction to run `npm run seed:gtfs`, rather than writing 0% coverage. *Pinned in Task 5.*

---

## File map

| File | Responsibility |
|---|---|
| `scripts/fetch-sa2-boundaries.ts` | ArcGIS SA2 query → `public/geo/sa2-nsw.json` → simplified `public/geo/sa2-nsw-simple.json`, plus the generated `src/lib/data/sa2-areas.ts` |
| `src/lib/arcgis.ts` | Paged ArcGIS FeatureServer query helper |
| `src/lib/abs-sa2-fetchers.ts` | SA2 fetch functions built on the shared decoders |
| `scripts/seed-sa2.ts` | Fills `sa2_cache` |
| `src/lib/mesh-blocks.ts` | Counts-workbook parsing and LGA assignment (pure) |
| `scripts/seed-mesh-blocks.ts` | Fills `mesh_blocks` |
| `src/lib/catchments.ts` | Stop grid index, distance, catchment shares (pure) |
| `scripts/build-catchments.ts` | Writes SA2 and LGA catchment results |
| `scripts/build-sa2-needs.ts` | Writes `public/data/sa2-needs.json` |
| `src/hooks/useSa2Needs.ts` | On-demand fetch of the SA2 file |
| `src/components/needs/Sa2*.tsx`, `CatchmentChart.tsx` | Drill-down UI |

---

### Task 1: SA2 boundaries and registry

**Files:**
- Create: `src/lib/arcgis.ts`, `scripts/fetch-sa2-boundaries.ts`
- Generate: `public/geo/sa2-nsw-simple.json`, `src/lib/data/sa2-areas.ts`
- Modify: `package.json` (add a `"fetch:sa2-boundaries": "tsx scripts/fetch-sa2-boundaries.ts"` script)
- Modify: `.gitignore` (add `public/geo/sa2-nsw.json`, the unsimplified intermediate)
- Test: `src/__tests__/sa2-areas.test.ts`

**Interfaces:**
- Produces:

  ```ts
  export async function queryFeatureServer(layerUrl: string, params: { where: string; outFields: string[]; returnGeometry: boolean; returnCentroid?: boolean }): Promise<GeoJSON.Feature[]>  // pages by resultOffset, 2,000 per page, f=geojson
  export interface Sa2Area { code: string; name: string; sa3Name: string; sa4Name: string; gccsaName: string; areaKm2: number }
  export const SA2_AREAS: Sa2Area[]          // generated
  ```

- [ ] **Step 1: Write failing tests**

  ```ts
  expect(SA2_AREAS).toHaveLength(644);
  expect(new Set(SA2_AREAS.map(a => a.code)).size).toBe(644);
  expect(SA2_AREAS.every(a => /^1\d{8}$/.test(a.code))).toBe(true);
  // Simplified geo: 644 features whose properties.code matches SA2_AREAS
  ```

- [ ] **Step 2: Run** `npx jest src/__tests__/sa2-areas.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

  - Query `…/ASGS2021/SA2/FeatureServer/0` with `where=state_code_2021='1'`.
  - Write the GeoJSON with properties `{ code, name }`.
  - Simplify with `npx mapshaper public/geo/sa2-nsw.json -simplify 3% keep-shapes -o precision=0.0001 public/geo/sa2-nsw-simple.json`.
  - Generate `sa2-areas.ts` with the auto-generated header.
  - Run `npm run fetch:sa2-boundaries`.

- [ ] **Step 4: Run the tests.** Expected: PASS, and `public/geo/sa2-nsw-simple.json` is under 4 MB.

- [ ] **Step 5: Commit** `feat(sa2): NSW SA2 boundaries and registry`

---

### Task 2: SA2 Census indicators

**Files:**
- Modify: `src/lib/db.ts`. Add `CREATE TABLE IF NOT EXISTS sa2_cache (sa2_code TEXT NOT NULL, dataset TEXT NOT NULL, data_json TEXT NOT NULL, fetched_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (sa2_code, dataset))` and `upsertSa2Cache` / `getSa2Cache` helpers next to the `abs_cache` ones.
- Modify: `src/lib/abs-fetchers.ts`. Export a pure decoder for each table still decoded inline (G18 need for assistance, SEIFA, and any other in the list below) without changing behaviour.
- Create: `src/lib/abs-sa2-fetchers.ts`, `scripts/seed-sa2.ts`
- Modify: `package.json` (add a `"seed:sa2": "tsx scripts/seed-sa2.ts"` script)
- Test: `src/__tests__/abs-decoders-sa2.test.ts`

**Interfaces:**
- Consumes: `decodeG01`, `decodeG02`, `decodeG13`, `decodeG33Income`, `decodeG34`, `decodeLabour`, `decodeJourneyToWork`, and the newly exported G18 and SEIFA decoders. Also `parseSdmxXml`, `lookupValue` and `fetchWithRetry` (export them if they are not exported).
- Produces:
  - `SA2_DATASETS = ['G01','G02','G13','G18','G33_INCOME','G34','LABOUR','G62','SEIFA'] as const`
  - `fetchSa2Dataset(dataset: Sa2Dataset, sa2Codes: string[]): Promise<Map<string, unknown>>`

- [ ] **Step 1: Inspect each dataflow's structure** (`C21_G01_SA2` etc., and `ABS_SEIFA2021_SA2`). Record three things in the module header:
  - the region dimension's id (`REGION` or other) and its codes;
  - whether a whole-dataset download (as the LGA fetchers do) stays under about 150 MB;
  - if not, the batch key form (`+`-joined SA2 codes, at most 100 per request).

- [ ] **Step 2: Write failing tests**

  These are pure tests: build a fake `parseSdmxXml` result with two SA2 codes and check that each decoder returns per-SA2 values when the getter is bound to `REGION: <sa2>`. Add one test per newly exported decoder, asserting the same output as the inline code it replaced (use the existing LGA fixture values).

- [ ] **Step 3: Run** `npx jest src/__tests__/abs-decoders-sa2.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement**

  - Run `seed-sa2` over `SA2_AREAS`, upserting `sa2_cache` and logging per dataset (`G01 644/644`).
  - Then run `npm run seed:sa2`.

- [ ] **Step 5: Run the tests, then verify one SA2 by hand**

  Check the cached G01 total persons for one Blacktown SA2 (choose from `SA2_AREAS`, for example "Mount Druitt - Whalan") against ABS QuickStats 2021. Note both values in the commit message.

- [ ] **Step 6: Commit** `feat(sa2): Census indicators for 644 NSW SA2s`

---

### Task 3: Mesh blocks with population and LGA

**Files:**
- Modify: `src/lib/db.ts`. Add `CREATE TABLE IF NOT EXISTS mesh_blocks (mb_code TEXT PRIMARY KEY, sa2_code TEXT NOT NULL, lga_id TEXT, persons INTEGER NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL)` and a batch upsert helper.
- Create: `src/lib/mesh-blocks.ts`, `scripts/seed-mesh-blocks.ts`
- Modify: `package.json` (add a `"seed:mesh-blocks": "tsx scripts/seed-mesh-blocks.ts"` script; usage `npm run seed:mesh-blocks -- --counts <path-to-xlsx>`)
- Test: `src/__tests__/mesh-blocks.test.ts`

**Interfaces:**
- Produces:

  ```ts
  export function parseMeshBlockCounts(rows: unknown[][]): Map<string, number>   // mb_code → persons; header row located by the cell 'MB_CODE_2021'; NSW (code starts with '1') only
  export function buildLgaLocator(geo: GeoJSON.FeatureCollection): (lng: number, lat: number) => string | null   // bbox prefilter, then point-in-polygon; returns properties.id
  export function lgaSharesForSa2(blocks: { sa2_code: string; lga_id: string | null; persons: number }[]): Map<string, { lgaId: string; share: number }[]>  // shares sum to 1 over persons with a known LGA; sorted by share, descending
  ```

- [ ] **Step 1: Write failing tests**

  ```ts
  test('header row is found below title rows and other states are dropped', ...)   // rows: ['Mesh Block Counts…'], [], ['MB_CODE_2021','MB_CATEGORY_NAME_2021','Dwelling','Person','State'], ['10000010000','Residential',5,12,'1'], ['20000010000',…]
  test('lgaSharesForSa2', ...)  // SA2 X: 700 persons in lga_a and 300 in lga_b → [{lga_a, 0.7}, {lga_b, 0.3}]
  test('buildLgaLocator finds Blacktown for a point inside it', ...)  // use the real lga-nsw-simple.json and a known point, e.g. Blacktown station (-33.7690, 150.9063)
  ```

  Use the actual column headers from the workbook if they differ, but keep the behaviour asserted.

- [ ] **Step 2: Run** `npx jest src/__tests__/mesh-blocks.test.ts`. Expected: FAIL. **Step 3:** implement the pure functions. **Step 4:** run them. Expected: PASS.

- [ ] **Step 5: Implement the seed**

  - Download the workbook from the URL in the spec into `$TMPDIR` (or take `--counts`), and read it with `xlsx`.
  - Query the ArcGIS MB layer for `state_code_2021='1'` with `outFields=mb_code_2021,sa2_code_2021` and `returnCentroid=true`. If the service rejects `returnCentroid`, request geometry and use the polygon's centroid.
  - Locate each block's LGA against `public/geo/lga-nsw.json` (the full boundaries, for accuracy).
  - Upsert in batches of 5,000.

- [ ] **Step 6: Run** `npm run seed:mesh-blocks`. Expected output:
  - Σ persons for NSW within 0.5% of 8,072,163 (Census 2021 NSW usual-residence count; mesh-block counts are slightly perturbed by ABS).
  - Σ persons for `lga_blacktown` within 1% of its G01 total (396,776).
  - Mesh blocks with persons > 0 and `lga_id` null: under 0.1% of persons.

- [ ] **Step 7: Commit** `feat(sa2): mesh-block population, SA2 and LGA assignment`

---

### Task 4: Persist per-stop AM-peak departures

**Files:**
- Modify: `src/lib/db.ts`. Add `CREATE TABLE IF NOT EXISTS gtfs_stop_frequency (stop_id TEXT PRIMARY KEY, service_date TEXT NOT NULL, am_peak_departures INTEGER NOT NULL)` and `replaceGtfsStopFrequency(rows)`, which clears and inserts in one transaction.
- Modify: `scripts/seed-gtfs.ts`. After `allPeakDepartures` is built (next to the `GTFS_FREQUENCY` upserts, around line 759), write every stop in `gtfs_stops`, using 0 for stops with no departures.
- Test: `src/__tests__/gtfs-frequency.test.ts`

**Interfaces:**
- Produces: `toStopFrequencyRows(stopIds: Iterable<string>, departures: Map<string, number>, serviceDate: string): { stop_id: string; service_date: string; am_peak_departures: number }[]`, in `src/lib/gtfs-frequency.ts`.

- [ ] **Step 1: Write the failing test.** Stops `['a','b']` with departures `{a: 9}` → `[{a, 9}, {b, 0}]`, both with the same service date.

- [ ] **Step 2: Run** `npx jest src/__tests__/gtfs-frequency.test.ts`. Expected: FAIL. **Step 3:** implement and wire it into the seed. **Step 4:** run the test. Expected: PASS.

- [ ] **Step 5: Run** `npm run seed:gtfs` (a ~300 MB download, about a minute). Expected:
  - The row count equals the `gtfs_stops` count (92,474 on 2026-10-22, or the new count).
  - Σ `am_peak_departures` over stops inside Blacktown equals Blacktown's `GTFS_FREQUENCY.amPeakDepartures`.

- [ ] **Step 6: Commit** `feat(gtfs): persist per-stop AM-peak departures`

---

### Task 5: Catchment engine

**Files:**
- Create: `src/lib/catchments.ts`, `scripts/build-catchments.ts`
- Modify: `package.json` (add a `"build:catchments": "tsx scripts/build-catchments.ts"` script)
- Test: `src/__tests__/catchments.test.ts`

**Interfaces:**
- Produces:

  ```ts
  export const CATCHMENT_RADIUS_M: Record<'train' | 'metro' | 'ferry' | 'lightRail' | 'bus', number>
  export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number          // haversine, R = 6,371,008.8 m
  export interface CatchmentStop { lat: number; lng: number; mode: keyof typeof CATCHMENT_RADIUS_M; amPeakDepartures: number }
  export function buildStopIndex(stops: CatchmentStop[], cellDeg?: number): StopIndex                 // default cellDeg 0.01
  export function coverage(index: StopIndex, lat: number, lng: number): { frequent: boolean; any: boolean }
  export interface CatchmentShare { persons: number; frequentPersons: number; anyPersons: number; frequentShare: number | null; anyShare: number | null }
  export function catchmentShares(blocks: { key: string; persons: number; lat: number; lng: number }[], index: StopIndex): Map<string, CatchmentShare>  // grouped by key
  ```

- [ ] **Step 1: Write failing tests**

  ```ts
  expect(distanceM(-33.8688, 151.2093, -33.8688, 151.2093)).toBe(0);
  expect(distanceM(-33.8688, 151.2093, -33.8778, 151.2093)).toBeCloseTo(1000.8, 0);   // 0.009° of latitude
  test('frequent bus stop: 390 m in, 410 m out', ...)
  test('frequent train stop: 790 m in', ...)
  test('a stop with 7 departures counts for any-service but not frequent', ...)
  test('a stop with 0 departures counts for neither', ...)
  test('stops from any LGA count', ...)              // the block's key is an lga_a SA2; the only stop sits across the border → covered
  test('shares are persons-weighted and null when persons = 0', ...)
  test('index search matches a brute-force scan on 500 random points', ...)   // seeded random generator
  ```

- [ ] **Step 2: Run** `npx jest src/__tests__/catchments.test.ts`. Expected: FAIL. **Step 3:** implement. **Step 4:** run. Expected: PASS.

- [ ] **Step 5: Implement the script**

  - Join `gtfs_stops` with `gtfs_stop_frequency`, mapping `mode` to the radius key. Log and skip unknown modes.
  - **Abort** with "Run `npm run seed:gtfs` first" when `gtfs_stop_frequency` is empty.
  - Compute shares by `sa2_code`, writing `sa2_cache` dataset `CATCHMENT`.
  - Compute shares by `lga_id`, writing `tfnsw_cache` dataset `CATCHMENT_COVERAGE` under the LGA's ABS code.
  - Also compute pooled shares for Greater Sydney and NSW, written under the `benchmark_gsy` and `benchmark_nsw` codes, as `seed-gtfs` does.

- [ ] **Step 6: Run** `npm run build:catchments`. Expected:
  - It finishes in under 2 minutes for about 120k mesh blocks.
  - `lga_sydney` frequent share is above 90%.
  - The NSW pooled frequent share is between 30% and 80%.
  - Print these numbers.

- [ ] **Step 7: Commit** `feat(catchments): straight-line walking catchments by SA2 and LGA`

---

### Task 6: SA2 needs file and LGA catchment indicators

**Files:**
- Modify: `src/lib/needs/types.ts`.
  - `IndicatorId` gains `frequent_service_catchment` and `any_service_catchment`.
  - `IndicatorDef` gains `levels: ('lga' | 'sa2')[]` and `scored: boolean`.
- Modify: `src/lib/needs/indicators.ts`.
  - The two new indicators are transport, ↓, `ratio` (frequentPersons ÷ persons × 100), source "ABS Mesh Block Counts 2021 + TfNSW GTFS (straight-line)".
  - Set `frequent_stop_share.scored = false`.
  - Set `levels` per the spec.
- Modify: `src/lib/needs/scoring.ts`. Skip unscored indicators in domain scores, and skip domains with no scored indicators at the record's level.
- Modify: `src/lib/data/live-data.ts`. Attach `catchment?: { frequentShare: number | null; anyShare: number | null; persons: number; frequentPersons: number; anyPersons: number }` to `TransportData`, from `tfnsw_cache` `CATCHMENT_COVERAGE`.
- Modify: `src/lib/needs/extract.ts`.
- Create: `src/lib/needs/sa2.ts`, `scripts/build-sa2-needs.ts`
- Modify: `package.json`. Add `"build:sa2-needs"`, and chain `build:needs` to run after `build:catchments` in the docs.
- Generate: `public/data/sa2-needs.json`; regenerate `src/lib/data/needs-indicators-data.ts`.
- Test: `src/__tests__/needs-sa2.test.ts`, plus updates to `needs-indicators.test.ts` and `needs-scoring.test.ts`

**Interfaces:**
- Produces:

  ```ts
  export interface Sa2Record { sa2Code: string; name: string; population: number; lowPopulation: boolean; primaryLgaId: string | null; lgaShares: { lgaId: string; share: number }[]; values: Partial<Record<IndicatorId, IndicatorValue>> }
  export interface Sa2NeedsFile { generatedAt: string; records: Sa2Record[] }
  export function extractSa2Indicators(cached: Record<string, unknown>): Partial<Record<IndicatorId, IndicatorValue>>   // reuses the LGA formulas over the decoded SA2 datasets
  export function sa2sForLgas(file: Sa2NeedsFile, lgaIds: string[], minShare?: number): Sa2Record[]   // default 0.10; deduped; sorted by name
  export function assessSa2s(file: Sa2NeedsFile, sa2Codes: string[]): AreaAssessment[]               // peers = all records with lowPopulation false; universe 'nsw'; universeLabel 'NSW SA2s'
  ```

- [ ] **Step 1: Write failing tests**

  ```ts
  test('registry: catchment indicators scored, frequent_stop_share unscored', ...)
  test('unscored indicators are ignored by domain scores', ...)
  test('SA2 assessments have no growth domain', ...)          // domains.map(d => d.domain) equals ['transport', 'socio']
  test('low-population SA2s are excluded from peers and get null percentiles', ...)
  test('sa2sForLgas applies the 10% share threshold and dedupes', ...)   // SA2 with {a: .85, b: .15} appears once for [a, b] and once for [b]; SA2 with {a: .95, b: .05} is absent for [b]
  test('snapshot: catchment coverage for all LGAs', () => { /* frequent_service_catchment non-null for 128 records */ });
  ```

- [ ] **Step 2: Run** `npx jest src/__tests__/needs-sa2.test.ts src/__tests__/needs-indicators.test.ts src/__tests__/needs-scoring.test.ts`. Expected: FAIL. **Step 3:** implement. **Step 4:** run. Expected: PASS.

- [ ] **Step 5: Re-evaluate the mismatch predictor** (Part B, Task 14)

  - Compute the metro R² with `frequent_service_catchment` as the predictor and compare it with `frequent_stop_share`.
  - Switch `expectedCarDependencyModel`'s metro predictor only if R² improves by ≥ 0.05. Update the `LinearFit['predictor']` union, the chart axis title and the sentence template.
  - Record both R² values in the commit message.

- [ ] **Step 6: Run** `npm run build:sa2-needs && npm run build:needs && npm test`. Expected:
  - `public/data/sa2-needs.json` holds 644 records and is under 600 KB.
  - Every test passes.

- [ ] **Step 7: Commit** `feat(needs): SA2 needs file and catchment indicators`

---

### Task 7: Drill-down on `/needs` and in Word

**Files:**
- Create: `src/hooks/useSa2Needs.ts`, `src/components/needs/Sa2NeedsMap.tsx`, `src/components/needs/Sa2RankingTable.tsx`, `src/components/needs/CatchmentChart.tsx`
- Modify: `src/lib/needs/narrative.ts` (add a `'pockets'` section), `src/lib/needs/types.ts`, `src/app/needs/page.tsx`, `src/lib/needs/docx-export.ts`
- Modify: `CLAUDE.md`
  - Commands: `fetch:sa2-boundaries`, `seed:sa2`, `seed:mesh-blocks`, `build:catchments`, `build:sa2-needs`, and the run order.
  - SQLite schema: `sa2_cache`, `mesh_blocks`, `gtfs_stop_frequency`, and `CATCHMENT_COVERAGE` in `tfnsw_cache`.
  - Data Sources rows for the ABS ArcGIS services and Mesh Block Counts.
- Test: `src/__tests__/needs-narrative.test.ts`, `src/__tests__/needs-docx.test.ts`

**Interfaces:**
- `useSa2Needs(): { file: Sa2NeedsFile | null; error: Error | null; isLoading: boolean }`. It uses SWR on `/data/sa2-needs.json`.
- `buildNarrative(a, sa2?: { file: Sa2NeedsFile })` adds a `pockets` section after the domain sections when `sa2` is given.

- [ ] **Step 1: Write failing tests**

  ```ts
  // pockets, exact:
  'Within Blacktown, Mount Druitt - Whalan, Lethbridge Park - Tregear and Blackett - Dharruk are in the highest-need 10% of NSW SA2s.'
  'No SA2 in Mosman is in the highest-need 10% of NSW SA2s.'
  test('pocket sentences cite the SA2 sources', ...)
  test('combined mode writes one pockets paragraph per member LGA', ...)
  test('docx includes the pockets section and a straight-line note in the catchment caption', ...)
  ```

  The SA2 names come from a hand-built fixture file, not from real rankings.

- [ ] **Step 2: Run** `npx jest src/__tests__/needs-narrative.test.ts src/__tests__/needs-docx.test.ts`. Expected: FAIL. **Step 3:** implement. **Step 4:** run. Expected: PASS.

- [ ] **Step 5: Build the UI** in a new "Areas within the selection" section after the domain narratives:

  - **`Sa2NeedsMap`:** `dynamic(..., { ssr: false })`.
    - Shows SA2s from `sa2sForLgas`, coloured by overall percentile with `needColor`, plus the selected LGAs' outlines.
    - Low-population SA2s are hatched or grey.
    - The tooltip shows the name, score and LGA share.
  - **`Sa2RankingTable`:** the top 10 SA2s by overall score, with columns SA2, LGA (share), overall band, transport score, socio score, and the frequent catchment %.
  - **`CatchmentChart`:** bars of frequent and any-service catchment % per selected LGA, with Greater Sydney and NSW reference lines. The caption includes "straight-line distance".
  - The pockets narrative block.
  - Show a loading skeleton while the SA2 file loads. If the fetch fails, show a notice and keep the rest of the page working.
  - All figures register with `FigureRegistry`, so the docx picks them up.

- [ ] **Step 6: Verify in the running app**
  - `/needs?lgas=lga_blacktown`: the SA2 map shows Blacktown's SA2s; the table lists 10; the catchment chart shows Blacktown against the benchmarks.
  - `/needs?lgas=lga_blacktown,lga_penrith&mode=combined`: SA2s straddling the boundary appear once.
  - The Word export contains the drill-down figures and the pockets text.
  - `npm test && npm run build` both pass.

- [ ] **Step 7: Commit** `feat(needs): SA2 drill-down, pockets narrative and catchments in page and Word`

---

## Follow-ups (Phase 3 candidates)

- Network walking distances on OpenStreetMap paths, in place of straight-line.
- Jobs reachable within 45 minutes by public transport (r5 / OpenTripPlanner with GTFS, OpenStreetMap and TZP24 travel-zone jobs).
- SA2 population projections, if NSW DPE publishes them for the current series.
- Refresh after the 2026 Census release (expected from mid-2027).
