# Real-Time Transport Needs Visualisations — Implementation Plan

> **Goal:** Add a dedicated "Live & Recent Data" section to the `/transport` page showing 8 high-value visuals powered by free, open data sources — going beyond the static 2021 Census snapshots already displayed.
>
> **Constraint:** All data sources must be free and support unlimited (or very high volume) use with no payment required.

---

## 1. Data Sources — Free & Open Only

### Already Integrated (No Change Needed)

| Source | What it provides | Key fields already seeded |
|--------|-----------------|--------------------------|
| **ABS Census API** (SDMX-ML) | Population, medians, journey-to-work mode share, vehicle ownership, labour, education, SEIFA | `journeyToWork`, `vehicleOwnership`, `modeShareTrend` (2011/2016/2021) |
| **ABS ERP API** | Historical population per LGA 2001–2024 | Annual `erp` in `abs_cache` |
| **TfNSW Traffic Volume Counts API** | Annual average daily vehicle counts by traffic monitoring station | `trafficVolumeTrend` in `tfnsw_cache` |
| **NSW Crash Data** (TfNSW Open Data workbook) | Annual total/fatal/injury crashes per LGA | `crashTrend` in `tfnsw_cache` |
| **TfNSW GTFS** (static feed) | ~40k PT stops (train, bus, ferry, light rail, metro) by mode across NSW | `ptStops`, `ptRoutes`, `gtfs_stops` table |
| **NSW DPE Population Projections** (bundled) | LGA-level population 2021–2041 | `nsw_projections` table |
| **TfNSW TZP24 Employment Projections** (bundled) | LGA-level employment 2021–2066 | `nsw_projections` table |

### New Sources to Integrate (All Free, No Payment)

| Source | What it provides | Cost / Limits | Auth |
|--------|-----------------|---------------|------|
| **TfNSW Trip Planner API** (`/v1/tp/trip`) | Scheduled PT journey time from any origin to any destination — actual timetable-based routing | Free, uses existing `TFNSW_API_KEY` | Existing key |
| **TfNSW GTFS-RT** (trip updates feed) | Real-time trip delays — on-time performance for each service | Free, uses existing `TFNSW_API_KEY` | Existing key |
| **TfNSW Incidents API** (`/v2/incidents`) | Current service disruptions by mode and location | Free, uses existing `TFNSW_API_KEY` | Existing key |
| **NSW Spatial Services — Transport Infrastructure Dataset** | Authoritative NSW Government GIS dataset of cycle paths, shared paths, and footpaths as maintained by councils and Transport for NSW | Free, no auth (WFS/GeoJSON from portal.spatial.nsw.gov.au) | None |
| **OpenRouteService API** (pre-computed batch) | Driving distance/time from LGA centroid to CBD — run once per LGA per month | Free, 2,000 matrix req/day; 128 LGAs fits in a single nightly batch | Free registration |
| **data.nsw.gov.au — SCATS Traffic Signal Data** | Intersection throughput and signal cycle data — proxy for urban congestion density | Free, no auth (CSV download) | None |
| **ABS ASGS Boundary Files** | LGA polygon geometries — used to compute area and run spatial queries | Free download from abs.gov.au | None |

> **Why OpenRouteService is acceptable:** 128 LGAs × 1 destination × 4 modes = 512 requests per full refresh. The free tier allows 2,000 matrix requests/day. Results are cached in the database and refreshed monthly — total monthly cost: ~512 requests, well within limits. No payment, no API key sold — free registration only.
>
> **Why NSW Spatial Services replaces OpenStreetMap for infrastructure:** OSM cycle data is community-maintained and inconsistent in outer-suburban and regional NSW — unsuitable for professional planning documents. The NSW Spatial Services Transport Infrastructure layer is the authoritative government dataset, maintained by TfNSW and local councils, and is the source cited in NSW planning submissions and infrastructure business cases. Endpoint: `https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Transport_Theme/MapServer` (WFS/REST, no auth required).

---

## 2. Eight Visuals — Detailed Specifications

---

### Visual 1 — PT vs Car Commute Time Comparison (Grouped Bar)

**What it shows:** For the selected LGA, the scheduled travel time by mode (PT, driving, cycling, walking) from the LGA centroid to the nearest major CBD — based on timetable data, not live traffic.

**Why it's powerful for identifying transport need:**
The gap between car and PT travel time is one of the clearest signals of underserved public transport. "Car: 24 min / PT: 58 min" is more compelling in a needs assessment submission than a mode-share percentage. LGAs with ratios above 2× are strong candidates for PT investment.

**Data sources:**
- **PT travel time:** TfNSW Trip Planner API (`/v1/tp/trip`) — query LGA centroid → Sydney CBD (or nearest major centre) for a standard AM peak departure. Returns scheduled journey time including walking legs and transfers.
- **Driving time:** OpenRouteService Matrix API (`profile=driving-car`) — pre-computed monthly, cached in `commute_times` table.
- **Cycling time:** OpenRouteService (`profile=cycling-regular`) — same batch.
- **Walking time:** OpenRouteService (`profile=foot-walking`) — same batch.

**Caching:** Stored in new `commute_times` table. Refreshed monthly via `npm run seed:static` or on-demand from admin panel.

**Chart type:** `NeedsBarChart` (horizontal layout). Y-axis = mode; X-axis = minutes. Add a vertical reference line at the car travel time to highlight the PT penalty.

**Display note:** PT travel time labelled *"Scheduled travel time — TfNSW timetable data (transportnsw.info)"*. Driving/cycling/walking labelled *"Indicative routing — OpenStreetMap road network via OpenRouteService. Suitable for benchmarking; not for precise engineering calculations."*

---

### Visual 2 — PT On-Time Performance by Hour (Stacked Bar / Heatmap)

**What it shows:** For the selected LGA (matched by nearest GTFS stops), the percentage of scheduled PT trips that run on-time (≤5 min delay) for each hour of the day — aggregated across the past 7 days from GTFS-RT.

**Why it's powerful:**
High PT mode share requires reliable service. If AM peak services run at 60% on-time, that alone explains low ridership even where stops exist. This goes beyond the static Census snapshot to show *why* PT is or isn't used.

**Data source:** TfNSW GTFS-RT Trip Updates feed — match `stop_id` values from `gtfs_stops` table to LGA, then compute % delayed by hour over a rolling 7-day window.

**Storage:** New `gtfs_reliability` table: `(lga_code, mode, hour_of_day, week_start, pct_on_time, trip_count)`. Populated by a nightly seed script (`scripts/seed-reliability.ts`).

**Chart type:** `StackedBar` with hours 0–23 on X-axis. Stack two series: "On time" (green) and "Delayed" (amber/red). Add a `ReferenceLine` at 90% as a service standard benchmark.

---

### Visual 3 — Active Transport Infrastructure vs Adoption Gap (Grouped Bar)

**What it shows:** For each LGA in the comparison set: km of dedicated cycling infrastructure (cycle lanes + shared paths + off-road paths) per 10,000 residents alongside the walking+cycling commute mode share from Census 2021. LGAs with high infrastructure but low adoption — or vice versa — reveal different types of need.

**Why it's powerful:**
Distinguishes between infrastructure need (low km/capita) and behaviour-change need (good infrastructure, low adoption). Both require different policy responses, and both are fundable through different grants.

**Data sources:**
- **Cycle infrastructure:** NSW Spatial Services — Transport Infrastructure Dataset (WFS REST endpoint `portal.spatial.nsw.gov.au`). Query feature types: `CycleTrack`, `SharedPath`, `FootPath` clipped to LGA boundary. This is the **authoritative government dataset** maintained by TfNSW and local councils — the same source cited in NSW infrastructure business cases. Free, no authentication required.
- **Population:** ABS ERP (already seeded).
- **Mode share:** ABS Census Journey-to-Work `active` field (already seeded).

**Caching:** NSW Spatial Services results in new `nsw_infrastructure` table: `(lga_code, feature_type, total_length_km, fetched_at)`. Refresh monthly (data updates infrequently).

**Chart type:** `NeedsBarChart` (grouped, vertical). Two bar groups per LGA: "Cycle infrastructure (km/10k residents)" and "Active transport mode share (%)". Use dual-axis if ranges differ significantly.

---

### Visual 4 — PT Stop Density vs Mode Share Scatter Plot (Scatter)

**What it shows:** Each NSW LGA plotted as a dot: X-axis = PT stops per km² (from `gtfs_stops`), Y-axis = PT commute mode share (Census 2021). A regression trendline shows the expected relationship. LGAs significantly below the trendline have more stops than their mode share suggests — pointing to frequency, reliability, or quality gaps rather than coverage gaps.

**Why it's powerful:**
Diagnoses whether low PT mode share is a *supply* problem (few stops) or a *quality/frequency* problem. This distinction determines whether the recommendation is "build more stops" or "increase service frequency" — entirely different investment cases.

**Data sources:**
- **Stop density:** `gtfs_stops` table (already seeded) + LGA area from ABS ASGS boundary GeoJSON.
- **Mode share:** ABS Census Journey-to-Work (already seeded).
- Both sources are already in the database — no new fetch required.

**Chart type:** New `NeedsScatterChart.tsx` component using Recharts `ScatterChart` + `Scatter`. Include a computed linear regression trendline rendered as a `ReferenceLine`. Highlight the currently selected LGA with a distinct colour.

**Interactivity:** Tooltip shows LGA name, stop count, mode share. Click dot to navigate to that LGA's `/transport` page.

---

### Visual 5 — Traffic Volume Growth vs Population Growth (Dual-Line)

**What it shows:** Annual index of (a) average daily vehicle counts from TfNSW traffic monitoring stations in the LGA and (b) LGA population from ABS ERP — both normalised to a 2015 baseline of 100. Where traffic grows faster than population, car dependency is increasing; where they track together, mode share is stable.

**Why it's powerful:**
This is a free, already-available congestion signal. If traffic growth outpaces population growth, investment in PT alternatives is overdue. Beats a single-year snapshot by showing the direction of travel. No paid traffic speed API required.

**Data sources:**
- **Traffic volume:** `trafficVolumeTrend` from TfNSW Traffic Volume Counts API (already seeded into `tfnsw_cache`).
- **Population:** ABS ERP annual series 2001–2024 (already seeded into `abs_cache` under `ERP`).

**Chart type:** `NeedsLineChart` with two series (Traffic Index, Population Index), both rebased to 100 at the earliest overlapping year. Add a `ReferenceLine` at 100 labelled "Baseline."

---

### Visual 6 — Road Safety Risk by Mode (Stacked Bar with Benchmark)

**What it shows:** Annual crashes per 100,000 residents broken down by road-user type (car occupant, pedestrian, cyclist, motorcyclist) for the past 5 years. NSW average overlaid as a reference line. LGAs with elevated pedestrian or cyclist crash rates signal unsafe active transport environments.

**Why it's powerful:**
High pedestrian/cyclist crash rates directly demonstrate that active transport infrastructure is unsafe — a fundable need. Also reveals whether road safety is improving or worsening independent of population growth.

**Data sources:**
- **Crash breakdown by mode:** Extend existing `crashTrend` fetch in `src/lib/tfnsw-api.ts` to request the NSW Crash Data workbook columns for pedestrian/cyclist/motorcyclist separately (these columns exist in the published CSV).
- **Population denominator:** ABS ERP (already seeded).

**Chart type:** `StackedBar` — each year as a group, stacked by mode. Recharts `ReferenceLine` for NSW average total crash rate. Tooltip shows absolute crash count + rate per 100k.

---

### Visual 7 — Projected Transport Demand vs Current PT Capacity (Stacked Area)

**What it shows:** Modelled total PT trip demand from 2021 to 2041 (population growth × current PT mode share, held constant as a conservative estimate) plotted against a PT capacity estimate derived from current GTFS route frequency. The shaded gap between the two lines represents unmet demand if no investment occurs.

**Why it's powerful:**
This is the planning centrepiece of any transport needs assessment: quantifying *how much* additional PT capacity is needed and *when* the gap becomes critical. Directly supports grant applications and strategic plans.

**Data sources:**
- **Population projections:** NSW DPE data (already seeded — `nsw_projections` table).
- **Current mode share:** ABS Census Journey-to-Work (already seeded).
- **PT capacity estimate:** GTFS `frequencies.txt` or `stop_times.txt` — compute average trips per route per hour × number of routes in LGA as a capacity proxy.

**Chart type:** Recharts `AreaChart` with two areas: "Projected Demand (trips/day)" and "Current Capacity (estimated trips/day)". Shade the gap area red. `DataSourceBadge` clearly marks capacity as estimated.

---

### Visual 8 — Multi-Modal Accessibility Radar (Radar / Spider Chart)

**What it shows:** Six-axis radar chart comparing the selected LGA to the Greater Sydney average across:
1. **PT coverage** — % of residential area within 800m of a PT stop (from `gtfs_stops` + LGA boundary)
2. **PT reliability** — % of trips on-time in AM peak (from Visual 2)
3. **Commute competitiveness** — inverse of PT/car travel time ratio (from Visual 1; closer to 1 = better)
4. **Active transport safety** — inverse of pedestrian+cyclist crash rate (from Visual 6)
5. **Infrastructure provision** — cycle lane km per 10,000 residents (from Visual 3)
6. **Traffic pressure** — inverse of traffic-growth-to-population-growth ratio (from Visual 5)

All axes normalised 0–100 so the chart is dimensionless. A score of 100 on all axes = best-in-class across NSW LGAs.

**Why it's powerful:**
Synthesises all preceding data into a single "at-a-glance" card that non-technical stakeholders (councillors, grant assessors) can immediately interpret. The shape of the radar instantly shows *which* dimension of transport need is most acute — coverage, reliability, safety, or infrastructure.

**Data source:** Computed from Visuals 1–7. No new data fetch required. Normalisation uses min/max across all 128 NSW LGAs to produce comparable scores.

**Chart type:** New `NeedsRadarChart.tsx` component using Recharts `RadarChart` + `PolarGrid` + `PolarAngleAxis`. Two `Radar` series: selected LGA (filled, coloured) and Greater Sydney average (stroke-only, grey). Available via `ChartWrapper` PNG export for report inclusion.

---

## 3. Phased Implementation

### Phase 1 — Zero New Dependencies (Use Database Already Seeded)
Visuals **4, 5, 6, 7** use only data already in the SQLite database. No new API calls, no new keys, no infrastructure changes. These can be built immediately.

### Phase 2 — Extend Existing TfNSW Integration (Existing API Key)
Visuals **2** — add GTFS-RT nightly seed script. Uses `TFNSW_API_KEY` already in `.env.local`.

### Phase 3 — New Free API Integrations
Visuals **1** and **3**:
- Visual 1: Add TfNSW Trip Planner API calls + OpenRouteService pre-computed driving times (free registration). ORS outputs displayed with "indicative" label.
- Visual 3: Add NSW Spatial Services WFS queries for authoritative cycle/path infrastructure lengths.

### Phase 4 — Synthesis
Visual **8** (Radar) — depends on computed outputs from Phases 1–3.

---

## 4. Architecture

### New API Routes
```
/api/transport/commute-times/[lgaId]        → TfNSW Trip Planner + ORS driving (cached monthly)
/api/transport/reliability/[lgaId]          → GTFS-RT aggregated on-time % (cached nightly)
/api/transport/nsw-infrastructure/[lgaId]   → NSW Spatial Services cycle/path lengths (cached monthly)
/api/transport/accessibility-score/[lgaId]  → Computed from all above (cached daily)
```

### New Database Tables
```sql
-- Scheduled commute times (from TfNSW Trip Planner + OpenRouteService)
CREATE TABLE commute_times (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lga_code   TEXT NOT NULL,
  destination TEXT NOT NULL,   -- 'sydney_cbd', 'parramatta_cbd', etc.
  mode       TEXT NOT NULL,    -- 'transit', 'driving', 'cycling', 'walking'
  duration_minutes REAL,
  distance_km REAL,
  fetched_date TEXT NOT NULL,
  UNIQUE(lga_code, destination, mode, fetched_date)
);

-- PT on-time performance (from GTFS-RT)
CREATE TABLE gtfs_reliability (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lga_code     TEXT NOT NULL,
  mode         TEXT NOT NULL,   -- 'train', 'bus', 'ferry', 'light_rail', 'metro'
  hour_of_day  INTEGER NOT NULL,
  week_start   TEXT NOT NULL,   -- ISO date of Monday
  pct_on_time  REAL,
  trip_count   INTEGER,
  UNIQUE(lga_code, mode, hour_of_day, week_start)
);

-- NSW Spatial Services cycling/walking infrastructure (authoritative government source)
CREATE TABLE nsw_infrastructure (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lga_code     TEXT NOT NULL,
  feature_type TEXT NOT NULL,   -- 'CycleTrack', 'SharedPath', 'FootPath'
  total_length_km REAL,
  fetched_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(lga_code, feature_type)
);
```

### New Chart Components Required
| Component | Type | Notes |
|-----------|------|-------|
| `src/components/charts/ScatterChart.tsx` | Recharts `ScatterChart` | Include linear regression trendline; click-to-navigate |
| `src/components/charts/RadarChart.tsx` | Recharts `RadarChart` | 0–100 normalised axes; two series (LGA vs benchmark) |

### Existing Components Reused (No Changes)
| Component | Used by Visuals |
|-----------|----------------|
| `NeedsBarChart` | 1, 3 |
| `NeedsLineChart` | 5 |
| `StackedBar` | 2, 6, 7 |
| `ChartWrapper` | All (export + collapse) |
| `DataSourceBadge` | All (source attribution) |

---

## 5. Cost & API Limit Summary

| Source | Cost | Limit | Caching strategy | Professional status |
|--------|------|-------|-----------------|-------------------|
| TfNSW Trip Planner API | Free | Generous (existing key) | Cache monthly per LGA | ✅ Authoritative — official TfNSW timetable |
| TfNSW GTFS-RT | Free | Generous (existing key) | Aggregate nightly, store weekly rollups | ✅ Authoritative — official TfNSW operations |
| TfNSW Traffic Volume Counts | Free | Generous (existing key) | Already in `tfnsw_cache` | ✅ Authoritative — official monitoring stations |
| NSW Crash Data (Centre for Road Safety) | Free | Unlimited | Re-seed annually | ✅ Authoritative — primary source for all NSW road safety reports |
| **NSW Spatial Services** (cycle/path infrastructure) | Free | No auth, REST/WFS | Cache monthly in `nsw_infrastructure` | ✅ Authoritative — NSW Government GIS, cited in planning submissions |
| OpenRouteService (driving/cycling/walking times) | Free | 2,000 matrix req/day | 128 LGAs × 3 modes = 384 req/month | ⚠️ Indicative — label as "benchmarking only, OpenStreetMap network" |
| ABS APIs | Free | Unlimited | Already in `abs_cache` | ✅ Authoritative |
| NSW DPE / TfNSW TZP24 (bundled) | Free | N/A (local files) | Already in `nsw_projections` | ✅ Authoritative |

**Total additional API cost: $0**

> **Attribution note for Visual 1:** OpenRouteService driving/cycling/walking times must be displayed with a `DataSourceBadge` noting *"Indicative — OpenStreetMap routing via OpenRouteService. Suitable for benchmarking; not for precise engineering calculations."* The PT time from TfNSW Trip Planner carries no such caveat and is fully authoritative.

---

## 6. UI Layout

Add a new collapsible section at the bottom of `/transport`, below the existing charts:

```
┌─────────────────────────────────────────────────────────────────┐
│  Live & Recent Transport Intelligence                      [▼]  │
│  TfNSW Open Data · ABS · NSW Spatial Services · NSW Open Data  │
├───────────────────────────┬─────────────────────────────────────┤
│  Visual 1                 │  Visual 2                           │
│  PT vs Car Commute Time   │  On-Time Performance by Hour        │
├───────────────────────────┼─────────────────────────────────────┤
│  Visual 3                 │  Visual 4                           │
│  Active Transport Gap     │  PT Stop Density vs Mode Share      │
├───────────────────────────┼─────────────────────────────────────┤
│  Visual 5                 │  Visual 6                           │
│  Traffic vs Population    │  Crash Risk by Mode                 │
├───────────────────────────┴─────────────────────────────────────┤
│  Visual 7 (full width)                                          │
│  Projected Transport Demand vs Current PT Capacity              │
├─────────────────────────────────────────────────────────────────┤
│  Visual 8 (full width)                                          │
│  Multi-Modal Accessibility Radar                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Files to Create / Modify

| File | Action | Notes |
|------|--------|-------|
| `src/app/transport/page.tsx` | Modify | Add "Live Transport Intelligence" collapsible section |
| `src/lib/data/live-data.ts` | Modify | Add `getLiveRealtimeTransportData()` aggregator |
| `src/lib/tfnsw-trip-planner.ts` | Create | TfNSW Trip Planner API client with caching |
| `src/lib/openrouteservice.ts` | Create | ORS Matrix API client (driving/cycling/walking) |
| `src/lib/nsw-spatial-services.ts` | Create | NSW Spatial Services WFS client for cycle/path infrastructure |
| `src/lib/db.ts` | Modify | Add `commute_times`, `gtfs_reliability`, `nsw_infrastructure` tables |
| `src/components/charts/ScatterChart.tsx` | Create | Recharts ScatterChart + regression trendline |
| `src/components/charts/RadarChart.tsx` | Create | Recharts RadarChart, 0–100 normalised axes |
| `src/app/api/transport/commute-times/[lgaId]/route.ts` | Create | Server-side proxy + cache for trip planner + ORS |
| `src/app/api/transport/reliability/[lgaId]/route.ts` | Create | GTFS-RT on-time aggregation |
| `src/app/api/transport/nsw-infrastructure/[lgaId]/route.ts` | Create | NSW Spatial Services proxy + cache |
| `src/app/api/transport/accessibility-score/[lgaId]/route.ts` | Create | Computed radar scores |
| `scripts/seed-reliability.ts` | Create | Nightly GTFS-RT batch aggregation (add to `npm run seed:static`) |
| `.env.local` (template) | Note | Add `OPENROUTESERVICE_API_KEY` (free registration at openrouteservice.org) |

---

*Last updated: April 2026*
