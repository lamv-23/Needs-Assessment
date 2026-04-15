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

npm run parse:population  # regenerate src/lib/data/nsw-projections-data.ts from XLSX
npm run parse:employment  # regenerate src/lib/data/nsw-employment-projections.ts from CSV
```

## Routes
`/` · `/demographics` · `/transport` · `/economy` · `/education` · `/housing` · `/growth` · `/compare` · `/report` · `/upload` · `/admin`

## Key Conventions
- All pages: `'use client'` + `useAppStore()` for global state
- Default area: `'lga_sydney'`; data calls: `getLiveXxxData(areaId, year)` via `useLiveData` hook
- Maps: always `dynamic(() => import(...), { ssr: false })`
- Charts: use `CHART_COLORS` from `@/lib/utils.ts`
- Path alias: `@/` → `src/`
- Projections store: `useProjectionStore` (`@/store/projectionStore`) — Excel upload to localStorage
- Live data hook: `useLiveData(areaId, year)` → `/api/live-data/[areaId]` → SQLite cache
- No `preferRealData` toggle; all pages show refreshed live data where available and bundled official fallback data otherwise
- `DataSourceBadge` component (`@/components/ui/DataSourceBadge`) shows official source attribution and flags fields with no official source integrated

## Data Sources
| Source | Coverage | Update |
|---|---|---|
| ABS Census API (SDMX-ML XML) | Population, medians, dwelling type, tenure, industry, education attendance/completion, qualifications, SEIFA, labour | `npm run seed:abs` |
| ABS ERP API | Historical population by year (2001–2024) | `npm run seed:abs` |
| ABS Building Approvals API (BA_LGA2024 / BA_LGA2025) | Monthly residential building approvals by LGA | `npm run seed:abs` |
| NSW DPE bundled data | Population projections 2021–2041 by LGA | `npm run seed:static` (or `parse:population` then `seed:static`) |
| TfNSW TZP24 bundled data | Employment projections 2021–2066 by LGA | `npm run seed:static` (or `parse:employment` then `seed:static`) |
| TfNSW transport static | Mode share, commute times by LGA/year | `npm run seed:static` |

### ABS LGA Codes (key ones)
`lga_sydney→17200` `lga_parramatta→16260` `lga_blacktown→10750` `lga_penrith→16350`
Full list (128 NSW LGAs + 2 benchmarks) in `src/lib/abs-fetchers.ts` → `LGA_CODE_MAP`
Regions: Greater Sydney · Hunter · Central Coast · Illawarra-Shoalhaven · South East & Tablelands · New England & North West · North Coast · Central West & Orana · Riverina-Murray · Far West

### ABS Datasets Fetched per LGA
| Internal name | ABS Dataset ID | Content |
|---|---|---|
| G01 | C21_G01_LGA | Population by sex |
| G02 | C21_G02_LGA | Medians (age, income, rent, mortgage, avg household size) |
| G33 | C21_G36_LGA | Dwelling structure (separate house, semi, flat, other) |
| B31_2011 | ABS_CENSUS2011_B31_LGA | Historical dwelling structure (2011 baseline for housing trend) |
| G36 | C21_G37_LGA | Tenure type (owned, mortgage, rented) |
| G51 | C21_G53_LGA | Industry of employment (ANZSIC divisions A–S) |
| G46 | C21_G16_LGA | School completion (Yr12 / Yr11 / Yr10 / below) |
| G15 | C21_G15_LGA | Education institution attendance (preschool / primary / secondary / tertiary) |
| G49 | C21_G49_LGA | Qualification level (postgrad / grad dip / bach / adv dip / cert) |
| G49_2016 | ABS_C16_G49_LGA | Historical qualification level (2016 baseline for education trends) |
| SEIFA | ABS_SEIFA2021_LGA | IRSAD score |
| LABOUR | C21_G46_LGA | Labour force status (FT/PT employed, unemployed, NILF) |
| ERP | ABS_ANNUAL_ERP_LGA2021 | Estimated resident population 2001–2024 |
| BUILDING_APPROVALS | BA_LGA2024 / BA_LGA2025 | Monthly residential building approvals by LGA |
| G55 | — | Journey-to-work: **no ABS SDMX endpoint at LGA level** — stubbed null |

### Adding a New LGA
1. Add entry to `LGA_CODE_MAP` in `src/lib/abs-fetchers.ts` (`lga_xxx → 5-digit ABS code`)
2. Add to `SAMPLE_AREAS` in `src/lib/data/sample-areas.ts`
3. Run `npm run seed -- --lga lga_xxx` to fetch ABS data

### Adding New ABS Data Fields
1. Find dataset/dimension codes at data.api.abs.gov.au
2. Add fetch fn to `src/lib/abs-fetchers.ts` (follow SDMX-ML XML pattern)
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
- POST `/api/admin/refresh` with `{ mode: 'static' | 'abs' | 'all', lgaId? }` to enqueue a refresh job
- Jobs are processed by the refresh worker / inline runner using `src/lib/seed-runner.ts`

## SQLite Schema (`data/cache.db`)
| Table | Key | Content |
|---|---|---|
| `abs_cache` | `(lga_code, dataset)` | JSON blob of parsed ABS data per LGA per dataset |
| `nsw_projections` | `(lga_name, projection_type)` | Population & employment projections |
| `transport_static` | `(lga_name, year)` | TfNSW mode share / commute data |
| `tfnsw_cache` | `(lga_code, dataset)` | GTFS coverage, live traffic trends, crash summaries, patronage source metadata |
| `app_config` | `key` | Key-value store (e.g. `abs_last_seeded`) |
| `refresh_log` | `id` | Audit log of seed runs |

## Troubleshooting
- **LGA not found**: add to `LGA_CODE_MAP` in `src/lib/abs-fetchers.ts` and `SAMPLE_AREAS`
- **Map SSR error**: ensure dynamic import with `ssr: false`
- **ABS data empty / all sample**: run `npm run seed:abs` — check `data/cache.db` has rows
- **Seed fails for one LGA**: run `npm run seed -- --lga lga_xxx` to retry just that LGA
- **`data/cache.db` corrupted**: delete file and re-run `npm run seed`
