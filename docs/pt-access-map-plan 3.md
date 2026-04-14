# Public Transport Access Map — Implementation Plan

## Context

The Transport Needs Assessment tool currently shows **aggregated** transport metrics at the LGA level (mode share, commute times, PT patronage) on the `/transport` page. What it lacks is a way to explore public transport access at a **specific point** — i.e. "if I live/work here, how many bus stops and train stations are within walking distance?"

This plan adds an interactive map tool at `/access-map` where users can click to drop a draggable pin anywhere in NSW, adjust a radius slider (500m–5km), and see live counts of bus stops, train stations, ferry wharves, light rail stops, and metro stations within that radius — plus those stops rendered as dots on the map.

**Data foundation already exists but needs extending:** `scripts/seed-gtfs.ts` already downloads all NSW GTFS feeds (Sydney Trains, NSW Trains, Buses, Light Rail, Ferry, Metro) and parses every stop's lat/lng — but currently only persists aggregated per-LGA counts to `tfnsw_cache`. We extend the same script to also persist individual stops to a new `gtfs_stops` SQLite table, unlocking point-based spatial queries.

**Why this matters:** Public transport catchment analysis (the "800m = 10-min walk" convention) is a core tool in transport planning. Currently users need external tools to answer "what's the PT access like at location X?" — this feature brings that into the needs assessment workflow.

## Design choices (locked in from brainstorming)

| Decision | Choice |
|---|---|
| Route | New top-level `/access-map`, added to sidebar under *Tools* |
| Data source | Extend `seed-gtfs.ts` to persist all stops to new SQLite `gtfs_stops` table |
| Selection UX | Click to drop a draggable pin; drag to fine-tune |
| Radius control | Slider, 500m–5km, live updates (debounced ~200ms) |
| Distance metric | Straight-line (haversine) |
| Initial map center | Centroid of currently-selected LGA from `useAppStore()` |
| Results display | Stat cards (count by mode) + stops rendered as dots on the map |
| Mobile | Stacked single-column below `md:` breakpoint |

## Implementation steps

### 1. Database schema — new `gtfs_stops` table

**File:** [src/lib/db.ts](src/lib/db.ts)

Add a new `CREATE TABLE IF NOT EXISTS` statement alongside the existing `tfnsw_cache`:

```sql
CREATE TABLE IF NOT EXISTS gtfs_stops (
  stop_id   TEXT PRIMARY KEY,   -- prefixed with feed id to avoid collisions across feeds
  stop_name TEXT NOT NULL,
  lat       REAL NOT NULL,
  lng       REAL NOT NULL,
  mode      TEXT NOT NULL,      -- 'train' | 'bus' | 'ferry' | 'lightRail' | 'metro'
  feed      TEXT NOT NULL       -- source feed id
);
CREATE INDEX IF NOT EXISTS idx_gtfs_stops_latlng ON gtfs_stops(lat, lng);
CREATE INDEX IF NOT EXISTS idx_gtfs_stops_mode ON gtfs_stops(mode);
```

Export helper functions:
- `upsertGtfsStop(stop)` — single-row insert-or-replace
- `upsertGtfsStopsBatch(stops)` — wrapped in a transaction for bulk seed
- `queryGtfsStopsInBounds(minLat, maxLat, minLng, maxLng)` — bounding-box lookup for the API route
- `clearGtfsStops()` — so re-seeds produce a clean dataset

### 2. Extend the GTFS seed script

**File:** [scripts/seed-gtfs.ts](scripts/seed-gtfs.ts)

Current state: parses `stops.txt` (line ~205 reads `stop_lat`/`stop_lon`), spatially joins to LGAs via `@turf/boolean-point-in-polygon`, aggregates counts into `tfnsw_cache`.

Changes:
- Before the existing per-stop loop, call `clearGtfsStops()` for a clean seed
- In the per-stop loop, also push a record `{ stop_id: <feed>_<id>, stop_name, lat, lng, mode, feed }` into a local array
- Determine each stop's `mode` by looking at the route types that serve it via `stop_times.txt` → `trips.txt` → `routes.txt` (the existing aggregation already does this mapping via `routeTypeToMode()` at line ~44 — reuse it). If a stop serves multiple modes (rare), pick the "heaviest" mode in the order: metro > train > lightRail > ferry > bus.
- After processing all stops for a feed, call `upsertGtfsStopsBatch(stops)`
- Log the total inserted count at the end

**Reused helpers:** `routeTypeToMode()`, the existing GTFS parsing / ZIP extraction / CSV parsing code.

### 3. API route — point-based stop query

**New file:** [src/app/api/transport/stops-near/route.ts](src/app/api/transport/stops-near/route.ts)

GET handler, query params: `lat`, `lng`, `radius` (meters).

```ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');
  const radius = parseFloat(searchParams.get('radius') ?? '1000');
  // validate inputs...

  // 1. Compute bounding box (rough deg/m conversion)
  const latDelta = radius / 111_320;
  const lngDelta = radius / (111_320 * Math.cos(lat * Math.PI / 180));

  // 2. Index-backed bounding box query
  const candidates = queryGtfsStopsInBounds(
    lat - latDelta, lat + latDelta,
    lng - lngDelta, lng + lngDelta
  );

  // 3. Precise haversine filter
  const stops = candidates
    .map(s => ({ ...s, distance_m: haversine(lat, lng, s.lat, s.lng) }))
    .filter(s => s.distance_m <= radius);

  // 4. Aggregate counts
  const counts = { bus: 0, train: 0, ferry: 0, lightRail: 0, metro: 0, total: stops.length };
  for (const s of stops) counts[s.mode]++;

  return Response.json({ stops, counts });
}
```

Add a small `haversine()` utility (either inline in the route or in `src/lib/geo.ts` if we want to reuse).

**Expected performance:** ~40k rows total, index prefilter cuts to <1k candidates, haversine over 1k points is sub-millisecond. Target <10ms per request.

### 4. Map component — `AccessRadiusMap`

**New file:** [src/components/maps/AccessRadiusMap.tsx](src/components/maps/AccessRadiusMap.tsx)

Client component (`'use client'`). Leaflet imported at top level, same pattern as [src/components/maps/ChoroplethMapDirect.tsx](src/components/maps/ChoroplethMapDirect.tsx).

Props:
```ts
interface AccessRadiusMapProps {
  initialCenter: [number, number];
  point: { lat: number; lng: number } | null;
  radius: number;          // meters
  stops: Array<{ lat: number; lng: number; mode: string; stop_name: string }>;
  onPointChange: (lat: number, lng: number) => void;
}
```

Responsibilities:
- Initialize Leaflet map on mount, CartoDB Light tiles (matches `MapRenderer.tsx`)
- On map `click` → call `onPointChange(e.latlng.lat, e.latlng.lng)`
- Maintain a single `L.marker` (draggable) reflecting `point`; update position when prop changes
- On marker `dragend` → `onPointChange(marker.lat, marker.lng)`
- Maintain a single `L.circle` reflecting `radius`; update on prop change
- Maintain a layer group of `L.circleMarker`s for `stops`, colored by mode:
  - train: `#e11d48` (red)
  - metro: `#7c3aed` (purple)
  - bus: `#2563eb` (blue)
  - lightRail: `#f59e0b` (amber)
  - ferry: `#0891b2` (cyan)
- Clean up the map instance on unmount

**Mobile:** the map container must have an explicit height (e.g. `h-[60vh] md:h-full`) — Leaflet collapses without one.

### 5. Page — `/access-map`

**New file:** [src/app/access-map/page.tsx](src/app/access-map/page.tsx)

Client component. Structure:

```tsx
'use client';

export default function AccessMapPage() {
  const { selectedArea } = useAppStore();
  const initialCenter = useLGACentroid(selectedArea); // helper (see below)

  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(1000);

  // Debounced SWR fetch
  const debouncedPoint = useDebounce(point, 200);
  const debouncedRadius = useDebounce(radius, 200);
  const swrKey = debouncedPoint
    ? `/api/transport/stops-near?lat=${debouncedPoint.lat}&lng=${debouncedPoint.lng}&radius=${debouncedRadius}`
    : null;
  const { data } = useSWR(swrKey, fetcher);

  return (
    <MainLayout>
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 h-[60vh] md:h-[calc(100vh-8rem)]">
          <AccessRadiusMap
            initialCenter={initialCenter}
            point={point}
            radius={radius}
            stops={data?.stops ?? []}
            onPointChange={(lat, lng) => setPoint({ lat, lng })}
          />
        </div>
        <div className="w-full md:w-80 space-y-4">
          <RadiusSlider value={radius} onChange={setRadius} />
          <StatCardsGrid counts={data?.counts} />
          {!point && <EmptyState message="Click the map to drop a pin" />}
        </div>
      </div>
    </MainLayout>
  );
}
```

**Responsive layout:**
- Desktop (`md:`): two-column flex row, map ~60% width, sidebar panel 320px
- Mobile: stacked column, map gets 60vh, sidebar panel below
- Stat cards: `grid-cols-2` on mobile and desktop (so they form a 2×2 grid in the narrow sidebar panel)

**Subcomponents** (inline in the page file unless they grow):
- `RadiusSlider` — labeled `<input type="range">` with 500m–5000m range, step 100, showing current value in km
- `StatCardsGrid` — reuses existing [src/components/ui/StatCard.tsx](src/components/ui/StatCard.tsx) with lucide-react icons (Bus, Train, Ship, TramFront, Cable)
- `EmptyState` — small placeholder when no point selected yet

**LGA centroid helper:** new util `src/lib/geo.ts` exporting `getLGACentroid(areaId)` which loads [public/geo/lga-nsw.json](public/geo/lga-nsw.json) and averages the coordinates of the matching feature. Falls back to Sydney CBD `[-33.8688, 151.2093]` if not found. Cache the GeoJSON import at module level to avoid re-parsing.

### 6. Sidebar navigation

**File:** [src/components/layout/Sidebar.tsx](src/components/layout/Sidebar.tsx)

Add one entry to the *Tools* section:
```ts
{ href: '/access-map', label: 'PT Access Map', icon: MapPin }
```
(Import `MapPin` from `lucide-react` if not already.)

Mirror the same entry in [src/components/layout/MobileNav.tsx](src/components/layout/MobileNav.tsx) if it has its own nav list.

### 7. package.json — confirm seed script

**File:** [package.json](package.json)

Ensure `"seed:gtfs": "tsx scripts/seed-gtfs.ts"` is present. (It's listed as modified in git status so likely already added — verify.)

## Files to create

- `src/app/access-map/page.tsx`
- `src/app/api/transport/stops-near/route.ts`
- `src/components/maps/AccessRadiusMap.tsx`
- `src/lib/geo.ts` (centroid helper + haversine utility)

## Files to modify

- `src/lib/db.ts` — add `gtfs_stops` table + helper functions
- `scripts/seed-gtfs.ts` — persist individual stops alongside existing aggregation
- `src/components/layout/Sidebar.tsx` — add nav entry
- `src/components/layout/MobileNav.tsx` — add nav entry (if applicable)
- `package.json` — confirm `seed:gtfs` script

## Existing code to reuse

- [src/components/maps/ChoroplethMapDirect.tsx](src/components/maps/ChoroplethMapDirect.tsx) — Leaflet integration pattern (top-level import, `useRef`, click handlers)
- [src/components/maps/MapRenderer.tsx](src/components/maps/MapRenderer.tsx) — CartoDB Light tile layer URL
- [src/components/ui/StatCard.tsx](src/components/ui/StatCard.tsx) — for the count-by-mode cards
- [src/components/ui/DataSourceBadge.tsx](src/components/ui/DataSourceBadge.tsx) — for data attribution at top of page
- [scripts/seed-gtfs.ts](scripts/seed-gtfs.ts) — `routeTypeToMode()` at line ~44, CSV parsing, ZIP extraction
- [src/lib/db.ts](src/lib/db.ts) — existing table/upsert patterns to follow
- [src/store/appStore.ts] (via `useAppStore`) — `selectedArea` for initial map center
- [public/geo/lga-nsw.json](public/geo/lga-nsw.json) — LGA polygons for centroid computation

## Verification

1. **Seed the data**
   ```bash
   npm run seed:gtfs
   sqlite3 data/cache.db "SELECT mode, COUNT(*) FROM gtfs_stops GROUP BY mode"
   ```
   Expect: ~30k–40k bus stops, ~300 train, small counts for ferry/lightRail/metro.

2. **API sanity check**
   ```bash
   curl 'http://localhost:3000/api/transport/stops-near?lat=-33.8688&lng=151.2093&radius=1000'
   ```
   Sydney CBD should return dozens of bus stops plus Town Hall / Wynyard / Martin Place train stations. Verify `counts.total === stops.length`.

3. **UI smoke test**
   - Navigate to `/access-map`
   - Map should auto-center on the currently-selected LGA
   - Click on the map → pin drops, counts appear, stops render as dots within the circle
   - Drag the pin → results update after short pause (debounced)
   - Move the slider from 500m to 5km → circle grows, counts grow, more dots appear
   - Switch selected LGA in the global area selector, reload page → map re-centers

4. **Edge cases**
   - Radius at 500m in rural area (e.g. Balranald) → likely 0 stops, no errors
   - Click in the ocean → 0 stops
   - Very large radius (5km) in dense area → lots of dots, verify map stays responsive

5. **Mobile check**
   - Resize browser to <768px width → layout stacks, map has visible height, slider and stat cards below, touch-drag on pin works
   - Stat cards form a 2×2 grid and stay readable

6. **Performance check**
   ```bash
   time curl 'http://localhost:3000/api/transport/stops-near?lat=-33.8688&lng=151.2093&radius=5000'
   ```
   Expect <50ms total (most of which is Next.js overhead; the query itself should be <10ms).
