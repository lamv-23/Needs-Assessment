# Real-Time Transport Visuals — Setup & Activation Guide

> This guide covers which of the 8 new visuals in the "Live & Recent Transport Intelligence"
> section of `/transport` require additional setup, and how to activate them.

---

## Quick Status Overview

| # | Visual | Works out of the box? | Requires |
|---|--------|-----------------------|----------|
| 1 | PT vs Car Commute Time | ⚠️ Partial | `OPENROUTESERVICE_API_KEY` + `TFNSW_API_KEY` |
| 2 | PT On-Time Performance by Hour | ❌ No data until seeded | `npm run seed:reliability` (TBD) |
| 3 | Active Transport Infrastructure | ⚠️ Partial | `OPENROUTESERVICE_API_KEY` (ORS not used here — just NSW Spatial, which is free/no key) |
| 4 | PT Stop Density vs Mode Share | ✅ Yes | `npm run seed:abs` + GTFS seeded |
| 5 | Traffic vs Population Growth Index | ✅ Yes | `npm run seed:abs` + `TFNSW_API_KEY` |
| 6 | Crash Risk by Severity | ✅ Yes | Crash data auto-fetched (no key) |
| 7 | Projected Demand vs PT Capacity | ✅ Yes | `npm run seed:static` + GTFS seeded |
| 8 | Multi-Modal Accessibility Radar | ✅ Yes (partial scores) | Improves as other visuals populate |

---

## Step 1 — Seed Existing Data (Already Covered by Normal Setup)

If you've already run the standard seeds, Visuals 4–7 work immediately:

```bash
npm run seed:static    # NSW DPE projections + TfNSW TZP24 + transport static (~5s)
npm run seed:abs       # ABS Census + ERP data for all 128 LGAs (~30–40 min)
```

GTFS stops must also be seeded for Visual 4 and 7:
```bash
npm run seed:gtfs      # TfNSW GTFS stops (~2 min, requires TFNSW_API_KEY)
```

---

## Step 2 — OpenRouteService API Key (Visual 1 — driving/cycling/walking times)

**What it enables:** Driving, cycling, and walking travel times from each LGA centroid to the nearest CBD (Visual 1 — PT vs Car Commute Time).

**Cost:** Free — no credit card required.

**Steps:**
1. Register at [openrouteservice.org/dev/#/signup](https://openrouteservice.org/dev/#/signup)
2. Create a free API key (token)
3. Add to `.env.local`:
   ```
   OPENROUTESERVICE_API_KEY=your_key_here
   ```
4. Trigger a refresh for a specific LGA by calling:
   ```
   GET /api/transport/commute-times/lga_sydney
   ```
   Or run a batch seed (see Step 4).

**Rate limits:** 2,000 matrix requests/day. Full 128-LGA refresh = 384 requests (well within limit).
Results are cached monthly — you won't hit limits in normal operation.

**Important:** Driving/cycling/walking times are displayed with an "indicative" label in the UI.
They use OpenStreetMap road network data and are suitable for benchmarking, not engineering calculations.
PT times (from TfNSW Trip Planner) are authoritative and have no such caveat.

---

## Step 3 — NSW Spatial Services (Visual 3 — Cycle Infrastructure)

**What it enables:** Authoritative km of cycle tracks and footpaths per LGA.

**Cost:** Free — no registration, no API key.
Source: `portal.spatial.nsw.gov.au` (NSW Government ArcGIS REST service)

Data is fetched automatically when you first visit `/transport` for a given LGA (or call the API route).
Results are cached for 30 days.

To pre-populate for an LGA:
```
GET /api/transport/nsw-infrastructure/lga_sydney
```

**Troubleshooting:** If the NSW Spatial Services endpoint returns empty results, the LGA name
may not match the feature service's `LGA_NAME` field. The client strips common prefixes
("City of", "The") — but unusual LGA names may need a manual alias.

---

## Step 4 — Batch Commute Time Pre-Population (Visual 1)

To pre-populate commute times for all key LGAs at once (rather than on-demand):

```bash
# Run this once after setting OPENROUTESERVICE_API_KEY + TFNSW_API_KEY
node -e "
const LGAs = ['lga_sydney','lga_parramatta','lga_blacktown','lga_penrith','lga_camden',
               'lga_liverpool','lga_campbelltown','lga_bankstown','lga_ryde','lga_hornsby'];
const base = 'http://localhost:3000';
(async () => {
  for (const lga of LGAs) {
    const r = await fetch(base + '/api/transport/commute-times/' + lga);
    console.log(lga, r.status);
    await new Promise(res => setTimeout(res, 1500)); // ORS rate limit: ~1 req/sec
  }
})();
"
```

Results are cached in the `commute_times` SQLite table and refreshed monthly.

---

## Step 5 — PT On-Time Performance (Visual 2)

**Status:** Scaffolded. The database table (`gtfs_reliability`) and API route
(`/api/transport/reliability/[lgaId]`) are ready. A seed script needs to be created
to populate it from the TfNSW GTFS-RT feed.

**When implemented**, the seed script will:
1. Fetch TfNSW GTFS-RT Trip Updates feed for each mode
2. Match `stop_id` values to LGAs using the `gtfs_stops` table
3. Aggregate % on-time by mode + hour of day over a 7-day rolling window
4. Store in `gtfs_reliability` table

**Planned command:** `npm run seed:reliability`

Until this script is built, Visual 2 shows a placeholder message.

---

## Environment Variables Summary

Add these to `.env.local` (copy from `.env.example`):

```bash
# Already required (existing)
TFNSW_API_KEY=your_tfnsw_key          # TfNSW Open Data API key
                                       # Register: opendata.transport.nsw.gov.au

# New — required for Visual 1 (driving/cycling/walking times)
OPENROUTESERVICE_API_KEY=your_ors_key  # Free: openrouteservice.org/dev/#/signup

# Not required — NSW Spatial Services has no auth
# Not required — ABS APIs have no auth
# Not required — NSW Crash Data has no auth (CSV download)
```

---

## Data Refresh Schedule

| Data | Cache duration | How to refresh |
|------|---------------|----------------|
| Commute times (ORS + TfNSW Trip Planner) | 30 days | Auto on page visit; or call API route |
| NSW Spatial Services infrastructure | 30 days | Auto on page visit; or call API route |
| PT reliability (GTFS-RT) | Weekly | `npm run seed:reliability` (TBD) |
| ABS Census data | Manual | `npm run seed:abs` |
| TfNSW crash data | 7 days | Auto (fetched by existing seed) |
| TfNSW traffic counts | 7 days | Auto (fetched by existing seed) |
| NSW DPE projections | Manual | `npm run seed:static` |

---

## Admin Panel Visibility

The `/admin` page shows ABS cache status and refresh logs.
The new tables (`commute_times`, `gtfs_reliability`, `nsw_infrastructure`) are visible
directly in the SQLite database at `data/cache.db` but are not yet surfaced in the admin UI.

---

*Last updated: April 2026*
