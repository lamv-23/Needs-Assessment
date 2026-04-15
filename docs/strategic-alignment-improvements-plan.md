# Strategic Alignment Page — 10 Usability Improvements

## Context

The Strategic Alignment page (`src/app/strategic-alignment/page.tsx`, 848 lines) is mostly a wall of read-only content. Transport planners building business cases can't actually *do* anything with it — they can't select which strategies apply to their project, can't annotate why, and the page doesn't connect to the Business Case wizard at all. The "Network Alignment Checklist" has items that look like checkboxes but are non-interactive styled divs. Only 3 of 6 Connecting NSW Priorities have evidence panels. The result: planners visit the page, skim it, and go build their strategic case in a Word document instead.

These 10 improvements transform the page from a static reference wall into an interactive strategic case-building tool that feeds directly into the business case report.

## Design choices (locked in from interview)

| Decision | Choice |
|---|---|
| Target user | Both early-stage scoping AND business case authors |
| Strategy Hierarchy | Interactive — checkboxes + notes per strategy |
| Priorities | Selectable — toggles that filter evidence panels |
| Business Case integration | Summary table in BC report (strategies + priorities + alignment strength) |
| Fake checklist | Remove entirely |
| New evidence panels | P1 (Towards zero trauma), P3 (Net zero emissions), P6 (Whole-of-govt outcomes) |
| Alignment indicators | Auto-generated traffic-light ratings from data thresholds |
| Benchmarks | Area vs Greater Sydney avg vs NSW avg per priority metric |
| Persistence | Zustand + localStorage (scales to 30+ concurrent users, each browser stores own state) |
| Priority numbering | Follows in-code Connecting NSW Strategy 2024 definitions |

## Build order (dependency graph)

```
Phase 1 — Foundation (no dependencies):
  [1] strategicAlignmentStore
  [10] Page restructure + remove checklist + extract data file

Phase 2 — Interactive UI (depends on Phase 1):
  [2] Interactive Strategy Hierarchy
  [3] Selectable Connecting NSW Priorities

Phase 3 — New Evidence Panels (depends on [3]):
  [4] P1 evidence panel (Towards zero trauma)
  [5] P3 evidence panel (Net zero emissions)
  [6] P6 evidence panel (Whole-of-govt outcomes)

Phase 4 — Intelligence (depends on Phases 2-3):
  [7] Alignment strength indicators
  [8] Benchmark comparisons per priority

Phase 5 — Integration (depends on [1], [7]):
  [9] Business Case summary table
```

---

## Improvement 1: New `strategicAlignmentStore`

**New file:** `src/store/strategicAlignmentStore.ts`

**Pattern:** Follow `src/store/businessCaseStore.ts` — `create<State>()(persist(...))` with `partialize` and localStorage.

```typescript
type PriorityCode = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';

interface StrategicAlignmentState {
  selectedStrategyIds: string[];           // strategy slugs from STRATEGY_HIERARCHY
  strategyNotes: Record<string, string>;   // key = strategy slug
  selectedPriorities: PriorityCode[];
  priorityNotes: Record<PriorityCode, string>;

  toggleStrategy: (id: string) => void;
  setStrategyNote: (id: string, note: string) => void;
  togglePriority: (code: PriorityCode) => void;
  setPriorityNote: (code: PriorityCode, note: string) => void;
  clearAll: () => void;
}
```

- localStorage key: `'strategic-alignment-store'`
- Default: empty arrays/objects — nothing pre-selected
- Mandatory strategies auto-selected on first interaction (see improvement 2)
- Toggle pattern: same as `WizardModal.tsx` lines 38-48

---

## Improvement 2: Interactive Strategy Hierarchy

**New file:** `src/components/strategic-alignment/StrategyHierarchy.tsx`

Replace the static strategy list (current page lines 732-794) with interactive cards:
- Each strategy item gets a real `<input type="checkbox">`
- Checked state reads from / writes to `useStrategicAlignmentStore()`
- Selected items get highlighted border (`border-indigo-200 bg-indigo-50/40`)
- Mandatory items are auto-checked and disabled (can't uncheck)
- Each item has a collapsible "Add note" textarea that appears when expanded
- Section header shows count: "5 of 14 selected"
- Each level (Federal, State, Regional, Network) is collapsible

**Props:** Receives `hierarchy` data from the extracted data file, reads/writes store directly.

---

## Improvement 3: Selectable Connecting NSW Priorities

**New files:**
- `src/components/strategic-alignment/PriorityCard.tsx` — single toggleable card
- `src/components/strategic-alignment/PriorityGrid.tsx` — grid of 6 cards

Replace the static priority cards (current page lines 363-386) with clickable toggles:
- Click a card → toggles selection in store → card gets highlighted border + check icon
- Alignment strength badge (from improvement 7) shown on each card
- Instruction text updated: "Click a priority to select it. Selected priorities filter the evidence panels below."

**Evidence panel filtering logic:**
```typescript
const { selectedPriorities } = useStrategicAlignmentStore();
const showPanel = (code: PriorityCode) =>
  selectedPriorities.length === 0 || selectedPriorities.includes(code);
```
When nothing is selected → all panels show (browsing mode). Once the user selects priorities → only relevant panels appear.

---

## Improvement 4: Evidence Panel for P1 — Towards Zero Trauma

**New file:** `src/components/strategic-alignment/EvidencePanelP1.tsx`

Collapsible panel matching the existing P5/P4/P2 pattern (chevron toggle, icon header).

**Data used (from `useLiveData`):**
- Total population, population projections, population growth rate
- Vehicle ownership (zero-car households)

**Content:**
- Icon: `Shield` (red accent)
- 3 stat cards: Total population (2021), Projected population (2041), Population growth %
- Chart: Population projections line chart 2021-2041 (reuses `NeedsLineChart`)
- `FindingCallout`: "Population growth of X% to 2041 combined with Y% of households with no vehicle increases exposure to road trauma risk, directly relevant to P1."
- Benchmark bar: Population density vs Greater Sydney / NSW averages

---

## Improvement 5: Evidence Panel for P3 — Net Zero Emissions

**New file:** `src/components/strategic-alignment/EvidencePanelP3.tsx`

Frames car dependency as a decarbonisation problem (distinct from P5 which frames it as congestion).

**Data used:**
- Car mode share + trend, active transport share
- Vehicle ownership (multi-car households as emissions proxy)

**Content:**
- Icon: `Zap` (teal accent, matching P3 color)
- 3 stat cards: Car mode share, Active transport share, Multi-car household %
- Chart 1: Mode share trend over time (`NeedsLineChart`)
- Chart 2: Vehicle ownership distribution (pie chart)
- `FindingCallout`: "Car mode share of X% implies high per-capita transport emissions. With Y% of households owning 3+ vehicles, decarbonisation requires mode shift investment aligned with P3."
- Benchmark bar: Car mode share vs Greater Sydney / NSW averages

---

## Improvement 6: Evidence Panel for P6 — Whole-of-Government Outcomes

**New file:** `src/components/strategic-alignment/EvidencePanelP6.tsx`

Economic access and employment data — framed around cross-government outcomes.

**Data used:**
- Unemployment rate, participation rate, median weekly income
- Employment by industry, employment projections, jobs-to-population ratio

**Content:**
- Icon: `Briefcase` (amber accent, matching P6 color)
- 4 stat cards: Unemployment, Participation rate, Median income, Jobs-to-pop ratio
- Chart 1: Employment by industry top 10 (`NeedsBarChart`)
- Chart 2: Employment projections 2021-2041 (`NeedsLineChart`)
- `FindingCallout`: "Unemployment at X% and median income of $Y/week — transport investment improving access to employment centres supports P6. Jobs-to-pop ratio of Z per 100 residents indicates [rising/falling] commute pressure."
- Benchmark bar: Unemployment rate vs Greater Sydney / NSW averages

---

## Improvement 7: Auto-Generated Alignment Strength Indicators

**New files:**
- `src/lib/alignment-scoring.ts` — scoring logic
- `src/components/strategic-alignment/AlignmentStrengthBadge.tsx` — traffic-light badge

**Scoring thresholds:**

| Priority | Metric | Strong | Moderate | Weak |
|---|---|---|---|---|
| P1 Towards zero trauma | Pop growth % to 2041 | > 25% | 15–25% | < 15% |
| P2 Reliability | Avg commute time | > 35 min | 25–35 min | < 25 min |
| P3 Net zero | Car mode share | > 75% | 60–75% | < 60% |
| P4 Equity | SEIFA score | < 950 | 950–1000 | > 1000 |
| P5 Mode shift | Car mode share | > 75% | 60–75% | < 60% |
| P6 Whole-of-govt | Unemployment rate | > 7% | 5–7% | < 5% |

**`computeAlignmentStrength(priority, data)` → `{ strength, metric, rationale }`**

**Badge component:** Green/amber/gray pill (`bg-emerald-100`, `bg-amber-100`, `bg-gray-100`).

**Usage:**
1. On each `PriorityCard` — top-right corner shows strength for the selected area
2. At top of page — summary strip with all 6 priorities and their badges, plus auto-generated narrative via `FindingCallout`: "Based on data for [area], the strongest alignment evidence exists for P4 and P5."

---

## Improvement 8: Benchmark Comparisons Per Priority

**New file:** `src/components/strategic-alignment/BenchmarkBar.tsx`

Horizontal 3-bar comparison: area value vs Greater Sydney avg vs NSW avg. Uses `NeedsBarChart` with vertical layout (matches the existing SEIFA comparison pattern at current page lines 618-629).

**Props:**
```typescript
interface BenchmarkBarProps {
  label: string;
  areaName: string;
  areaValue: number;
  greaterSydneyValue: number;
  nswValue: number;
  unit?: string;
  direction?: 'higher_better' | 'lower_better';
}
```

**Benchmark values (in `strategy-data.ts`):**

| Metric | Greater Sydney | NSW |
|---|---|---|
| Car mode share | 63% | 66% |
| PT mode share | 22% | 16% |
| SEIFA (IRSAD) | 1020 | 1000 |
| Unemployment rate | 4.8% | 5.2% |
| Median weekly income | $1,750 | $1,500 |
| Avg commute time | 34 min | 30 min |

One `BenchmarkBar` per evidence panel showing the key metric for that priority.

---

## Improvement 9: Business Case Integration — Summary Table

**New file:** `src/components/business-case/StrategicAlignmentSection.tsx`

**Modified files:**
- `src/app/business-case/page.tsx` — add section rendering for `'strategic-alignment'`
- `src/store/businessCaseStore.ts` — add `'strategic-alignment'` to section IDs and toggles
- `src/components/business-case/callouts.ts` — add callout text

**Section renders a summary table** (reads from `useStrategicAlignmentStore()`):

**Table 1 — Selected Strategies:**
| Strategy | Level | ATAP Phase | Notes |
|---|---|---|---|
| ATAP Guidelines | Federal | All phases | [user note] |

**Table 2 — Priority Alignment:**
| Priority | Alignment | Key Metric | Value |
|---|---|---|---|
| P4 Reduce transport disadvantage | Strong | SEIFA Score | 935 |
| P5 Mode shift | Strong | Car mode share | 72.3% |

**Empty state:** If no strategic alignment selections exist, show: "No strategic alignment data configured. Visit Strategic Alignment to select applicable strategies."

Automatically included in PDF export (renders within `reportRef`, captured by existing `html2canvas` approach).

---

## Improvement 10: Remove Fake Checklist + Page Restructure

**Modified file:** `src/app/strategic-alignment/page.tsx` — major refactor (848 → ~150 lines)

**Delete:** Lines 796-843 (the non-interactive Network Alignment Checklist).

**Extract hard-coded data to new file:**
- **New file:** `src/lib/data/strategy-data.ts`
  - `STRATEGY_HIERARCHY` (moved from page lines 46-155) — each item gets a deterministic `id` slug
  - `CONNECTING_NSW_PRIORITIES` (moved from page lines 159-196) — add `evidenceAvailable: boolean`
  - `BENCHMARK_VALUES` constant
  - All TypeScript interfaces (`StrategyItem`, `StrategyLevel`, `ConnectingNSWPriority`, `PriorityCode`)
  - `seifaBand()` helper (moved from page lines 200-205)

**Extract existing evidence panels:**
- `src/components/strategic-alignment/EvidencePanelP2.tsx` — extracted from current P2 section
- `src/components/strategic-alignment/EvidencePanelP4.tsx` — extracted from current P4 section
- `src/components/strategic-alignment/EvidencePanelP5.tsx` — extracted from current P5 section

**New page layout (top to bottom):**
1. `<Header>` + `<DataSourceBadge>` (keep)
2. Alignment summary strip (all 6 priorities with strength badges + auto-narrative)
3. Stat cards row (SEIFA, Population 2021, Projected Pop 2041, Projected Employment 2041) — keep
4. **Section 1: Connecting NSW Priorities** — interactive `PriorityGrid`
5. **Section 2: Evidence Panels** — filtered by selected priorities, all 6 panels (P1–P6)
6. **Section 3: Strategy Hierarchy** — interactive, collapsible `StrategyHierarchy`
7. **Bottom: Alignment summary** — link to Business Case ("Ready to build your case? →")

The restructured page imports components and composes layout (~150 lines vs current 848).

---

## Files summary

**New files (14):**

| File | Purpose |
|---|---|
| `src/store/strategicAlignmentStore.ts` | Zustand + localStorage store |
| `src/lib/data/strategy-data.ts` | Extracted strategy/priority/benchmark data |
| `src/lib/alignment-scoring.ts` | Alignment strength computation |
| `src/components/strategic-alignment/PriorityCard.tsx` | Toggleable priority card |
| `src/components/strategic-alignment/PriorityGrid.tsx` | Grid of 6 priority cards |
| `src/components/strategic-alignment/StrategyHierarchy.tsx` | Interactive strategy checklist |
| `src/components/strategic-alignment/EvidencePanelP1.tsx` | P1 panel (new) |
| `src/components/strategic-alignment/EvidencePanelP2.tsx` | P2 panel (extracted) |
| `src/components/strategic-alignment/EvidencePanelP3.tsx` | P3 panel (new) |
| `src/components/strategic-alignment/EvidencePanelP4.tsx` | P4 panel (extracted) |
| `src/components/strategic-alignment/EvidencePanelP5.tsx` | P5 panel (extracted) |
| `src/components/strategic-alignment/EvidencePanelP6.tsx` | P6 panel (new) |
| `src/components/strategic-alignment/AlignmentStrengthBadge.tsx` | Traffic-light badge |
| `src/components/strategic-alignment/BenchmarkBar.tsx` | Comparison bar |
| `src/components/business-case/StrategicAlignmentSection.tsx` | BC summary table |

**Modified files (4):**

| File | Changes |
|---|---|
| `src/app/strategic-alignment/page.tsx` | Major refactor: 848 → ~150 lines, new layout, import components |
| `src/app/business-case/page.tsx` | Add `'strategic-alignment'` section rendering |
| `src/store/businessCaseStore.ts` | Add `'strategic-alignment'` section ID + toggle |
| `src/components/business-case/callouts.ts` | Add callout text |

## Existing code to reuse

- `src/store/businessCaseStore.ts` — Zustand persist pattern
- `src/components/ui/StatCard.tsx` — metric cards
- `src/components/ui/FindingCallout.tsx` — narrative callouts in evidence panels
- `src/components/charts/ChartWrapper.tsx` + `NeedsLineChart` + `NeedsBarChart` + `PieChart` — chart components
- `src/components/ui/DataSourceBadge.tsx` — data source attribution
- `src/hooks/useLiveData.ts` — SWR data hook
- `src/app/problem-definition/page.tsx` — pattern for auto-generated gap analysis, scoring, narrative
- `src/lib/utils.ts` — `CHART_COLORS`, `formatNumber`

## Verification

1. **Store persistence:** Select strategies + priorities, refresh the page → selections should survive. Open a second browser tab → it shares the same selections (same localStorage).

2. **Priority filtering:** Select P4 and P5 → only P4 and P5 evidence panels show. Deselect all → all 6 panels show.

3. **Alignment strength:** Switch the area selector to a high-disadvantage LGA (low SEIFA) → P4 badge should show "Strong". Switch to a wealthy LGA → P4 badge should show "Weak".

4. **Benchmarks:** Each evidence panel should show a benchmark bar comparing the area's metric to Greater Sydney and NSW averages.

5. **Business Case integration:** Go to `/business-case`, generate a report → it should include a "Strategic Alignment" section with the selected strategies and priorities table. If no selections were made, it shows an info message.

6. **PDF export:** Generate the BC PDF → the strategic alignment summary table should appear in the exported PDF.

7. **Mobile:** Resize to <768px → priority cards stack into a single column, evidence panels are full-width, strategy hierarchy is readable. Touch interactions work (checkbox tap, card tap).

8. **Page size:** Confirm the restructured `strategic-alignment/page.tsx` is ~150 lines (composition only), with all logic extracted into components and data files.
