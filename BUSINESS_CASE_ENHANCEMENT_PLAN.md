# Business Case Enhancement Plan
> Status: Ready to implement · Last updated: 2026-04-06

## Summary
Deepen the analysis depth and usability of `/business-case` by adding:
- Auto-generated narrative "Key Finding" callouts per section (data-driven, copy-paste ready)
- Benchmark comparisons vs Greater Sydney and NSW averages
- Dynamic framing based on project type (road/rail/active/freight) + target mode (bus/train/cycling/walking/multi-modal)
- Radar chart for multi-criteria gap assessment
- Filled area chart for do-minimum growth scenario
- Congestion section rebuilt from scratch (currently near-empty)
- Gap section rebuilt with RAG table + policy alignment
- Journey-to-work caveat on all mode share charts
- Evidence table driven from live data `meta` fields

---

## Files to Create

### `src/lib/data/benchmarks.ts`
ABS Census 2021 aggregate constants for Greater Sydney and NSW, TfNSW LOS targets by spatial band, BITRE cost rates.

```ts
export const BENCHMARKS = {
  greaterSydney: {
    carModeShare: 46, ptModeShare: 20, activeModeShare: 5,
    avgCommuteMin: 35, vehiclesPerDwelling: 1.5, seifaMedian: 1010,
  },
  nsw: {
    carModeShare: 53, ptModeShare: 14, activeModeShare: 4,
    avgCommuteMin: 32, vehiclesPerDwelling: 1.7, seifaMedian: 990,
  },
  // ABS Census 2021 — journey-to-work median commute by mode (national)
  commuteByMode: { car: 32, train: 56, bus: 47, active: 18 },
};

// TfNSW LOS targets by spatial band
export const LOS_TARGETS = {
  inner:      { carShare: 45, ptShare: 30, activeShare: 10 },
  outerMetro: { carShare: 60, ptShare: 20, activeShare: 5  },
  regional:   { carShare: 72, ptShare: 10, activeShare: 3  },
};

// BITRE Urban Congestion Report 2023
export const BITRE_COST_PER_VKT = 0.21;       // $/vkt (congested conditions)
export const AVG_URBAN_SPEED_KMH = 36;         // for min→km conversion
export const WORKING_DAYS = 250;
export const TRIPS_PER_PERSON_PER_DAY = 1.8;  // ABS average (all purposes)

// Classify LGA region into spatial band
export function getSpatialBand(region?: string): 'inner' | 'outerMetro' | 'regional' {
  if (!region) return 'outerMetro';
  const r = region.toLowerCase();
  if (r.includes('greater sydney') && (r.includes('inner') || r.includes('city'))) return 'inner';
  if (r.includes('greater sydney')) return 'outerMetro';
  return 'regional';
}
```

### `src/lib/analysis/insights.ts`
Pure functions returning `{ headline: string; detail: string }`. Short, copy-paste-ready for planners.

```ts
export function getCarDependencyInsights(
  carShare: number, ptShare: number, activeShare: number,
  benchmarks: typeof BENCHMARKS, areaName: string,
  targetMode: TargetMode | null, density: number
): { headline: string; detail: string }

export function getCongestionInsights(
  avgCommute: number, ptShare: number,
  workforce: number, carShare: number,
  benchmarks: typeof BENCHMARKS
): { headline: string; detail: string }
// BITRE formula: workforce × carShare/100 × (avgCommute/60 × AVG_URBAN_SPEED_KMH) × BITRE_COST_PER_VKT × WORKING_DAYS

export function getGrowthInsights(
  currentPop: number, projections: { year: number; totalPopulation: number }[],
  carShare: number, areaName: string
): { headline: string; detail: string }
// do-minimum: projectedPop × carShare / currentPop × carShare → % increase in car trips

export function getGapInsights(
  carShare: number, ptShare: number, activeShare: number,
  target: typeof LOS_TARGETS[keyof typeof LOS_TARGETS],
  areaName: string, targetMode: TargetMode | null
): { headline: string; detail: string }
```

### `src/components/charts/RadarChart.tsx`
Wraps Recharts `RadarChart` + `Radar`. 

```tsx
interface NeedsRadarChartProps {
  data: { subject: string; area: number; benchmark: number }[];
  height?: number;
  areaName?: string;
}
```
Used in Gap section only. Shows 5 dimensions (Mode diversity / PT uptake / Active transport / Commute efficiency / Growth pressure), scored 0–100.

### `src/components/charts/AreaChart.tsx`
Wraps Recharts `AreaChart` + `Area`. Same props pattern as `LineChart.tsx` with added `fillOpacity` prop. Used in Growth section for do-minimum scenario.

---

## Files to Modify

### `src/store/businessCaseStore.ts`
```ts
// Add types
export type ProjectType = 'road' | 'rail' | 'active' | 'freight';
export type TargetMode = 'bus' | 'train' | 'cycling' | 'walking' | 'multi-modal';

// Expand interface
interface BusinessCaseState {
  projectType: ProjectType | null;  // was 'road' | null
  targetMode: TargetMode | null;    // NEW
  ...
}
// clearProject() resets targetMode: null
// setProject() accepts targetMode
```

### `src/components/business-case/WizardModal.tsx`
- Enable all 4 project types (remove `available: false` on rail/active/freight)
- After project type selection: show 5 pill buttons for target mode (Bus / Train / Cycling / Walking / Multi-modal)
- Auto-select default mode on project type change: road→multi-modal, rail→train, active→cycling, freight→multi-modal
- Pass `targetMode` through `onGenerate`
- Step 3 review summary shows target mode

### `src/components/business-case/callouts.ts`
Convert from static `Record<'road', Record<SectionId, string>>` to a function:
```ts
export function getCallout(
  projectType: ProjectType, 
  targetMode: TargetMode | null, 
  sectionId: SectionId
): string
```
Add callout text for rail, active, freight project types that reference the target mode.

### `src/app/business-case/page.tsx`
Major section rewrites. All sections follow this scannable pattern:
1. **Key Finding callout box** (1–2 sentences from insight function, clipboard copy button)
2. **Charts** (max 2 per section)
3. **Detail table or metric grid** (optional)

#### Scene section
- Expand from 6 → 8 stat tiles: add PT mode share + population density
- Density tile sub-label: `getDensityInsight()` → "Viable for frequent bus" / "Approaching rail density" / "Below frequent transit threshold" (thresholds: 3,500 / 6,000 persons/km²)

#### Growth section  
- Key Finding callout: `getGrowthInsights()` output
- Replace `NeedsLineChart` with `NeedsAreaChart` — historical (solid fill) + projected (dashed fill) — more visually distinct
- Add second data series to population chart: **"Car trips index (do minimum)"** — normalised to base year 100 — `projectedPop × carShare / basePop × carShare × 100`

#### Car Dependency / Active Transport Baseline section
- Section heading: dynamic → `targetMode === 'cycling' || targetMode === 'walking' ? 'Active Transport Baseline' : 'Car Dependency'`
- Key Finding callout: `getCarDependencyInsights()` + clipboard button
- **Journey-to-work caveat badge** on every mode share chart: small gray pill "Journey to work only — ~25% of all trips"
- Replace current mode share bar with **grouped benchmark bar** (3 groups × 3 bars): Car share / PT share / Active share, for Area vs Greater Sydney vs NSW. Uses existing `NeedsBarChart` with multiple dataKeys.
- Add vehicle ownership chart (0/1/2/3+ cars) using `transport.data.vehicleOwnershipRaw`
- Move mode share trend line chart → Congestion section (more appropriate there)

#### Congestion & Commute section (currently near-empty — biggest improvement)
- Key Finding callout: `getCongestionInsights()` output — commute gap + indicative congestion cost with `ⓘ` methodology tooltip
- **Commute benchmark table** (not a chart — keeps it fast): 3 rows (Area / Greater Sydney / NSW), columns: avg commute + delta badge (e.g. "+3 min ▲")
- **Mode × commute mini-table**: from `benchmarks.commuteByMode` — Car 32min / Train 56min / Bus 47min / Active 18min — with area's dominant mode highlighted
- **Mode share trend line chart** (moved from car-dependency): Car / PT / Active trends 2011–2021

#### Infrastructure Gap section (currently one paragraph)
- Key Finding callout: `getGapInsights()` output
- **RAG gap table**: 6 rows (Car share / PT share / Active share / Commute time / Vehicle ownership / Pop density). Columns: Area value | Sydney avg | LOS Target | Gap (±) | Rating badge (green/amber/red). LOS targets from `getSpatialBand(primaryArea.region)`.
- **Multi-criteria radar chart** (`NeedsRadarChart`): 5 dimensions scored 0–100, area vs Greater Sydney benchmark overlay
- **Strategic policy alignment table** (compact, 3 rows): Future Transport 2056 / District Plan 30-min city / NSW Net Zero 2050. Values derived from data.

#### Economy section
- Add Key Finding callout: median weekly income vs NSW median + unemployment rate summary (minor)

#### Evidence Summary section
- Build rows dynamically from `meta.liveFields`, `meta.sampleFields`, `meta.hasLiveData` across all 6 domains
- Add rows: TfNSW Opal patronage (Not seeded — link `/admin`), BITRE VKT (Estimated — formula-based), ABS commute time (Bundled aggregate — Census 2021)
- Add data quality chip at bottom: "X of Y datasets live | Z estimated"

---

## Usability Details

- **Clipboard copy button**: `<button onClick={() => navigator.clipboard.writeText(headline + ' ' + detail)}>` with Lucide `Copy` icon on each Key Finding box
- **Section scroll anchors**: `id={id}` on each section div; sidebar section labels become `<a href={'#' + id}>` for jump navigation within the report
- **Loading skeleton**: Key Finding boxes show pulse skeleton while `useLiveData` is fetching
- **Methodology tooltip**: Congestion cost and do-minimum estimates show a `ⓘ` (Lucide `Info` icon) tooltip: "Modelled estimate using BITRE 2023 unit costs — for indicative purposes only"
- **All labels on indicators**: e.g. BITRE cost shows "~$142m/year (indicative)"
- **PDF export unchanged**: `handleExportPDF` stays the same — all new content is standard DOM

---

## New Dataset Approach

| Dataset | Method | Location |
|---|---|---|
| ABS Census 2021 aggregates (mode share benchmarks, SEIFA medians) | Bundled constants | `src/lib/data/benchmarks.ts` |
| ABS commute time by mode (national medians) | Bundled constants | `src/lib/data/benchmarks.ts` |
| BITRE congestion cost ($/vkt) | Formula using bundled unit cost | `src/lib/analysis/insights.ts` |
| TfNSW Opal patronage / service frequency | Flag as "not seeded" in evidence table | `src/app/business-case/page.tsx` |
| TfNSW LOS targets by spatial band | Bundled constants | `src/lib/data/benchmarks.ts` |

No new API calls. No changes to seeding scripts.

---

## Verification Steps
1. `npm run dev` → `/business-case`
2. Wizard: Road + multi-modal → congestion section shows commute benchmark table + cost estimate + trend chart
3. Wizard: Rail + train → gap radar highlights PT gap; car-dependency callout is PT-framed; gap table target = rail-appropriate
4. Wizard: Active + cycling → section heading "Active Transport Baseline"; gap radar highlights active share; policy row shows 20% active target
5. LGA with live ABS data → Key Finding text shows real numbers; `meta.hasLiveData` drives evidence table
6. Clipboard button → paste into text editor; confirms headline + detail
7. PDF export → all new sections render
8. `npm run build` → no TypeScript errors
