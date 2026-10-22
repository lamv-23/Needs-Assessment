# LGA Needs Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/needs` page that assesses need for one or more NSW LGAs. It ranks each LGA against NSW, Greater Sydney, its region or similar LGAs; adds deeper insights (expected-vs-actual car dependency, trends, growth vs service, jobs–housing); generates cited written findings; and exports report-ready figures and an editable Word document.

**Structure:**
- **Part A (Tasks 1–11)** delivers the scored assessment, the page and the Word export.
- **Part B (Tasks 12–16)** adds the insights layer on top.
- **Phase 2** (SA2 data and walking catchments) is a separate plan: `docs/superpowers/plans/2026-10-22-sa2-catchments.md`.

**Architecture:**
- A build script turns the live SQLite-backed data (`getLive*Data`) into a small bundled snapshot of 16 indicators × 128 LGAs, plus each LGA's density and peer group.
- Pure modules under `src/lib/needs/` do the scoring, aggregation and narrative. They run client-side over the snapshot, so ranking never fetches 128 payloads.
- The page reads its selection from the URL and renders charts through an extended `ChartWrapper` that registers each figure for Word export via the `docx` package.

**Tech Stack:** Next.js 14 App Router, TypeScript, Recharts, Leaflet (`ChoroplethMapDirect`), Zustand (unchanged), Jest + ts-jest (node env), `docx` (new), `mapshaper` (new, dev).

**Spec:** `docs/superpowers/specs/2026-10-22-lga-needs-assessment-design.md` (indicator table, scoring rules, narrative rules).

## Global Constraints

- Every page is `'use client'`. Maps use `dynamic(() => import(...), { ssr: false })`. Charts use `CHART_COLORS` from `@/lib/utils`, except the sequential need scale defined in Task 8.
- Path alias `@/` → `src/`. Tests live in `src/__tests__/needs-*.test.ts`. Jest runs in the node env, so DOM and React code is verified in the running app, not in Jest.
- Missing values stay `null` end to end and render as **"No data"**. Never coerce to 0. `/compare`'s `?? 0` pattern is the bug to avoid.
- Need percentile is the mid-rank `(countLess + 0.5 × countEqual) ÷ n × 100` in "more need" order.
- Bands: ≥ 80 `Very high` · ≥ 60 `High` · ≥ 40 `Moderate` · < 40 `Lower`. Key need = percentile ≥ 80.
- A domain score is `null` when fewer than half of its indicators have values. A universe with n < 5 is `smallGroup`.
- The generated data files carry an `// Auto-generated … Do not edit by hand` header, like `greater-sydney-benchmark.ts`.
- Leave `scripts/build-fallbacks.ts`, `official-fallback-data.ts` and the header `AreaSelector` behaviour unchanged.

## Review Focus

1. **An LGA with no value for an indicator** (no GTFS stops, no crash rows, no HTS). Show "No data", exclude it from the scores, and list it in Data notes. Never show 0. *Pinned in Task 3 (`null value → null percentile`) and Task 5 (missing-data note).*
2. **A combined selection that includes non-additive indicators** (SEIFA, commute distance, car dependency, unemployment). Label the value approximate in the table, the narrative and the docx. *Pinned in Task 4 (`approximate` list) and Task 11 (docx shows "≈").*
3. **A bad URL:** an unknown id, a suburb or SA2 id, a duplicate, an empty `lgas`. Drop invalid ids with a visible notice, and show the empty state rather than silently falling back to `lga_sydney` the way `sample-data.ts` does. *Pinned in Task 6 (parse tests) and Task 4 (`invalidIds`).*
4. **2021 Census lockdown distortion of work from home.** Car dependency excludes WFH from the denominator, and the WFH caveat appears whenever car dependency is shown. *Pinned in Task 1 (formula test) and Task 5 (caveat test).*
5. **A large or small selection:**
   - All 34 Greater Sydney LGAs must keep every figure readable. The heatmap scrolls horizontally, and the strip plot labels at most `MAX_LABELLED = 12`.
   - Central Coast, the only region with fewer than 5 LGAs (it has 1), shows the small-group caveat when ranked by region.
   - **Worktree base:** branch from local `main`, not `origin/main`. On 2026-10-22, `origin/main` was 19 commits behind and lacked `transport-service-demand.ts`, so service frequency read as missing for every LGA.
   - *Pinned in Task 3 (`smallGroup`), Task 5 (caveat) and Task 8 (`labelledIds` cap).*

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/needs/types.ts` | Shared types: indicators, records, snapshot, assessment, narrative |
| `src/lib/needs/indicators.ts` | `INDICATORS` registry plus `DOMAIN_LABELS` |
| `src/lib/needs/peer-groups.ts` | Peer-group rules and labels |
| `src/lib/needs/insights.ts` | Part B: model fits, mismatch, trends, growth vs service, jobs–housing, insight ranking |
| `src/lib/needs/extract.ts` | Live domain data → indicator values for one LGA |
| `scripts/build-needs-indicators.ts` | Writes the snapshot from `data/cache.db` |
| `src/lib/data/needs-indicators-data.ts` | Generated `NEEDS_SNAPSHOT` |
| `src/lib/needs/scoring.ts` | Percentiles, universes, domain and overall scores, bands |
| `src/lib/needs/aggregate.ts` | Combined-selection and benchmark aggregation |
| `src/lib/needs/assess.ts` | `runAssessment` orchestration |
| `src/lib/needs/narrative.ts` | Deterministic cited findings |
| `src/lib/needs/format.ts` | Value, diff and universe-label formatting, shared by the UI, narrative and docx |
| `src/lib/needs/selection.ts` | URL param parse/serialize |
| `src/lib/needs/docx-export.ts` | Word document builder |
| `src/hooks/useNeedsSelection.ts` | URL-backed selection hook |
| `src/components/needs/*` | `LgaMultiSelect`, `FigureRegistry`, `CopyTextButton`, charts, `NeedsMap`, `IndicatorTable`, `NarrativeBlock` |
| `src/components/charts/ChartWrapper.tsx` | Gains `caption`, `figureId`, SVG download |
| `src/app/needs/page.tsx` | The page |

---

### Task 1: Indicator registry and extractor

**Files:**
- Create: `src/lib/needs/types.ts`, `src/lib/needs/indicators.ts`, `src/lib/needs/extract.ts`
- Create: `src/__tests__/fixtures/needs.ts`
- Modify: `src/lib/data/sample-data.ts`. Add `indigenousPopulation?: number` to `DemographicsData`.
- Modify: `src/lib/data/live-data.ts`. In `getLiveDemographicsData`, set the new field from G01's `indigenousPopulation` and push `'indigenousPopulation'` to `liveFields`.
- Test: `src/__tests__/needs-indicators.test.ts`

**Interfaces:**
- Consumes: `DemographicsData`, `TransportData`, `EconomyData`, `GrowthData` from `@/lib/data/sample-data`.
- Produces (in `types.ts`):

  ```ts
  export type NeedDomain = 'transport' | 'socio' | 'growth';
  export type IndicatorId =
    | 'car_dependency' | 'zero_car_households' | 'frequent_stop_share' | 'am_peak_departures_per_1000'
    | 'commute_distance_km' | 'crash_rate' | 'seifa_irsd' | 'unemployment_rate' | 'low_income_households'
    | 'needs_assistance' | 'limited_english' | 'older_residents' | 'indigenous_share'
    | 'pop_growth_2041' | 'job_growth_2041' | 'approvals_per_1000';
  export type PeerGroup = 'metro_inner' | 'metro_middle' | 'metro_outer' | 'regional_city' | 'regional_town' | 'rural';
  export interface SourceRef { short: string; full: string; url?: string }
  export interface IndicatorDef {
    id: IndicatorId; domain: NeedDomain; label: string;
    unit: '%' | 'km' | 'per 1,000' | 'per 10,000' | 'score';
    direction: 'higher' | 'lower';            // which value means MORE need
    aggregation: 'ratio' | 'weighted';        // ratio: Σnum/Σden×scale; weighted: population-weighted mean
    scale: number;                            // 100, 1000, 10000, or 1 for weighted
    decimals: number;
    source: SourceRef;
  }
  export interface IndicatorValue { value: number | null; numerator?: number; denominator?: number }
  export interface LgaIndicatorRecord {
    areaId: string; name: string; region: string; population: number;
    densityPerKm2: number; peerGroup: PeerGroup;
    values: Record<IndicatorId, IndicatorValue>;
  }
  export interface NeedsSnapshot { generatedAt: string; records: LgaIndicatorRecord[] }
  export interface LiveBundle { demographics: DemographicsData; transport: TransportData; economy: EconomyData; growth: GrowthData }
  ```

- Produces:
  - `INDICATORS: IndicatorDef[]`, in the spec table's order.
  - `INDICATOR_BY_ID: Record<IndicatorId, IndicatorDef>`.
  - `DOMAIN_LABELS: Record<NeedDomain, string>` = `{ transport: 'Transport disadvantage', socio: 'Socio-economic disadvantage', growth: 'Growth pressure' }`.
  - `extractIndicators(bundle: LiveBundle): Record<IndicatorId, IndicatorValue>`.

- [ ] **Step 1: Write fixtures and failing tests**

  `fixtures/needs.ts` exports `makeBundle(overrides?: DeepPartial<LiveBundle>): LiveBundle`. Its defaults are Blacktown-like:
  - `totalPopulation` 400000
  - journeyToWork: Car (driver) 47, Car (passenger) 4.1, Work from home 39
  - `vehicleOwnershipRaw`: `noCar` 8045, `totalDwellings` 119420
  - `seifaScore` 987
  - `unemploymentRate` 5.8
  - `lowIncomeHouseholds` 10967, with a `householdIncomeDistribution` whose counts sum to 120000
  - `needsAssistance` 21032
  - `limitedEnglish` 20903
  - `ageDistribution` including `{ ageGroup: '65-74', male: 13000, female: 14000 }` and `{ ageGroup: '75+', male: 7000, female: 6000 }`
  - `indigenousPopulation` 11812
  - `populationHistory` [{2021, 400000}]
  - `populationProjections` [{2041, 600000}]
  - `employmentGrowth` [{2021, 140000}, {2041, 210000}]
  - `rollingAnnualApprovals` 4000
  - `ptFrequency` `{ frequentStops: 50, totalStops: 200, frequentStopShare: 25, departuresPer1000Residents: 12, … }`
  - `commuteDistance2016` `{ avgKm: 18.2, medianKm: 12 }`
  - `crashTrend` [{2022, totalCrashes: 900}, {2023, totalCrashes: 1000}]

  ```ts
  test('registry has 16 indicators with unique ids and a source each', ...)
  test('older residents and Indigenous share', () => {
    const v = extractIndicators(makeBundle());
    expect(v.older_residents).toMatchObject({ value: 10, numerator: 40000, denominator: 400000 });
    expect(v.indigenous_share.value).toBeCloseTo(2.95, 2);
    expect(extractIndicators(makeBundle({ demographics: { indigenousPopulation: undefined } })).indigenous_share.value).toBeNull();
  });
  test('car_dependency excludes work from home from the denominator', () => {
    expect(extractIndicators(makeBundle()).car_dependency.value).toBeCloseTo(51.1 / 61 * 100, 1); // 83.8
  });
  test('ratio indicators carry numerator and denominator', () => {
    const v = extractIndicators(makeBundle());
    expect(v.zero_car_households).toEqual({ value: expect.closeTo(6.74, 2), numerator: 8045, denominator: 119420 });
    expect(v.frequent_stop_share).toMatchObject({ value: 25, numerator: 50, denominator: 200 });
    expect(v.pop_growth_2041).toMatchObject({ value: 50, numerator: 200000, denominator: 400000 });
    expect(v.job_growth_2041.value).toBe(50);
    expect(v.crash_rate.value).toBe(25);           // latest year 2023: 1000 / 400000 × 10,000
    expect(v.approvals_per_1000.value).toBe(10);
    expect(v.low_income_households.value).toBeCloseTo(9.14, 2);
  });
  test('missing sources yield null, never 0', () => {
    const v = extractIndicators(makeBundle({ transport: { ptFrequency: undefined, crashTrend: [], commuteDistance2016: undefined } }));
    expect(v.frequent_stop_share.value).toBeNull();
    expect(v.am_peak_departures_per_1000.value).toBeNull();
    expect(v.crash_rate.value).toBeNull();
    expect(v.commute_distance_km.value).toBeNull();
  });
  test('pop growth falls back to the 2021 projection when history lacks 2021', ...)
  ```

- [ ] **Step 2: Run** `npx jest src/__tests__/needs-indicators.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `indicators.ts` and `extract.ts`**

  - `INDICATORS` copies the definition, direction and source of each row in the spec table.
  - `aggregation` is `weighted` for `car_dependency`, `commute_distance_km`, `seifa_irsd` and `unemployment_rate`, and `ratio` for the rest.
  - Find journey-to-work entries by name: `'Car (driver)'`, `'Car (passenger)'`, `'Work from home'`.
  - Growth base = `populationHistory` year 2021, else `populationProjections` year 2021. Growth target = projections year 2041.
  - Crash rate uses the latest `crashTrend` year that has `totalCrashes`.
  - A zero or missing denominator gives `{ value: null }`.
  - Older residents = the sum of `male + female` over the `'65-74'` and `'75+'` age groups.
  - **Before wiring `indigenousPopulation`, check the G01 decoder's `get('A_T', '3')` against the C21_G01_LGA PCHAR codelist** (`/rest/dataflow/ABS/C21_G01_LGA?references=all&detail=referencepartial`). Confirm Blacktown's cached value against ABS QuickStats 2021 (Aboriginal and/or Torres Strait Islander people). If the code is wrong, fix `decodeG01` and add a case to `src/__tests__/abs-decoders*.test.ts`.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Commit** `feat(needs): indicator registry and extractor`

---

### Task 2: Snapshot builder and generated data

**Files:**
- Create: `scripts/build-needs-indicators.ts`, `src/lib/data/needs-indicators-data.ts` (generated)
- Create: `src/lib/needs/peer-groups.ts`
- Modify: `package.json`. Add a `"build:needs": "tsx scripts/build-needs-indicators.ts"` script, and `npm i -D @turf/area` (same major as the installed `@turf/helpers`).
- Modify: `CLAUDE.md`. Add `npm run build:needs` under Commands, and note under Admin Panel: "run after `build:fallbacks`".
- Test: `src/__tests__/needs-snapshot.test.ts`

**Interfaces:**
- Consumes: `extractIndicators` from Task 1; `getLive*Data` from `@/lib/data/live-data`; `SAMPLE_AREAS` filtered to `type === 'lga'`.
- Produces:
  - `export const NEEDS_SNAPSHOT: NeedsSnapshot` in `src/lib/data/needs-indicators-data.ts`.
  - In `peer-groups.ts`:

    ```ts
    export const PEER_GROUP_LABELS: Record<PeerGroup, string>    // 'Inner metropolitan', 'Middle metropolitan', 'Outer metropolitan', 'Regional city', 'Regional town', 'Rural and remote'
    export const PEER_GROUP_PLURALS: Record<PeerGroup, string>   // 'inner metropolitan LGAs', 'middle metropolitan LGAs', 'outer metropolitan LGAs', 'regional cities', 'regional towns', 'rural and remote LGAs'
    export function peerGroupFor(input: { areaId: string; population: number; densityPerKm2: number }): PeerGroup
    ```

    The rules are in the spec's peer-group table. `metro` means `GREATER_SYDNEY_GCCSA_AREA_IDS.includes(areaId)`. The thresholds are 3,000 and 1,000 people/km² for metro, and 50,000 and 15,000 residents for non-metro.

- [ ] **Step 1: Write the failing snapshot test**

  ```ts
  test('peerGroupFor boundaries', () => {
    expect(peerGroupFor({ areaId: 'lga_sydney', population: 1, densityPerKm2: 3000 })).toBe('metro_inner');
    expect(peerGroupFor({ areaId: 'lga_sydney', population: 1, densityPerKm2: 2999 })).toBe('metro_middle');
    expect(peerGroupFor({ areaId: 'lga_blacktown', population: 1, densityPerKm2: 999 })).toBe('metro_outer');
    expect(peerGroupFor({ areaId: 'lga_newcastle', population: 50000, densityPerKm2: 9999 })).toBe('regional_city');
    expect(peerGroupFor({ areaId: 'lga_newcastle', population: 15000, densityPerKm2: 1 })).toBe('regional_town');
    expect(peerGroupFor({ areaId: 'lga_bourke', population: 14999, densityPerKm2: 0.1 })).toBe('rural');
  });
  test('every peer group in the snapshot has at least 5 LGAs and Central Coast is outer metro', () => {
    const counts = countBy(NEEDS_SNAPSHOT.records, r => r.peerGroup);
    expect(Object.values(counts).every(n => n >= 5)).toBe(true);
    expect(NEEDS_SNAPSHOT.records.find(r => r.areaId === 'lga_central_coast')!.peerGroup).toBe('metro_outer');
  });
  test('snapshot covers all 128 LGAs with name, region and population', () => {
    expect(NEEDS_SNAPSHOT.records).toHaveLength(128);
    for (const r of NEEDS_SNAPSHOT.records) { expect(r.region).toBeTruthy(); expect(r.population).toBeGreaterThan(0); }
  });
  test('core Census indicators are present for every LGA', () => {
    for (const id of ['seifa_irsd', 'zero_car_households', 'car_dependency', 'unemployment_rate'] as const)
      expect(NEEDS_SNAPSHOT.records.filter(r => r.values[id].value === null)).toEqual([]);
  });
  test('Blacktown matches the cache', () => {
    const b = NEEDS_SNAPSHOT.records.find(r => r.areaId === 'lga_blacktown')!;
    expect(b.values.seifa_irsd.value).toBe(987);
    expect(b.values.zero_car_households.value).toBeCloseTo(6.7, 1);
    expect(b.values.car_dependency.value).toBeCloseTo(83.8, 1);
    expect(b.values.frequent_stop_share.value).toBeCloseTo(27.9, 1);
    expect(b.peerGroup).toBe('metro_outer');
  });
  ```

- [ ] **Step 2: Run** `npx jest src/__tests__/needs-snapshot.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement the script**

  - Mirror `build-fallbacks.ts`: call `getLiveDemographicsData`, `getLiveTransportData`, `getLiveEconomyData` and `getLiveGrowthData` with year 2021 for each LGA.
  - Pass the four `.data` objects to `extractIndicators`, and build each record from the `Area` and `demographics.totalPopulation`.
  - Area (km²) = `@turf/area` of the matching feature in `public/geo/lga-nsw.json` (match on `properties.id`) ÷ 1e6.
    - `densityPerKm2` = population ÷ area, unrounded. Do not use the bundled `populationDensity`: it is an integer, and 34 rural LGAs read as 0.
    - Fail loudly if any LGA has no feature.
  - `peerGroup` = `peerGroupFor(...)`.
  - Write the file with the auto-generated header, `generatedAt: new Date().toISOString()`, and pretty JSON. Target: under 150 KB.
  - Print a coverage line per indicator (for example `frequent_stop_share 128/128`) and a count per peer group.

- [ ] **Step 4: Run** `npm run build:needs`, then the test. Expected, matching the 2026-10-22 probe of the cache:
  - The script prints 128 records.
  - Census indicators: 128/128.
  - `frequent_stop_share` and `am_peak_departures_per_1000`: 128 (17 LGAs have 0 departures, which is a real value, not missing).
  - `crash_rate`: 128. `commute_distance_km`: about 127. `pop_growth_2041`: 123. **`job_growth_2041`: about 29** (see Task 12).
  - Peer groups are close to 6 / 13 / 15 / 19 / 23 / 52.
  - The tests PASS.

- [ ] **Step 5: Commit** `feat(needs): bundled indicator snapshot for all LGAs` (include the generated file).

---

### Task 3: Scoring engine

**Files:**
- Create: `src/lib/needs/scoring.ts`
- Modify: `src/lib/needs/types.ts`
- Test: `src/__tests__/needs-scoring.test.ts`

**Interfaces:**
- Consumes: `INDICATORS`, `LgaIndicatorRecord`, `NEEDS_SNAPSHOT`; `GREATER_SYDNEY_GCCSA_AREA_IDS` from `@/lib/data/sample-areas`.
- Produces (types):

  ```ts
  export type Universe = 'nsw' | 'gsyd' | 'region' | 'peer';
  export type NeedBand = 'Very high' | 'High' | 'Moderate' | 'Lower';
  export interface IndicatorScore { id: IndicatorId; value: number | null; percentile: number | null; keyNeed: boolean; approximate: boolean; partial: boolean }
  export interface DomainScore { domain: NeedDomain; score: number | null; band: NeedBand | null; available: number; total: number }
  export interface AreaAssessment {
    areaId: string; name: string; region: string; population: number; peerGroup: PeerGroup | null;  // null for a multi-group combined area
    universe: Universe; universeLabel: string; universeSize: number; smallGroup: boolean;
    indicators: IndicatorScore[]; domains: DomainScore[]; overall: number | null; band: NeedBand | null;
  }
  ```

- Produces (functions):
  - `needPercentile(value: number, distribution: number[], direction: 'higher' | 'lower'): number`
  - `bandFor(score: number): NeedBand`
  - `universeRecords(records: LgaIndicatorRecord[], universe: Universe, target?: { region: string; peerGroup: PeerGroup | null }): LgaIndicatorRecord[]`
  - `universeLabelFor(universe: Universe, target?: { region: string; peerGroup: PeerGroup | null }): string`. This is a plural noun phrase used verbatim in sentences: `'NSW LGAs'`, `'Greater Sydney LGAs'`, `` `LGAs in the ${region} region` ``, or `PEER_GROUP_PLURALS[peerGroup]`.
  - `type AssessableRecord = Omit<LgaIndicatorRecord, 'peerGroup'> & { peerGroup: PeerGroup | null }` (in `types.ts`)
  - `assessRecord(target: AssessableRecord, universe: Universe, peers: LgaIndicatorRecord[], flags?: { approximate?: IndicatorId[]; partial?: IndicatorId[] }): AreaAssessment`

- [ ] **Step 1: Write failing tests**

  ```ts
  expect(needPercentile(5, [1,2,3,4,5], 'higher')).toBe(90);
  expect(needPercentile(1, [1,2,3,4,5], 'lower')).toBe(90);
  expect(needPercentile(3, [3,3,3,3], 'higher')).toBe(50);
  expect([bandFor(80), bandFor(79.9), bandFor(60), bandFor(40), bandFor(39.9)]).toEqual(['Very high','High','High','Moderate','Lower']);
  test('null value → null percentile, not key need', ...)
  test('domain score is null when fewer than half its indicators have values', ...) // transport: 2 of 6 → null; 3 of 6 → mean of the 3
  test('overall is the mean of non-null domain scores', ...)
  test('keyNeed when percentile >= 80', ...)
  test('universes from the real snapshot', () => {
    expect(universeRecords(NEEDS_SNAPSHOT.records, 'nsw')).toHaveLength(128);
    expect(universeRecords(NEEDS_SNAPSHOT.records, 'gsyd')).toHaveLength(34);
    const hunter = universeRecords(NEEDS_SNAPSHOT.records, 'region', { region: 'Hunter', peerGroup: null });
    expect(hunter.every(r => r.region === 'Hunter')).toBe(true);
    const outer = universeRecords(NEEDS_SNAPSHOT.records, 'peer', { region: 'Greater Sydney', peerGroup: 'metro_outer' });
    expect(outer.every(r => r.peerGroup === 'metro_outer')).toBe(true);
  });
  test('universe labels', () => {
    expect(universeLabelFor('nsw')).toBe('NSW LGAs');
    expect(universeLabelFor('region', { region: 'Hunter', peerGroup: null })).toBe('LGAs in the Hunter region');
    expect(universeLabelFor('peer', { region: 'Hunter', peerGroup: 'regional_city' })).toBe('regional cities');
  });
  test('smallGroup when the universe has fewer than 5 LGAs', ...)
  ```

- [ ] **Step 2: Run** `npx jest src/__tests__/needs-scoring.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

  - `assessRecord` sets `universeLabel` from `universeLabelFor`.
  - The distribution for each indicator is the peers' non-null values.
  - Leave percentiles unrounded; round only in `format.ts`.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Commit** `feat(needs): percentile scoring, domains and bands`

---

### Task 4: Aggregation and `runAssessment`

**Files:**
- Create: `src/lib/needs/aggregate.ts`, `src/lib/needs/assess.ts`
- Modify: `src/lib/needs/types.ts`
- Test: `src/__tests__/needs-assess.test.ts`

**Interfaces:**
- Consumes: Task 3 functions and types; `NEEDS_SNAPSHOT`.
- Produces:

  ```ts
  export type AggregatedRecord = AssessableRecord & { memberIds: string[]; approximate: IndicatorId[]; partial: IndicatorId[] }
  export type NeedsMode = 'separate' | 'combined';
  export interface NeedsAssessment {
    mode: NeedsMode; universe: Universe; universeFallback: boolean;
    areas: AreaAssessment[];                 // one per LGA, or exactly one when combined
    memberIds: string[]; invalidIds: string[];
    benchmarks: { gsyd: AreaAssessment; nsw: AreaAssessment };
    benchmarkRecords: { gsyd: AggregatedRecord; nsw: AggregatedRecord };
    records: LgaIndicatorRecord[];           // the full snapshot, for strip plots and the map
    generatedAt: string;
  }
  export function aggregateRecords(members: LgaIndicatorRecord[], name: string, areaId: string): AggregatedRecord
  export function combinedName(names: string[]): string          // ≤3 → joined with ' + ', else `${n} LGAs`
  export function runAssessment(input: { snapshot: NeedsSnapshot; areaIds: string[]; mode: NeedsMode; universe: Universe }): NeedsAssessment
  ```

- [ ] **Step 1: Write failing tests**

  ```ts
  test('ratio indicators aggregate as Σnum/Σden', ...)   // A 10/100, B 90/300 → 25 (not 20)
  test('weighted indicators use population weights and are flagged approximate', ...) // SEIFA 900@100k + 1000@300k → 975; approximate contains 'seifa_irsd'
  test('members missing a value are skipped and the indicator is flagged partial', ...)
  test('all members missing → null', ...)
  test('combinedName', () => {
    expect(combinedName(['Blacktown','Penrith'])).toBe('Blacktown + Penrith');
    expect(combinedName(['A','B','C','D'])).toBe('4 LGAs');
  });
  test('separate mode returns one assessment per valid id and reports invalid ids', () => {
    const a = runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds: ['lga_blacktown','lga_nowhere','lga_penrith'], mode: 'separate', universe: 'nsw' });
    expect(a.areas.map(x => x.areaId)).toEqual(['lga_blacktown','lga_penrith']);
    expect(a.invalidIds).toEqual(['lga_nowhere']);
  });
  test('combined mode returns one area whose population is the sum', ...)
  test('combined + region across two regions falls back to NSW', () => { /* Blacktown + Newcastle → universe 'nsw', universeFallback true */ });
  test('combined + peer across two peer groups falls back to NSW', () => { /* Sydney (inner) + Blacktown (outer) → 'nsw', universeFallback true */ });
  test('combined density is Σpopulation ÷ Σarea', () => { /* A 100k @ 1000/km² + B 100k @ 100/km² → 200k ÷ 1100 km² ≈ 181.8 */ });
  test('separate + region ranks each LGA within its own region', ...)
  test('benchmarks: Greater Sydney aggregates the 34 GCCSA LGAs', ...)
  test('empty areaIds → areas []', ...)
  ```

- [ ] **Step 2: Run** `npx jest src/__tests__/needs-assess.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

  - Benchmarks are assessed against the requested universe. For `region` and `peer`, use `nsw` for the benchmarks.
  - The combined area's `areaId` is `'combined'`.
  - Its `region` is the shared region, or `'Multiple regions'`.
  - Its `peerGroup` is the shared group, or `null`.
  - Its `densityPerKm2` is Σ population ÷ Σ (population ÷ density).
  - Benchmark records get `peerGroup: null`.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Commit** `feat(needs): combined-selection aggregation and runAssessment`

---

### Task 5: Narrative generator

**Files:**
- Create: `src/lib/needs/format.ts`, `src/lib/needs/narrative.ts`
- Modify: `src/lib/needs/types.ts`
- Test: `src/__tests__/needs-narrative.test.ts`

**Interfaces:**
- Consumes: `NeedsAssessment`, `INDICATOR_BY_ID`, `DOMAIN_LABELS`.
- Produces:

  ```ts
  export interface NarrativeParagraph { text: string; citations: SourceRef[] }
  export interface NarrativeSection { id: 'summary' | NeedDomain | 'notes'; heading: string; paragraphs: NarrativeParagraph[] }
  export function formatValue(def: IndicatorDef, value: number | null): string   // null → 'No data'; % → '83.8%'; score → '987'; per 1,000 → '10.0 per 1,000'
  export function formatDiff(def: IndicatorDef, diff: number): string            // % → '12.0 pp'; score → '33 points'; others → value with unit
  export function buildNarrative(a: NeedsAssessment): NarrativeSection[]
  export function narrativeToPlainText(sections: NarrativeSection[]): string     // for copy buttons
  ```

- [ ] **Step 1: Write failing tests with a hand-built `NeedsAssessment`**

  Use one area with: `name` 'Blacktown'; overall 72.4 / band 'High'; universe 'nsw'; `car_dependency` 83.8 at p92; `zero_car_households` at p30; `frequent_stop_share` null; and a GS benchmark `car_dependency` of 66.3.

  ```ts
  expect(summary.paragraphs[0].text).toBe('Blacktown has high overall need (score 72/100, ranked against NSW LGAs).');
  expect(summary.paragraphs[1].text).toBe('Its most pronounced needs are car dependency.');   // key needs only, top 3 by percentile, joined 'a, b and c'
  // key-need sentence in the transport section:
  expect(transport.paragraphs.map(p => p.text)).toContain(
    "Blacktown's car dependency (83.8%) ranks in the highest-need 8% of NSW LGAs, 17.5 pp above the Greater Sydney figure of 66.3%.");
  expect(transport.paragraphs[0].text).toBe('Transport disadvantage: high (score 64/100).');
  test('every key-need sentence cites the indicator source', ...)       // citations[0].short === 'ABS Census 2021 G62'
  test('notes list missing indicators', ...)  // 'No data is available for stops with frequent AM-peak service in Blacktown; this is excluded from the scores.'
  test('notes always include the WFH caveat when car dependency is shown', ...) // exact text below
  test('combined approximate values are noted', ...) // 'Values for SEIFA disadvantage (IRSD) are population-weighted approximations because they cannot be summed across LGAs.'
  test('small group caveat', ...) // 'The comparison group (LGAs in the Central Coast region) has only 1 LGA, so percentiles should be read with caution.' (plural 'LGAs' when n > 1)
  test('no key needs', ...)       // 'No indicator is in the highest-need 20% of NSW LGAs.'
  test('separate mode with 2 areas produces per-area summary paragraphs', ...)
  ```

- [ ] **Step 2: Run** `npx jest src/__tests__/needs-narrative.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement using these fixed templates**

  - `{universeLabel}` is always used verbatim. Never append "LGAs" to it.
  - "Highest-need k%" uses `k = max(1, round(100 − percentile))`.
  - "above/below" is the sign of `value − gsValue`. Omit the Greater Sydney clause when the GS value is null.
  - Domain paragraph 0 is `"{Domain label}: {band lower-case} (score {round}/100)."`, or `"{Domain label}: insufficient data."`.
  - WFH caveat, exact text: "The 2021 Census was held during Sydney's COVID-19 lockdown, which inflated working from home. Car dependency is therefore measured as a share of people who travelled to work."
  - Use the singular or plural form in the missing note: "this is" / "these are".
  - In separate mode, each area's sentences are prefixed by its name as the sentence subject. Do not add sub-headings.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Commit** `feat(needs): deterministic cited narrative`

---

### Task 6: Selection (URL, regions, multi-select)

**Files:**
- Create: `src/lib/needs/selection.ts`, `src/hooks/useNeedsSelection.ts`, `src/components/needs/LgaMultiSelect.tsx`
- Modify: `src/lib/data/sample-areas.ts` (add `NSW_REGIONS` and `lgasInRegion`)
- Modify: `src/components/layout/AreaSelector.tsx` (replace the local `REGION_ORDER` with an import of `NSW_REGIONS`; no behaviour change)
- Test: `src/__tests__/needs-selection.test.ts`

**Interfaces:**
- Produces:

  ```ts
  export const NSW_REGIONS: readonly string[]                       // the 10 names, in AreaSelector's current order
  export function lgasInRegion(region: string): Area[]
  export interface NeedsParams { areaIds: string[]; invalidIds: string[]; mode: NeedsMode; universe: Universe }
  export function parseNeedsParams(params: URLSearchParams): NeedsParams
  export function serializeNeedsParams(p: Pick<NeedsParams, 'areaIds' | 'mode' | 'universe'>): string   // 'lgas=a,b&mode=combined&universe=gsyd'; omits defaults
  export function useNeedsSelection(): NeedsParams & { setAreaIds(ids: string[]): void; setMode(m: NeedsMode): void; setUniverse(u: Universe): void }
  // <LgaMultiSelect selected={string[]} onChange={(ids: string[]) => void} />
  ```

- [ ] **Step 1: Write failing tests**

  ```ts
  const p = parseNeedsParams(new URLSearchParams('lgas=lga_blacktown,lga_blacktown,lga_x,sa2_sydney_cbd&mode=combined&universe=gsyd'));
  expect(p).toEqual({ areaIds: ['lga_blacktown'], invalidIds: ['lga_x','sa2_sydney_cbd'], mode: 'combined', universe: 'gsyd' });
  expect(parseNeedsParams(new URLSearchParams('mode=bogus'))).toEqual({ areaIds: [], invalidIds: [], mode: 'separate', universe: 'nsw' });
  expect(parseNeedsParams(new URLSearchParams('universe=peer')).universe).toBe('peer');
  test('serialize round-trips and omits defaults', ...)
  test('lgasInRegion returns only LGAs of that region', ...)   // Hunter: non-empty, all type 'lga', all region 'Hunter'
  test('NSW_REGIONS covers every LGA region', ...)
  ```
- [ ] **Step 2: Run** `npx jest src/__tests__/needs-selection.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

  - **The hook** uses `useSearchParams`, `useRouter` and `usePathname`, and calls `router.replace(\`${pathname}?${serialize}\`, { scroll: false })`.
  - **`LgaMultiSelect`:**
    - A search input over the LGAs in `SAMPLE_AREAS`.
    - Selected LGAs show as removable chips.
    - A "Add region" menu lists `NSW_REGIONS` and adds every LGA of the chosen region.
    - A "Clear" button.
    - Match the Tailwind styling of `AreaSelector`.

- [ ] **Step 4: Run the tests and** `npx tsc --noEmit`. Expected: PASS, no type errors.

- [ ] **Step 5: Commit** `feat(needs): URL-backed multi-LGA selection with region quick-add`

---

### Task 7: Report figure infrastructure

**Files:**
- Modify: `src/components/charts/ChartWrapper.tsx`
- Create: `src/components/needs/FigureRegistry.tsx`, `src/components/needs/CopyTextButton.tsx`, `src/lib/export/svg-export.ts`

**Interfaces:**
- Produces:

  ```ts
  // ChartWrapper new optional props:
  caption?: string;      // rendered under the chart inside chartRef as 'Figure {n}. {title}. Source: {caption}', so PNG exports include it
  figureId?: string;     // registers with FigureRegistry when inside a provider
  // FigureRegistry.tsx
  export interface RegisteredFigure { id: string; title: string; caption: string; order: number; capture(): Promise<{ png: Uint8Array; widthPx: number; heightPx: number }> }
  export function FigureRegistryProvider(props: { children: React.ReactNode }): JSX.Element
  export function useFigureRegistry(): { register(f: Omit<RegisteredFigure, 'order'>): void; unregister(id: string): void; figures(): RegisteredFigure[]; numberOf(id: string): number | null } | null
  // svg-export.ts
  export function serializeSvg(root: HTMLElement): string | null   // first <svg> under root, cloned, xmlns + explicit width/height set
  ```

- [ ] **Step 1: Implement the registry**

  - `order` is the registration sequence. Figure numbers are the 1-based position in `figures()` sorted by `order`.
  - `capture` renders the chart body with html2canvas at scale 3, and excludes the caption element via `ignoreElements`.
  - ChartWrapper outside a provider behaves exactly as today.

- [ ] **Step 2: Add "Download SVG" to the ChartWrapper menu**

  Show it only when `serializeSvg(chartRef.current)` is non-null. Download as `{slug}.svg`.

- [ ] **Step 3: Add `CopyTextButton`**

  Props: `{ text: string; label?: string }`. Use `navigator.clipboard.writeText`. Show a check icon for 1.5 s. Detect clipboard support after mount, like `ChartWrapper`, to avoid hydration mismatch.

- [ ] **Step 4: Verify**

  - `npx tsc --noEmit && npm run lint` pass.
  - `npm run dev`: on `/transport`, a chart's menu shows "Download SVG", and the downloaded file opens in a browser.
  - Charts without `caption` look unchanged.

- [ ] **Step 5: Commit** `feat(charts): figure captions, SVG download and figure registry`

---

### Task 8: Needs charts

**Files:**
- Create: `src/lib/needs/colors.ts`
- Create: `src/components/needs/NeedsHeatmap.tsx`, `src/components/needs/DomainScoreChart.tsx`, `src/components/needs/NeedsRadar.tsx`, `src/components/needs/IndicatorStripPlot.tsx`
- Test: `src/__tests__/needs-colors.test.ts`

**Interfaces:**
- Consumes: `NeedsAssessment`, `INDICATORS`, `formatValue`, `CHART_COLORS`.
- Produces:

  ```ts
  export const NEED_SCALE: readonly string[]            // 5 sequential steps, low→high need: '#eff6ff','#bfdbfe','#fcd34d','#f97316','#b91c1c'
  export const NO_DATA_COLOR = '#e5e7eb';
  export function needColor(percentile: number | null): string   // [0,20)→0 … [80,100]→4; null→NO_DATA_COLOR
  export const MAX_LABELLED = 12;
  export function labelledIds(selected: string[]): string[]      // first MAX_LABELLED
  // components, all with prop { assessment: NeedsAssessment }; IndicatorStripPlot also takes { indicatorId: IndicatorId }
  ```

- [ ] **Step 1: Write failing tests**

  ```ts
  expect([needColor(0), needColor(19.9), needColor(20), needColor(80), needColor(100), needColor(null)])
    .toEqual([NEED_SCALE[0], NEED_SCALE[0], NEED_SCALE[1], NEED_SCALE[4], NEED_SCALE[4], NO_DATA_COLOR]);
  expect(labelledIds(Array.from({ length: 20 }, (_, i) => `l${i}`))).toHaveLength(12);
  ```

- [ ] **Step 2: Run** `npx jest src/__tests__/needs-colors.test.ts`. Expected: FAIL. **Step 3:** implement `colors.ts`. **Step 4:** run the test. Expected: PASS.

- [ ] **Step 5: Implement the four components**

  - **`NeedsHeatmap`** is plain SVG, not Recharts, so it exports cleanly.
    - Rows are indicators grouped under domain headers. Columns are the areas, then Greater Sydney, then NSW.
    - Each cell is filled with `needColor(percentile)` and shows the formatted value, with "≈" prefixed when approximate.
    - Benchmark columns show the value only, in a neutral fill.
    - The wrapper uses `overflow-x-auto`. The legend shows the 5 bands plus "No data".
  - **`DomainScoreChart`** is a horizontal Recharts `BarChart`: one bar group per domain, one bar per area, plus a Greater Sydney reference.
  - **`NeedsRadar`** uses Recharts `RadarChart` over the 3 domains. It shows the first 6 areas plus Greater Sydney, with a note when more are hidden.
  - **`IndicatorStripPlot`** is a Recharts `ScatterChart` with one horizontal strip.
    - All snapshot LGAs are grey dots. Selected LGAs are coloured, and `labelledIds` are named.
    - Greater Sydney and NSW are `ReferenceLine`s.
    - The axis is oriented so that "more need" is always to the right.

- [ ] **Step 6: Verify:** `npx tsc --noEmit && npm run lint` pass. Visual check happens in Task 10.

- [ ] **Step 7: Commit** `feat(needs): heatmap, domain, radar and strip-plot charts`

---

### Task 9: Simplified boundaries and clickable need map

**Files:**
- Modify: `package.json`. Add `mapshaper` to devDependencies, and the script `"build:geo": "mapshaper public/geo/lga-nsw.json -simplify 3% keep-shapes -o precision=0.0001 public/geo/lga-nsw-simple.json"`.
- Create: `public/geo/lga-nsw-simple.json` (generated, committed), `src/components/needs/NeedsMap.tsx`
- Modify: `src/components/maps/ChoroplethMapDirect.tsx` (add `selectedAreaIds?: (string | number)[]`; keep `selectedAreaId`)
- Modify: `CLAUDE.md` (add `npm run build:geo` under Commands)

**Interfaces:**
- Produces: `<NeedsMap assessment={NeedsAssessment} onToggle={(areaId: string) => void} />`. It colours by overall need percentile, using `needColor` or `NEED_SCALE` with fixed breaks of 20/40/60/80, and outlines selected LGAs.

- [ ] **Step 1: Run** `npm i -D mapshaper && npm run build:geo`, then verify:

  ```bash
  node -e "const d=require('./public/geo/lga-nsw-simple.json');console.log(d.features.length, d.features.every(f=>f.properties.id?.startsWith('lga_')))" && ls -lh public/geo/lga-nsw-simple.json
  ```

  Expected: `128 true`, size under 3 MB. If larger, lower the percentage to 1.5%.

- [ ] **Step 2: Extend `ChoroplethMapDirect` and implement `NeedsMap`**

  - Fetch `/geo/lga-nsw-simple.json` and set each feature's `need` property from the snapshot record's overall score, computed with `assessRecord` against the current universe.
  - Clicking an LGA calls `onToggle(feature.properties.id)`.
  - The tooltip shows the name, band and score.
  - The page loads it through `dynamic(..., { ssr: false })`.

- [ ] **Step 3: Verify:** `npx tsc --noEmit` passes. The visual check happens in Task 10.

- [ ] **Step 4: Commit** `feat(needs): simplified LGA boundaries and clickable need map`

---

### Task 10: `/needs` page

**Files:**
- Create: `src/app/needs/page.tsx`, `src/components/needs/NarrativeBlock.tsx`, `src/components/needs/IndicatorTable.tsx`
- Modify: `src/components/layout/navigation.ts`. Add `{ href: '/needs', label: 'Needs Assessment', icon: Target }` first in the `analyse` task's items, and import `Target` from lucide-react.
- Modify: `CLAUDE.md`. Add `/needs` to Routes, and add a one-line Key Conventions entry: "Needs engine: `src/lib/needs/` over `NEEDS_SNAPSHOT`; rebuild with `npm run build:needs`".

**Interfaces:**
- Consumes: everything above.
- Page structure:
  - `'use client'`.
  - Wrap the inner component in `<Suspense>`, which `useSearchParams` requires for `next build`.
  - Call `runAssessment({ snapshot: NEEDS_SNAPSHOT, ...selection })` inside a `useMemo`, then `buildNarrative`.

- [ ] **Step 1: Build the page top to bottom**

  1. **Controls:** `LgaMultiSelect`; a mode toggle (Separate / Combined); a universe select (NSW / Greater Sydney / Region / Similar LGAs; the last shows each selected LGA's peer-group label); an amber notice listing `invalidIds` when non-empty.
  2. **Empty state** when `areas.length === 0`: "Select one or more LGAs, a region, or click the map to start an assessment." The map stays visible so it can be clicked.
  3. **Summary:** `NarrativeBlock` showing the summary section, with a `CopyTextButton`.
  4. **Figures,** each in a `ChartWrapper` with `figureId` and a `caption` built from the cited sources:
     - Need map
     - Domain scores
     - Need heatmap
     - Domain profile (radar)
     - Strip plots for the 6 indicators with the highest max percentile across the selection
  5. **One `NarrativeBlock` per domain section.**
  6. **`IndicatorTable`:**
     - Columns: Indicator, then one per area as "value (p{round})", "≈" when approximate, "No data" when null; then Greater Sydney; then NSW; then Source.
     - Wrapped in `ChartWrapper` with `data` so the Excel export works.
  7. **Data notes section,** a list of sources, and the line "Indicator snapshot built {generatedAt, en-AU date}".

  `NarrativeBlock` props: `{ section: NarrativeSection }`. It renders the heading and paragraphs with superscript citation numbers that link to the sources list, and has a copy button that uses `narrativeToPlainText([section])`.

- [ ] **Step 2: Verify in the running app**

  Run `npm run dev`. Use the Playwright MCP tools, or ask the user to check by hand:

  - `/needs` shows the empty state, and clicking Blacktown on the map selects it.
  - `/needs?lgas=lga_blacktown,lga_penrith` shows two heatmap columns plus Greater Sydney and NSW, and the narrative names both LGAs.
  - Adding `&mode=combined` shows one column, "Blacktown + Penrith", with "≈" on SEIFA.
  - "Add region → Greater Sydney" selects 33 LGAs (the region; the GCCSA benchmark adds Central Coast to make 34). The heatmap scrolls and the strip plot labels 12.
  - `universe=region` with the Central Coast LGA shows the small-group note.
  - `lgas=lga_x` shows the invalid-id notice and the empty state.
  - A downloaded figure PNG includes the "Figure n … Source:" caption.

- [ ] **Step 3: Run** `npx tsc --noEmit && npm run lint && npm test && npm run build`. Expected: all pass.

- [ ] **Step 4: Commit** `feat(needs): needs assessment page`

---

### Task 11: Word export

**Files:**
- Modify: `package.json` (`npm i docx`)
- Create: `src/lib/needs/docx-export.ts`, `src/components/needs/ExportDocxButton.tsx`
- Modify: `src/app/needs/page.tsx` (add the button to the controls bar)
- Test: `src/__tests__/needs-docx.test.ts`

**Interfaces:**
- Consumes: `NeedsAssessment`, `NarrativeSection[]`, `formatValue`, the `RegisteredFigure.capture()` output.
- Produces:

  ```ts
  export interface DocxFigure { title: string; caption: string; png: Uint8Array; widthPx: number; heightPx: number }
  export interface NeedsDocxInput { title: string; generatedOn: string; assessment: NeedsAssessment; narrative: NarrativeSection[]; figures: DocxFigure[] }
  export function buildNeedsDocument(input: NeedsDocxInput): Document      // pure; from 'docx'
  // ExportDocxButton: captures registry figures in order, builds the document, Packer.toBlob → download '{slug(title)}.docx'
  ```

- [ ] **Step 1: Write failing tests**

  Pack with `Packer.toBuffer`. Read `word/document.xml` with `JSZip`, which `docx` already depends on; add it as an explicit devDependency if it isn't resolvable. Use a 1×1 PNG `Uint8Array` fixture and a real `runAssessment` for Blacktown + Penrith in combined mode.

  ```ts
  expect(xml).toContain('Blacktown + Penrith');
  expect(xml).toContain('Summary');
  expect(xml).toContain('Figure 1. Need map');
  expect(xml).toContain('≈');                     // approximate SEIFA in the table
  expect(xml).toContain('No data');               // when an indicator is null (set one null in a cloned snapshot)
  expect(xml).toContain('Greater Sydney');        // table benchmark column
  expect(xml).toContain('ABS Census 2021 G62');   // sources list
  expect(zip.file(/word\/media\/.*\.png/).length).toBe(1);
  ```

- [ ] **Step 2: Run** `npx jest src/__tests__/needs-docx.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement the document**

  Document order:
  1. Title (Heading 1), generated date, and the selection line: members, mode, universe.
  2. Summary (Heading 2).
  3. One Heading 2 per domain, with its paragraphs.
  4. "Indicators" Heading 2 and a native Word table with the same columns as `IndicatorTable`.
  5. "Figures" Heading 2. Each figure is an `ImageRun` scaled to at most 16 cm wide with the aspect ratio kept, followed by an italic caption "Figure n. {title}. Source: {caption}".
  6. Data notes.
  7. Sources: unique `SourceRef.full` values, numbered to match the citations.

  Use Calibri at 11 pt. Text and tables stay editable.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Verify in the app**

  - Export from `/needs?lgas=lga_blacktown,lga_penrith&mode=combined`.
  - Open the .docx in Word or Pages and confirm: headings, editable text, the table, every figure with its caption, and the sources.
  - Run `npm test && npm run build`. Expected: all pass.

- [ ] **Step 6: Commit** `feat(needs): editable Word export of the assessment`

---

# Part B — Insights layer

Part B builds on the finished Part A page and docx. The spec section "Insights layer (Part B)" holds the models and their measured fit.

### Task 12: Employment projection coverage check

Only 29 of 128 LGAs resolve TZP24 job projections through `getEmploymentProjections(areaId)`. `CLAUDE.md` reports 86 employment rows in `nsw_projections`. The cause is not known yet.

**Files:**
- Investigate: `src/lib/data/nsw-employment-projections.ts`, `scripts/parse-employment.js`, `src/lib/data/live-data.ts:1026`
- Test: `src/__tests__/needs-snapshot.test.ts`

- [ ] **Step 1: Diagnose with superpowers:systematic-debugging**

  Answer three questions:
  - How many distinct `lgaId`s does `tzp24EmploymentByLGA` hold?
  - How many of them match a `SAMPLE_AREAS` LGA id?
  - Which ids fail to match, and why (naming, amalgamated LGAs, or coverage of the source CSV)?

  Write the findings into the commit message.

- [ ] **Step 2: Fix the cause if it is a mapping bug.** Correct the id mapping in `parse-employment.js`, then run `npm run parse:employment && npm run build:needs`.

  If instead the source genuinely covers only some LGAs, leave the data as it is and add a line to `CLAUDE.md` under Data Sources stating the real coverage.

- [ ] **Step 3: Pin the coverage in a test**

  ```ts
  test('job growth coverage matches the TZP24 source', () => {
    expect(NEEDS_SNAPSHOT.records.filter(r => r.values.job_growth_2041.value !== null).length).toBe(EXPECTED_TZP24_LGAS);
  });
  ```

  `EXPECTED_TZP24_LGAS` is the number established in Step 1.

- [ ] **Step 4: Run** `npm test`. Expected: PASS. **Commit** `fix(data): TZP24 employment coverage` (or `docs: record TZP24 coverage`).

---

### Task 13: Insight series in the snapshot

**Files:**
- Modify: `src/lib/needs/types.ts`, `src/lib/needs/extract.ts`, `scripts/build-needs-indicators.ts`
- Regenerate: `src/lib/data/needs-indicators-data.ts`
- Test: `src/__tests__/needs-indicators.test.ts`, `src/__tests__/needs-snapshot.test.ts`

**Interfaces:**
- Produces:

  ```ts
  export interface InsightSeries {
    carDependencyByYear: { year: 2011 | 2016 | 2021; value: number }[];   // (car ÷ (100 − wfh)) × 100 from modeShareTrend; years with no data omitted
    crashesByYear: { year: number; total: number }[];                      // crashTrend
    populationHistory: { year: number; population: number }[];             // ERP, as-is
    population2041: number | null;
    amPeakDepartures: number | null;                                       // ptFrequency.amPeakDepartures
    approvalsLast12: number | null; approvalsPrev12: number | null;        // sums over buildingApprovals months, latest 12 and the 12 before; null if fewer than 24 months
    jobs2021: number | null; jobs2041: number | null;
  }
  // LgaIndicatorRecord gains: series: InsightSeries
  export function extractSeries(bundle: LiveBundle): InsightSeries
  ```

- [ ] **Step 1: Write failing tests**

  ```ts
  test('car dependency by year excludes WFH', () => {
    // modeShareTrend [{2011, car 70, wfh 5}, {2021, car 60, wfh 25}] → [{2011, 73.68…}, {2021, 80}]
  });
  test('approvals need 24 months', ...)        // 23 months → both null; 24 months → sums of the last 12 and the previous 12
  test('snapshot: car dependency coverage by year', () => {
    const has = (y: number) => NEEDS_SNAPSHOT.records.filter(r => r.series.carDependencyByYear.some(p => p.year === y)).length;
    expect([has(2011), has(2016), has(2021)]).toEqual([107, 123, 128]);
  });
  test('snapshot stays small', () => { /* fs.statSync(needs-indicators-data.ts).size < 400_000 */ });
  ```

- [ ] **Step 2: Run** `npx jest src/__tests__/needs-indicators.test.ts src/__tests__/needs-snapshot.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `extractSeries`, call it from the builder, and run** `npm run build:needs`.

- [ ] **Step 4: Run the tests.** Expected: PASS. **Commit** `feat(needs): insight time series in the snapshot`

---

### Task 14: Insight engine

**Files:**
- Create: `src/lib/needs/insights.ts`
- Modify: `src/lib/needs/types.ts`
- Test: `src/__tests__/needs-insights.test.ts`

**Interfaces:**
- Consumes: `LgaIndicatorRecord` with `series`, `NeedsAssessment`, `GREATER_SYDNEY_GCCSA_AREA_IDS`.
- Produces:

  ```ts
  export interface LinearFit { intercept: number; slope: number; r2: number; residualSd: number; n: number; predictor: 'frequent_stop_share' | 'ln_population'; setting: 'metro' | 'non_metro' }
  export function fitLinear(points: { x: number; y: number }[]): Omit<LinearFit, 'predictor' | 'setting'>
  export function expectedCarDependencyModel(records: LgaIndicatorRecord[], setting: 'metro' | 'non_metro'): LinearFit
  export interface MismatchResult { areaId: string; actual: number; expected: number; residual: number; z: number; fit: LinearFit; usable: boolean }  // usable = n ≥ 20 && r2 ≥ 0.3
  export function carDependencyMismatch(record: AssessableRecord, records: LgaIndicatorRecord[]): MismatchResult | null  // null when the record's own value or predictor is null
  export interface TrendResult { areaId: string; metric: 'car_dependency' | 'crash_rate' | 'population_growth' | 'approvals'; from: { label: string; value: number }; to: { label: string; value: number }; change: number; universeMedianChange: number | null }
  export function trends(record: LgaIndicatorRecord | AggregatedRecord, universe: LgaIndicatorRecord[]): TrendResult[]
  export interface GrowthServiceResult { areaId: string; per1000Now: number; per1000In2041: number; extraDeparturesNeeded: number }
  export function growthVsService(record: LgaIndicatorRecord | AggregatedRecord): GrowthServiceResult | null
  export interface JobsHousingResult { areaId: string; jobsPerResident2021: number; jobsPerResident2041: number }
  export function jobsHousing(record: LgaIndicatorRecord | AggregatedRecord): JobsHousingResult | null
  export interface Insight { id: string; areaId: string; kind: 'key_need' | 'mismatch' | 'trend' | 'growth_service' | 'jobs_housing'; severity: number; text: string; citations: SourceRef[] }
  export function buildInsights(a: NeedsAssessment): Insight[]   // sorted by severity, descending
  ```

  `AggregatedRecord` gains `series: InsightSeries`, summed across members. Car dependency by year is population-weighted and listed in `approximate`.

- [ ] **Step 1: Write failing tests**

  ```ts
  expect(fitLinear([{x:0,y:1},{x:1,y:3},{x:2,y:5}])).toMatchObject({ intercept: 1, slope: 2, r2: 1, n: 3 });
  test('metro model on the real snapshot', () => {
    const m = expectedCarDependencyModel(NEEDS_SNAPSHOT.records, 'metro');
    expect(m.n).toBe(34); expect(m.predictor).toBe('frequent_stop_share');
    expect(m.r2).toBeGreaterThan(0.4); expect(m.slope).toBeLessThan(0);      // probe: R² 0.51, slope −0.52
  });
  test('non-metro model uses ln(population)', () => {
    const m = expectedCarDependencyModel(NEEDS_SNAPSHOT.records, 'non_metro');
    expect(m.n).toBe(94); expect(m.predictor).toBe('ln_population'); expect(m.r2).toBeGreaterThan(0.4); // probe: R² 0.52
  });
  test('mismatch is unusable when the fit is weak', ...)   // synthetic records with r2 < 0.3 → usable false
  test('mismatch z = residual / residualSd', ...)
  test('growthVsService', () => {
    // amPeakDepartures 6000, latest ERP 400000, population2041 500000 → per1000Now 15, per1000In2041 12, extraDeparturesNeeded 1500
    // amPeakDepartures 0 → null
  });
  test('trend change compares with the universe median change', ...)
  test('trends skip metrics without both endpoints', ...)   // no 2011 → car trend uses 2016 → 2021; one year only → omitted
  test('jobsHousing null without TZP24 data', ...)
  test('buildInsights: mismatch text', () => {
    // exact: "Blacktown's car dependency (83.8%) is 6.1 pp higher than expected for its level of frequent public transport service (model across 34 metropolitan LGAs, R² 0.51)."
  });
  test('buildInsights: growth vs service text', () => {
    // exact: "If AM-peak service stays at today's level, departures per 1,000 residents in Blacktown fall from 32.5 to 25.9 by 2041; holding today's rate needs about 3,700 more AM-peak departures."
  });
  test('buildInsights omits unusable mismatches and sorts by severity', ...)
  ```

  The numbers in the two text tests are illustrative. Build the expected strings from the fixture's own values with the same templates, but keep the wording exactly as written.

- [ ] **Step 2: Run** `npx jest src/__tests__/needs-insights.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

  - **Severity:**
    - key need: `percentile / 100`
    - mismatch: `min(1, |z| / 2)`
    - trend: `min(1, |change − universeMedianChange| ÷ (2 × the universe's interquartile range of changes))`
    - growth vs service: `min(1, (1 − per1000In2041 / per1000Now) × 2)`
    - jobs–housing: `min(1, |jobsPerResident2041 − jobsPerResident2021| × 2)`
  - **Wording:**
    - Non-metro mismatch: "…than expected for an LGA of its population size (model across 94 non-metropolitan LGAs, R² 0.52)."
    - Negative residuals say "lower than expected".
    - Trend: "{Name}'s {metric label} changed from {from} ({fromLabel}) to {to} ({toLabel}), {faster|slower} than the median change of {median} across {universeLabel}."
    - Jobs–housing: "{Name} has {j21} local jobs per resident in 2021, projected to be {j41} in 2041 (TfNSW TZP24)."
  - **Car-trend caveat:** every car-trend insight carries the WFH caveat citation, because the 2021 values are lockdown-affected.
  - **"Today" in growth vs service** is the latest ERP year in `series.populationHistory`, the same denominator as `am_peak_departures_per_1000`:
    - `per1000Now = amPeakDepartures ÷ latestERP × 1,000`
    - `per1000In2041 = amPeakDepartures ÷ population2041 × 1,000`
    - `extraDeparturesNeeded = amPeakDepartures × (population2041 ÷ latestERP − 1)`, rounded to the nearest 100 in text
    - Return `null` when `amPeakDepartures` is 0 or null.

- [ ] **Step 4: Run the tests.** Expected: PASS. **Commit** `feat(needs): insight engine (mismatch, trends, growth vs service, jobs–housing)`

---

### Task 15: Insight charts

**Files:**
- Create: `src/components/needs/MismatchScatter.tsx`, `src/components/needs/TrendSmallMultiples.tsx`, `src/components/needs/GrowthServiceChart.tsx`, `src/components/needs/JobsHousingChart.tsx`

**Interfaces:**
- Consumes: Task 14 functions; `ChartWrapper` with `figureId` and `caption` (Task 7); `CHART_COLORS`; `labelledIds` (Task 8).
- Each component takes `{ assessment: NeedsAssessment }` and returns `null` when it has nothing to show.

- [ ] **Step 1: Implement**

  - **`MismatchScatter`:** a Recharts `ScatterChart`.
    - Plots all LGAs in the selected areas' setting (metro or non-metro) as grey dots, with the fitted line as a two-point `Line`.
    - Selected LGAs are coloured and labelled up to `MAX_LABELLED`.
    - Axis titles name the predictor ("Stops with frequent AM-peak service (%)" or "Population (log scale)").
    - The subtitle is `R² {r2} · n = {n}`.
    - If the selection spans metro and non-metro, render one chart per setting.
    - If `usable` is false, render the "too weak to estimate" sentence instead of the chart.
  - **`TrendSmallMultiples`:** one small `LineChart` per metric that has data (car dependency 2011/16/21, crashes per 10,000 for 2020–24, population index with 2021 = 100 for 2001–2041). Selected LGAs are coloured, with a dashed universe-median line.
  - **`GrowthServiceChart`:** grouped bars per LGA showing departures per 1,000 now and in 2041 at today's service level.
  - **`JobsHousingChart`:** a dumbbell (two `Scatter` points joined by a `Line`) of jobs per resident in 2021 and 2041, for LGAs that have data. The footnote counts the selected LGAs without TZP24 data.

- [ ] **Step 2: Verify:** `npx tsc --noEmit && npm run lint` pass. The visual check is in Task 16.

- [ ] **Step 3: Commit** `feat(needs): insight charts`

---

### Task 16: Key findings on the page and in Word

**Files:**
- Modify: `src/lib/needs/narrative.ts` (add a `'key_findings'` section id), `src/lib/needs/types.ts`
- Modify: `src/app/needs/page.tsx`, `src/lib/needs/docx-export.ts`
- Test: `src/__tests__/needs-narrative.test.ts`, `src/__tests__/needs-docx.test.ts`

**Interfaces:**
- `NarrativeSection['id']` gains `'key_findings'` and `'insights'`.
- `buildNarrative(a)` now calls `buildInsights(a)`:
  - **`key_findings`** comes first: the top 5 insights by severity, one paragraph each.
  - **`insights`** comes after the domain sections: every remaining insight, grouped by kind in the order mismatch, trend, growth_service, jobs_housing.

- [ ] **Step 1: Write failing tests**

  ```ts
  test('key findings come first and hold at most 5 insights', ...)
  test('every key finding carries at least one citation', ...)
  test('docx contains a Key findings heading before Summary', ...)   // indexOf('Key findings') < indexOf('Summary') in document.xml
  ```

- [ ] **Step 2: Run** `npx jest src/__tests__/needs-narrative.test.ts src/__tests__/needs-docx.test.ts`. Expected: FAIL. **Step 3:** implement. **Step 4:** run them. Expected: PASS.

- [ ] **Step 5: Wire the page**

  - A "Key findings" `NarrativeBlock` goes above Summary.
  - The four insight figures go after the strip plots, in the order MismatchScatter, TrendSmallMultiples, GrowthServiceChart, JobsHousingChart. Each is registered as a figure, so the docx picks them up automatically.

- [ ] **Step 6: Verify in the running app** at `/needs?lgas=lga_blacktown,lga_newcastle`:
  - Two mismatch charts appear (metro and non-metro), each with R² and n.
  - The trend charts show a 2011 point for Blacktown.
  - Key findings list at most 5 items, each with a citation.
  - The exported .docx has Key findings first and includes the new figures.

  Then run `npm test && npm run build`. Expected: all pass.

- [ ] **Step 7: Commit** `feat(needs): key findings and insight figures in page and Word export`

---

## Follow-ups (not in this plan)

- Point `/compare` and `strategic-alignment`'s hardcoded `BENCHMARK_VALUES` at the snapshot benchmarks. That removes the 63% vs 39.8% car-share contradiction and the "—" benchmark rows.
- Wire the `/demographics` map click to selection.
- Make the Business Case wizard use more than `areaIds[0]`.
- Optional LLM-polished summary on top of the deterministic narrative.
