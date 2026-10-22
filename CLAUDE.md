# Transport Needs Assessment Tool — CLAUDE.md

> **For full architecture details see `ARCHITECTURE.md`.**
> **Ignore:** `.next/`, `public/geo/`, `*.md` (except this file)

## Stack
Next.js 14 App Router · TypeScript · Tailwind · Zustand · Recharts · Leaflet · @tanstack/react-table · better-sqlite3 · jsPDF

## Commands
```bash
npm run dev              # localhost:3000
npm run build
npm run seed             # seed static + fetch all ABS data (30–40 min, network)
npm run seed:static      # seed static data only — projections + transport (~5s, no network)
npm run seed:abs         # fetch ABS data only for all LGAs (~30–40 min)
npm run seed -- --lga lga_sydney   # fetch ABS for a single LGA
npm run seed:g62         # re-fetch Census journey-to-work (G62/G59/B46) for all LGAs
npm run seed:transport   # HTS commute time, ABS commute distance, station patronage, crash trends (~2 min, needs gtfs_stops)
npm run build:fallbacks  # refresh bundled official-fallback-data.ts from live data + Greater Sydney benchmark (run after any seed)
npm run build:needs      # rebuild the LGA needs-assessment indicator snapshot (src/lib/data/needs-indicators-data.ts); run after build:fallbacks
npm run build:geo        # regenerate public/geo/lga-nsw-simple.json (the /needs map's boundaries, ~1 MB) from public/geo/lga-nsw.json

npm run parse:population  # regenerate src/lib/data/nsw-projections-data.ts from XLSX
npm run parse:employment  # regenerate src/lib/data/nsw-employment-projections.ts from CSV (does NOT reproduce the bundled file — see Data Sources)
npm run parse:hts         # regenerate src/lib/data/hts-lga-data.ts (HTS all-purpose travel)
npm run parse:jtw-flows -- <export.csv>  # regenerate src/lib/data/jtw-flows-data.ts from a TableBuilder export
```

## Routes
`/` · `/demographics` · `/transport` · `/economy` · `/education` · `/housing` · `/growth` · `/needs` · `/compare` · `/report` · `/upload` · `/admin`

## Key Conventions
- All pages: `'use client'` + `useAppStore()` for global state
- Default area: `'lga_sydney'`; data calls: `getLiveXxxData(areaId, year)` via `useLiveData` hook
- Maps: always `dynamic(() => import(...), { ssr: false })`
- Charts: use `CHART_COLORS` from `@/lib/utils.ts`
- Path alias: `@/` → `src/`
- Needs engine: `src/lib/needs/` over `NEEDS_SNAPSHOT`; rebuild with `npm run build:needs`
- Projections store: `useProjectionStore` (`@/store/projectionStore`) — Excel upload to localStorage
- Live data hook: `useLiveData(areaId, year)` → `/api/live-data/[areaId]` → SQLite cache
- No `preferRealData` toggle; all pages show refreshed live data where available and bundled official fallback data otherwise
- `DataSourceBadge` component (`@/components/ui/DataSourceBadge`) shows official source attribution and flags fields with no official source integrated

## Data Sources
| Source | Coverage | Update |
|---|---|---|
| ABS Census API (SDMX-ML XML) | Population, medians, dwelling type, tenure, industry, education attendance/completion, qualifications, SEIFA, labour | `npm run seed:abs` |
| ABS ERP API | Historical population by year (2001–2025) | `npm run seed:abs` |
| ABS Building Approvals API (BA_LGA2024 / BA_LGA2025) | Monthly residential building approvals by LGA | `npm run seed:abs` |
| NSW DPE bundled data | Population projections 2021–2041 by LGA | `npm run seed:static` (or `parse:population` then `seed:static`) |
| TfNSW TZP24 bundled data | Employment projections 2021–2066 by LGA. **Bundled extract covers 43 of 128 LGAs** (all 33 Greater Sydney, Central Coast, Newcastle, Lake Macquarie, Wollongong, Shellharbour, Kiama, Shoalhaven, Wingecarribee, Lismore, Coffs Harbour); the other 85 have no rows, so `job_growth_2041` is null for them (never proxied). The `nsw_projections` table's 86 employment rows are those 43 LGAs stored under two keys. Rows carry legacy ids (`lga_innerwest`); `TZP24_ID_BY_AREA_ID` in `nsw-employment-projections.ts` maps the 14 that differ from `SAMPLE_AREAS`. TfNSW publishes TZP24 state-wide (travel-zone basis, "Employment by LGA" CSV), so more LGAs may be recoverable from that CSV, which is not in the repo. `scripts/parse-employment.js` reads an XLSX and emits a different shape (no `lgaId`), so it cannot regenerate this file as it stands | `npm run seed:static` |
| TfNSW Household Travel Survey (HTS) — commute | Avg weekday commute time by LGA — 45 LGAs (Sydney GMA, Central Coast, Hunter, Illawarra, Shoalhaven) | `npm run seed:transport` |
| TfNSW Household Travel Survey (all trips) | Mode share of all weekday trips, trip purpose, trips per resident — 45 Sydney GMA LGAs | `npm run parse:hts` regenerates bundled `src/lib/data/hts-lga-data.ts` |
| TfNSW Station Entries & Exits (Opal) | Monthly rail/metro/light rail entries, joined to LGAs via `gtfs_stops` + `STATION_LGA_OVERRIDES` | `npm run seed:transport` |
| ABS Data by Region (ABS_REGIONAL_LGA2020) | Census 2016 commuting distance, all LGAs (fallback where HTS has no coverage) | `npm run seed:transport` / `seed:abs` |
| TfNSW GTFS schedule | Stops/routes per LGA + weekday 7–9am departures per stop (frequent = ≥8, i.e. ≥4/hr; school buses excluded) | `npm run seed:gtfs` — keyless complete bundle from Open Data (~300 MB, ~1 min), or per-feed API if `TFNSW_API_KEY` is set; `-- --zip <path>` to reuse a download |
| ABS Census JTW flows (TableBuilder) | LGA of residence × LGA of workplace: self-containment, self-sufficiency, top destinations/origins. No open 2021 LGA→LGA file exists, so it needs a TableBuilder CSV export (spec in `scripts/parse-jtw-flows.ts`) | `npm run parse:jtw-flows -- <export.csv>` regenerates bundled `src/lib/data/jtw-flows-data.ts` (ships empty) |
| TfNSW transport static | **Modelled** mode share / commute / patronage trends 2019–2026 for 5 LGAs (not official — see header of `src/lib/data/tfnsw-transport.ts`); no longer shown on `/transport`, still used by `/compare` | `npm run seed:static` |

### ABS LGA Codes (key ones)
`lga_sydney→17200` `lga_parramatta→16260` `lga_blacktown→10750` `lga_penrith→16350`
Full list (128 NSW LGAs + 2 benchmarks) in `src/lib/abs-fetchers.ts` → `LGA_CODE_MAP`
Regions: Greater Sydney · Hunter · Central Coast · Illawarra-Shoalhaven · South East & Tablelands · New England & North West · North Coast · Central West & Orana · Riverina-Murray · Far West

### ABS Datasets Fetched per LGA
| Internal name | ABS Dataset ID | Content |
|---|---|---|
| G01 | C21_G01_LGA | Population by sex and age (total persons = PCHAR `P_1`; `S_1` is Year 12 completion) |
| G02 | C21_G02_LGA | Medians: MEDAVG 1 age, 4 household income, 5 mortgage, 6 rent, 8 household size (2 is personal, 3 family income) |
| G33 | C21_G36_LGA | Dwelling structure of occupied private dwellings (total = `OCC`; `_T` includes unoccupied) |
| B31_2011 | ABS_CENSUS2011_B31_LGA | Historical dwelling structure (2011 baseline for housing trend) |
| G36 | C21_G37_LGA | Tenure (rented = `R_T`; `3` is real estate agent only) |
| G51 | C21_G54_LGA | Industry of employment, all employed (C21_G53 is qualified workers only) |
| G46 | C21_G16_LGA | School completion (Yr12 / Yr11 / Yr10 / below) |
| G15 | C21_G15_LGA | Education institution attendance (preschool / primary / secondary / tertiary) |
| G49 | C21_G49_LGA | Non-school qualification level (4 adv diploma, 51 cert III/IV); total covers qualified persons only — shares use persons 15+ from G01 |
| G49_2016 | ABS_C16_G46_LGA | 2016 non-school qualification level (same universe as G49; ABS_C16_G49 is by occupation) |
| G09 | C21_G09_LGA | Country of birth (Australia = `11`; labels from the codelist; filter AGEP `_T`) |
| G13 | C21_G13_LGA | Language at home (English only = LANP `1`; limited English = ENGLP `3`; labels from the codelist) |
| G25 | C21_G32_LGA + C21_G35_LGA | Families by type (FINF `_T`) and households: family / lone person / group |
| G33_INCOME | C21_G33_LGA | Household income bands (HIND 1 = negative/nil … 17 = $4,000+; 18 = partial) |
| G18 | C21_G18_LGA | Need for assistance |
| G60 | C21_G60_LGA | Occupation (ANZSCO major groups; total = OCCP `_T`) |
| SEIFA | ABS_SEIFA2021_LGA | IRSD / IRSAD / IER / IEO scores |
| LABOUR | C21_G46_LGA | Labour force status (LFSP 5 employed, 8 unemployed, 9 labour force); counts kept |
| ERP | ABS_ANNUAL_ERP_LGA2025 | Estimated resident population 2001–2025 |
| BUILDING_APPROVALS | BA_LGA2024 / BA_LGA2025 / BA_LGA2026 | Monthly residential building approvals by LGA |
| G34 | C21_G34_LGA | Motor vehicles per dwelling (3+ = VEHD 3 + 4; total = `V_T`, stated) — zero-car households |
| G62 / G59 / B46 | C21_G62_LGA / ABS_C16_G59_LGA / ABS_CENSUS2011_B46_LGA | Method of travel to work 2021/2016/2011 (mode share + trend) — decoded by `decodeJourneyToWork` with `MTWP_CODES_20xx` (232 = walked, 233 = worked at home, 234 = did not go; not modes). `npm run seed:g62` refreshes all three |
| COMMUTE_DIST_2016 | ABS_REGIONAL_LGA2020 | Avg / median commuting distance (Census 2016) |
| G55 | — | Not used (C21_G55_LGA is industry × hours); journey-to-work comes from G62/G59/B46 |

### Adding a New LGA
1. Add entry to `LGA_CODE_MAP` in `src/lib/abs-fetchers.ts` (`lga_xxx → 5-digit ABS code`)
2. Add to `SAMPLE_AREAS` in `src/lib/data/sample-areas.ts`
3. Run `npm run seed -- --lga lga_xxx` to fetch ABS data

### Adding New ABS Data Fields
1. Find dataset/dimension codes at data.api.abs.gov.au. **Check every code against the official codelist** (`/rest/dataflow/ABS/<ID>?references=all&detail=referencepartial`) — most past bugs were plausible-looking wrong codes, subtotals summed with their parts, or a dimension left unfiltered (lookupValue returns the first partial match)
2. Add fetch fn to `src/lib/abs-fetchers.ts` (follow SDMX-ML XML pattern), with the code mapping in a pure `decodeXxx(get)` and a test in `src/__tests__/abs-decoders*.test.ts`; verify one LGA against a published figure
3. Add the returned type and field to the relevant `Live*Result` in `src/lib/data/live-data.ts`
4. Update the relevant page component

## Excel Projections Import
- Upload at `/upload` — drag & drop NSW Planning XLSX
- Parser: `src/lib/excel-parser.ts` · Store: `src/store/projectionStore.ts`
- Persists to localStorage; `clearProjections()` to reset
- Alternatively: run `npm run parse:population` to regenerate the bundled static data file

## Admin Panel
- URL: `/admin` (admin-protected; accepts `ADMIN_KEY` and production admin identity flow)
- Shows ABS cache count, projection count, config values, recent refresh logs
- POST `/api/admin/refresh` with `{ action: 'seed_static' | 'seed_abs' | 'seed_transport', lgaId? }` to enqueue a refresh job
- Jobs are processed by the refresh worker (`npm run worker:refresh`) / inline runner using `src/lib/seed-runner.ts`; `transport` runs `src/lib/official-transport-seed.ts` (same as `npm run seed:transport`). GTFS stops are CLI-only (`npm run seed:gtfs`)
- Auto-refresh: when `auto_refresh_enabled` is `true`, the worker queues `abs` / `transport` jobs once `abs_refresh_interval_days` / `tfnsw_refresh_interval_days` have passed (`dueScheduledRefreshes` in `src/lib/refresh-jobs.ts`)
- After refreshing data that ships in the bundle, run `npm run build:fallbacks`, then `npm run build:needs` (run after `build:fallbacks`: it reads the same live data), and commit

## SQLite Schema (`data/cache.db`)
| Table | Key | Content |
|---|---|---|
| `abs_cache` | `(lga_code, dataset)` | JSON blob of parsed ABS data per LGA per dataset |
| `nsw_projections` | `(lga_name, projection_type)` | Population & employment projections |
| `transport_static` | `(lga_name, year)` | TfNSW mode share / commute data |
| `tfnsw_cache` | `(lga_code, dataset)` | GTFS coverage (`GTFS_COVERAGE`), weekday AM-peak service frequency (`GTFS_FREQUENCY`), traffic trends, crash summaries, `HTS_COMMUTE`, `STATION_PATRONAGE`, patronage source metadata |
| `app_config` | `key` | Key-value store (e.g. `abs_last_seeded`) |
| `refresh_log` | `id` | Audit log of seed runs |

## Troubleshooting
- **LGA not found**: add to `LGA_CODE_MAP` in `src/lib/abs-fetchers.ts` and `SAMPLE_AREAS`
- **Map SSR error**: ensure dynamic import with `ssr: false`
- **ABS data empty / all sample**: run `npm run seed:abs` — check `data/cache.db` has rows
- **Seed fails for one LGA**: run `npm run seed -- --lga lga_xxx` to retry just that LGA
- **`data/cache.db` corrupted**: delete file and re-run `npm run seed`
