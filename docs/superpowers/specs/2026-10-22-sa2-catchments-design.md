# SA2 Needs and Walking Catchments — Design (Phase 2)

**Date:** 2026-10-22 · **Status:** Draft for review · **Depends on:** `2026-10-22-lga-needs-assessment-design.md` (Parts A and B built)

## Problem

LGA averages hide pockets of need. Blacktown's single IRSD score of 987 blends very different suburbs. The app also cannot say how many residents can walk to a frequent service, which is the most direct evidence of transport need.

## What we are building

1. **SA2 indicators** for all 644 NSW SA2s (ASGS 2021), ranked against NSW SA2s.
2. **Walking catchments.** The share of residents within a straight-line walk of a frequent stop, and of any serviced stop, by SA2 and by LGA.
3. **A drill-down on `/needs`** showing the SA2s inside the selected LGAs: map, ranked table, a "pockets of need" narrative, and a catchment figure. All of it flows into the Word export.

## Sources (verified 2026-10-22)

| Need | Source |
|---|---|
| SA2 Census tables | ABS Data API `C21_G01_SA2`, `C21_G02_SA2`, `C21_G13_SA2`, `C21_G18_SA2`, `C21_G33_SA2`, `C21_G34_SA2`, `C21_G46_SA2`, `C21_G62_SA2`; SEIFA from `ABS_SEIFA2021_SA2` (all return 200) |
| SA2 boundaries | ABS ArcGIS `https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SA2/FeatureServer/0`. The query `state_code_2021='1'` returns 644. Max 2,000 per page; fields include `sa2_code_2021`, `sa2_name_2021`, `sa3_*`, `sa4_*`, `gccsa_*`, `area_albers_sqkm` |
| Mesh-block locations | ABS ArcGIS `ASGS2021/MB/FeatureServer/0`. Fields include `mb_code_2021`, `mb_category_2021`, `sa2_code_2021`, `area_albers_sqkm`. No population and no LGA code |
| Mesh-block population | ABS "Mesh Block Counts, 2021": `https://www.abs.gov.au/census/guide-census-data/mesh-block-counts/2021/Mesh%20Block%20Counts%2C%202021.xlsx` |
| Stops and service | `gtfs_stops` (92,474 stops with lat/lng and mode). AM-peak departures per stop are computed in `scripts/seed-gtfs.ts` (`peakDepartures`) but not stored yet |

## Rules

- **Frequent stop:** ≥ `FREQUENT_DEPARTURES_THRESHOLD` (8) weekday departures between 07:00 and 09:00, as defined in `src/lib/gtfs-frequency.ts`.
- **Serviced stop:** ≥ 1 departure in that window.
- **Walk radius (straight-line):** train, metro and ferry 800 m; bus and light rail 400 m. Always labelled "straight-line distance". Real walking routes are longer, so these shares are an upper bound.
- **Catchment share** = Σ persons in mesh blocks whose centroid lies within the radius of a qualifying stop ÷ Σ persons. Stops in any LGA count, because boundaries don't stop people walking.
- **SA2 → LGA:** SA2s do not nest in LGAs.
  - `lgaShares` = each LGA's share of the SA2's mesh-block persons. An LGA is assigned by testing the mesh-block centroid against `public/geo/lga-nsw.json`.
  - An SA2 appears in an LGA's drill-down when that LGA's share is ≥ 0.10.
  - `primaryLgaId` is the LGA with the largest share.
- **SA2 indicators** (the subset of the LGA registry available at SA2): `car_dependency`, `zero_car_households`, `seifa_irsd`, `unemployment_rate`, `low_income_households`, `needs_assistance`, `limited_english`, `older_residents`, `indigenous_share`, plus the new `frequent_service_catchment` (↓) and `any_service_catchment` (↓).
  - There is no growth domain at SA2, because projections, approvals and crashes are not available at that level. SA2 scores use the transport and socio domains only, and the UI says so.
- **Low population:** SA2s with fewer than 100 persons are excluded from peers and percentiles and shown as "Low population".
- **LGA change:**
  - `frequent_service_catchment` and `any_service_catchment` join the LGA snapshot.
  - `frequent_service_catchment` replaces `frequent_stop_share` in the LGA score, and `frequent_stop_share` stays as an unscored context indicator. `any_service_catchment` is also scored, as a measure of basic access alongside service quality, so the transport domain has 7 scored indicators (P2-R14).
  - The Part B mismatch model switches its metro predictor to catchment only if the metro R² improves by ≥ 0.05.
- **Pockets narrative:**
  - "Within {LGA}, {a}, {b} and {c} are in the highest-need 10% of NSW SA2s." (top 3 by overall SA2 score. Only SA2s whose overall rank ≤ floor(0.10 × ranked SA2s) qualify, so the claim is literally true; P2-R15)
  - Otherwise: "No SA2 in {LGA} is in the highest-need 10% of NSW SA2s."

## Out of scope

- Network walking distances (a candidate for phase 3).
- Jobs reachable by public transport (needs a routing engine).
- SA1 or mesh-block results in the UI (mesh blocks are used only for calculation).
- SA2 projections.
