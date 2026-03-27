# Transport Needs Assessment Tool — CLAUDE.md

> **For full architecture details see `ARCHITECTURE.md`.**
> **Ignore:** `.next/`, `public/geo/`, `parse-*.js`, `*.md` (except this file)

## Stack
Next.js 14 App Router · TypeScript · Tailwind · Zustand · Recharts · Leaflet · @tanstack/react-table · better-sqlite3 · jsPDF

## Commands
```bash
npm run dev    # localhost:3000
npm run build
npm run seed   # seed SQLite (scripts/seed-db.ts)
```

## Routes
`/` · `/demographics` · `/transport` · `/economy` · `/education` · `/housing` · `/growth` · `/compare` · `/report` · `/upload`

## Key Conventions
- All pages: `'use client'` + `useAppStore()` for global state
- Default area: `'lga_sydney'`; data calls: `getXxxData(areaId, year)`
- Maps: always `dynamic(() => import(...), { ssr: false })`
- Charts: use `CHART_COLORS` from `@/lib/utils.ts`
- Path alias: `@/` → `src/`
- Projections store: `useProjectionStore` (`@/store/projectionStore`)
- Real ABS data: `useABSData(lgaId)` hook → `/api/abs/[lgaId]` (7-day ISR)
- ABS toggle: `preferRealData` in `@/store/index.ts`, UI in Header

## Data Sources
| Source | Coverage | Update |
|---|---|---|
| ABS Census API (SDMX-JSON) | Population, medians, SEIFA, labour | Weekly ISR |
| NSW Planning Excel (.xlsx) | Population projections 2021–2041 | Manual upload at `/upload` |
| TfNSW TZP24 CSV (bundled) | Employment projections 2021–2066 by LGA | Static — `src/lib/data/nsw-employment-projections.ts` |

### ABS LGA Codes (key ones)
`lga_sydney→17200` `lga_parramatta→16260` `lga_blacktown→10750` `lga_penrith→16350`
Full list in `src/lib/data/lga-mapping.ts`

### Adding New ABS Data
1. Find dataset ID at data.api.abs.gov.au
2. Add fetch fn to `src/lib/abs-api.ts` (follow existing pattern)
3. Add field to `ABSRealData` interface
4. Add to `fetchAllABSData()` parallel requests
5. Update relevant page(s)

## Excel Projections Import
- Upload at `/upload` — drag & drop NSW Planning XLSX
- Parser: `src/lib/excel-parser.ts` · Store: `src/store/projectionStore.ts`
- Persists to localStorage; `clearProjections()` to reset
- Download source: planning.nsw.gov.au → Population Projections → LGA XLSX

## Troubleshooting
- **LGA not found**: check name matches `LGA_MAPPING` in `src/lib/data/lga-mapping.ts`
- **Map SSR error**: ensure dynamic import with `ssr: false`
- **ABS data empty**: API returns `{}` on fail → orange banner, sample data shown
