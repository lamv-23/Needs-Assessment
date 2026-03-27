# Transport Needs Assessment Tool

A Next.js dashboard for exploring population, transport, economic, housing, education and growth data across Greater Sydney LGAs.

## Quick Start

```bash
npm install
npm run seed:static   # seed NSW projections + TfNSW data (~5s) — run once per clone
npm run dev           # http://localhost:3000
```

## Seed Commands

Data is cached in a local SQLite database (`data/cache.db`). Run these from the project root.

| Command | Time | When to run |
|---------|------|-------------|
| `npm run seed:static` | ~5s | Once after cloning; again when NSW DPE releases new projection files |
| `npm run seed:abs -- --lga lga_sydney` | ~2–3 min | Once per LGA — ABS Census data doesn't change between censuses |
| `npm run seed:abs` | ~15 min | Once to seed all 37 LGAs; only needed again after a new Census release |

### Rule of thumb

- **First time on a new machine:** `npm run seed:static` then `npm run seed:abs`
- **Day-to-day:** nothing — data stays in `cache.db`
- **New NSW DPE projection file:** `npm run seed:static`
- **New Census (2026+):** `npm run seed:abs`

> `cache.db` is in `.gitignore` — each developer needs to seed their own local copy.

## Admin Panel

Visit `/admin` and enter your `ADMIN_KEY` (set in `.env.local`) to:
- Check cache status (how many LGAs are seeded)
- Trigger a static or full ABS re-seed from the browser
- Adjust the refresh interval

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
ADMIN_KEY=your-secret-key        # protects /admin and /api/admin/refresh
TFNSW_API_KEY=                   # leave blank until you have one
```

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
| `/admin` | Admin panel (key protected) |

## Data Sources

| Source | Fields | Refresh |
|--------|--------|---------|
| ABS Census 2021 (SDMX-ML API) | Population, age, income, rent, industry, education, journey to work, SEIFA | Once (census is static) |
| NSW DPE Population Projections | Population projections 2021–2041 | When DPE releases a new file |
| TfNSW TZP24 Employment Projections | Employment by LGA 2021–2066 | When TfNSW releases a new file |
| TfNSW Open Data (bundled) | Mode share, commute time, PT patronage | When updated |
