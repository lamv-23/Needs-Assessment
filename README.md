# Transport Needs Assessment Tool

A Next.js dashboard for exploring population, transport, economic, housing, education and growth data across NSW LGAs and benchmark areas.

## Quick Start

```bash
npm install
npm run seed:static   # seed NSW projections + bundled transport data (~5s) — run once per clone
npm run dev           # http://localhost:3000
```

## Seed Commands

Data is cached in a local SQLite database (`data/cache.db`). Run these from the project root.

| Command | Time | When to run |
|---------|------|-------------|
| `npm run seed:static` | ~5s | Once after cloning; again when NSW DPE releases new projection files |
| `npm run seed:abs -- --lga lga_sydney` | ~2–3 min | Once per LGA — ABS Census data doesn't change between censuses |
| `npm run seed:abs` | ~15 min | Seed all supported LGAs in `LGA_CODE_MAP`; only needed again after a new Census release |

### Rule of thumb

- **First time on a new machine:** `npm run seed:static` then `npm run seed:abs`
- **Day-to-day:** nothing — data stays in `cache.db`
- **New NSW DPE projection file:** `npm run seed:static`
- **New Census (2026+):** `npm run seed:abs`

> `cache.db` is in `.gitignore` — each developer needs to seed their own local copy.

## Admin Panel

Visit `/admin` with an `ADMIN_KEY` or authenticated admin identity to:
- Check cache status (how many LGAs are seeded)
- Trigger a static or full ABS re-seed from the browser
- Adjust the refresh interval

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
ADMIN_KEY=your-secret-key        # protects /admin and /api/admin/refresh
AUTH_MODE=development            # use proxy in production
DATA_REPOSITORY_DRIVER=sqlite    # use postgres in production
PROJECTS_REPOSITORY_DRIVER=sqlite
DATABASE_URL=
POSTGRES_SSL=false
RUN_INLINE_REFRESH_WORKER=false
REFRESH_WORKER_POLL_MS=5000
TFNSW_API_KEY=                   # optional; enables live TfNSW traffic volume fetches
```

## Production Cutover

Use this sequence when moving from local SQLite-style operation to shared multi-user production:

1. Provision PostgreSQL and set `DATABASE_URL`.
2. Set `AUTH_MODE=proxy`.
3. Set `DATA_REPOSITORY_DRIVER=postgres` and `PROJECTS_REPOSITORY_DRIVER=postgres`.
4. Run `npm run migrate:postgres` to backfill existing SQLite data.
5. Start a dedicated refresh worker with `npm run worker:refresh`.
6. Run `npm run preflight:production` and resolve any failing checks before go-live.

The admin API now queues refresh jobs instead of running seeds inline, so production deployments should run a dedicated worker process.

## Routes

| Path | Description |
|------|-------------|
| `/` | Home / area selector |
| `/demographics` | Population, age, household composition |
| `/transport` | Journey to work, mode share, commute |
| `/economy` | Employment, industry, income |
| `/education` | Attainment, enrolment |
| `/housing` | Dwelling types, tenure, rent |
| `/growth` | Population & employment projections 2021–2041 |
| `/compare` | Side-by-side LGA comparison |
| `/report` | Exportable PDF report |
| `/admin` | Admin panel (admin protected) |

## Data Sources

| Source | Fields | Refresh |
|--------|--------|---------|
| ABS Census 2021 (SDMX-ML API) | Population, age, income, rent, industry, education, journey to work, SEIFA | Once (census is static) |
| NSW DPE Population Projections | Population projections 2021–2041 | When DPE releases a new file |
| TfNSW TZP24 Employment Projections | Employment by LGA 2021–2066 | When TfNSW releases a new file |
| TfNSW Open Data (bundled) | Modelled mode share, commute time, PT patronage fallback | When updated |
| TfNSW Traffic Volume Counts API | Official road traffic count trends by matched LGA stations | On demand, cached for 7 days |
| NSW Crash Data workbook | Crash totals / fatal / injury trends by LGA | On demand, cached for 7 days |
| TfNSW patronage visualisations | Official patronage reference views exposed via Tableau | Checked on demand |

When `TFNSW_API_KEY` is set, the app will fetch official live road traffic counts from the TfNSW Traffic Volume Counts API and cache them into `tfnsw_cache`. Crash summaries are sourced from the public NSW Crash Data workbook, and patronage availability is detected from TfNSW's published Tableau views so evidence availability is based on connected sources rather than hard-coded status text.
