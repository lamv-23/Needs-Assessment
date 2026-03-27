# Architecture — Transport Needs Assessment Tool

> Quick reference for Claude. See `CLAUDE.md` for conventions & commands.

## Folder Map
```
src/
  app/                        # Next.js App Router pages
    page.tsx                  # Home dashboard
    layout.tsx                # Root layout (Header + Sidebar)
    globals.css
    api/abs/[lgaId]/route.ts  # ABS proxy — 7-day ISR, returns ABSRealData
    demographics/page.tsx
    economy/page.tsx
    education/page.tsx
    growth/page.tsx
    housing/page.tsx
    transport/page.tsx
    compare/page.tsx
    report/page.tsx
    upload/page.tsx           # Admin: Excel upload + data status

  components/
    layout/
      Header.tsx              # Global nav + ABS data toggle (preferRealData)
      Sidebar.tsx
      AreaSelector.tsx        # Populates from SAMPLE_AREAS
      YearSelector.tsx
    charts/
      BarChart.tsx · LineChart.tsx · PieChart.tsx
      PopulationPyramid.tsx · StackedBar.tsx
      ChartWrapper.tsx        # Responsive container
    maps/
      ChoroplethMap.tsx       # Entry point (dynamic import wrapper)
      ChoroplethMapDirect.tsx
      ChoroplethMapInner.tsx  # Actual Leaflet map
      MapLegend.tsx · MapRenderer.tsx · SimpleMap.tsx
    tables/
      DataTable.tsx           # @tanstack/react-table wrapper
    ui/
      StatCard.tsx
    admin/
      ProjectionUploadPanel.tsx  # Drag-drop XLSX upload UI

  hooks/
    useABSData.ts             # SWR hook → /api/abs/[lgaId], 1h dedup

  lib/
    abs-api.ts                # ABS SDMX-JSON fetchers (5 datasets)
    excel-parser.ts           # NSW Planning XLSX → NSWPopulationProjection[]
    utils.ts                  # formatNumber/Percent/Currency, CHART_COLORS, YEARS
    data/
      lga-mapping.ts          # Internal ID ↔ official name ↔ ABS 5-digit code (37 LGAs)
      sample-areas.ts         # SAMPLE_AREAS array
      sample-data.ts          # Mock data functions getXxxData(areaId, year)
      demographic-indicators.ts
      nsw-projections-data.ts
      nsw-employment-projections.ts
      tfnsw-transport.ts
    types/
      projections.ts          # NSWPopulationProjection, ProjectionMetadata

  store/
    index.ts                  # useAppStore: selectedArea, selectedYear, preferRealData
    projectionStore.ts        # useProjectionStore: NSW Excel projections, localStorage

  types/
    index.ts                  # Shared TS types (Area, DataPoint, ABSRealData, etc.)

public/
  geo/lga-greater-sydney.json # GeoJSON boundaries (large — don't read unless editing maps)
```

## Key Data Flows

### ABS Real Data
```
useABSData(lgaId)
  → SWR → /api/abs/[lgaId]
    → fetchAllABSData(lgaCode)   [5 parallel SDMX-JSON requests]
      → G01 Population · G02 Medians · SEIFA · Regional Labour · ERP Time Series
  → ABSRealData | null
  → Page banner: green (loaded) · orange (failed, sample shown) · yellow (user toggled off)
```

### NSW Projections
```
/upload → ProjectionUploadPanel
  → parseNSWProjectionsExcel(arrayBuffer)   [src/lib/excel-parser.ts]
    → match LGA names via LGA_MAPPING
  → useProjectionStore.setProjections()
    → localStorage.nsw_population_projections
  → available in any page via useProjectionStore()
```

## ABS Datasets
| Function | Dataset ID | Returns |
|---|---|---|
| `fetchG01Population` | C21_G01_LGA | totalPopulation, male, female |
| `fetchG02Medians` | C21_G02_LGA | medianAge, income, rent, mortgage |
| `fetchSEIFA` | ABS_SEIFA2021_LGA | seifaScore (IRSAD) |
| `fetchRegionalLabour` | ABS_REGIONAL_LGA2021 | unemploymentRate, participationRate |
| `fetchERPTimeSeries` | ABS_ANNUAL_ERP_LGA2024 | erpByYear (2001–2024) |

## LGA Codes (full list in `src/lib/data/lga-mapping.ts`)
37 LGAs: Greater Sydney (28) + Central Coast (1) + Illawarra (2) + Newcastle/Lake Mac (2) + others.
Key: `lga_sydney→17200` `lga_parramatta→16260` `lga_blacktown→10750` `lga_penrith→16350`
