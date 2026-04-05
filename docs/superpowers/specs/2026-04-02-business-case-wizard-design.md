# Business Case Wizard — Design Spec

**Date:** 2026-04-02
**Branch:** `feature/business-case-wizard`
**Status:** Approved

---

## Context

Transport business case writers need to quickly assemble evidence for infrastructure projects. Today the tool holds all the relevant data but writers must navigate multiple pages, identify which charts are relevant, and manually copy them into documents. This feature adds a guided wizard that asks a few questions about the project, then generates a pre-populated, narrative-ordered evidence report with callout text — reducing the time from "open tool" to "ready to paste into a business case" from hours to minutes.

The initial scope is road projects only (Western Sydney airport corridor is the primary use case).

---

## Entry Point

- New sidebar item in the **Tools** section: `{ href: '/business-case', label: 'Business Case', icon: Wand2 }`
- File: `src/components/layout/Sidebar.tsx` — add to `navSections[3].items`
- Visiting `/business-case` for the first time (no store state) opens the wizard modal automatically

---

## Wizard Modal

**File:** `src/components/business-case/WizardModal.tsx`

Three-step stepper. State is local until "Generate" is clicked, then written to `businessCaseStore`.

### Step 1 — Project Context
- **Project type** selector: Road (active), Rail / Active Transport / Freight (greyed out, "coming soon" badge)
- **Project name** free-text input (used as report title)
- **Area(s)** multi-select using existing `AreaSelector` logic — allows 1–4 LGAs

### Step 2 — Problem Framing
Checkboxes for evidence themes. Defaults for road projects (all pre-checked):
- Congestion / travel time reliability
- Population & employment growth pressure
- Car dependency / lack of alternatives
- Access to jobs / economic centres
- Freight / logistics network gaps

### Step 3 — Review & Generate
- Summary card showing: project name, area(s), selected themes
- "Generate Business Case Evidence" button
  - Writes to `businessCaseStore`
  - Closes modal
  - Renders the results page

---

## Business Case Store

**File:** `src/store/businessCaseStore.ts`
Zustand store, persisted to localStorage (same pattern as `projectionStore`).

```typescript
interface BusinessCaseState {
  projectName: string;
  projectType: 'road' | null;
  areaIds: string[];           // e.g. ['lga_penrith', 'lga_camden']
  themes: string[];            // selected problem theme keys
  sectionToggles: Record<string, boolean>;  // section id → included
  clearProject: () => void;
  setProject: (state: Partial<BusinessCaseState>) => void;
}
```

---

## Results Page

**File:** `src/app/business-case/page.tsx`

**Layout:** Two-column (same as Report Builder)
- **Left panel (col-span-4):** Project name (editable), section toggles, Export PDF button, "New Project" button (reopens wizard)
- **Right panel (col-span-8):** Narrative report, white background, printable

Data: `useLiveData(areaIds[0], year)` — primary LGA only at v1. Multi-LGA comparison is a future enhancement.

---

## Narrative Report Sections

Sections render in this fixed order. Each section has: heading, 1–2 sentence callout (explaining business case relevance), chart(s), per-chart PNG download + clipboard copy button.

| # | Section ID | Heading | Charts | Shown when |
|---|---|---|---|---|
| 1 | `scene` | Setting the Scene | Population stat cards, Median Age, SEIFA | Always |
| 2 | `growth` | Growth Pressure | Population Growth & Projections, Employment Growth & Projections | Theme: growth pressure |
| 3 | `car-dependency` | Car Dependency | Journey to Work Mode Share (2021), Vehicle Ownership, Mode Share Trend 2011–2021 | Theme: congestion OR car dependency |
| 4 | `congestion` | Congestion & Commute | Avg Commute Time trend, Mode Share Trends (TfNSW) | Theme: congestion |
| 5 | `economy` | Economic Activity | Employment by Industry, Employment Projections | Theme: access to jobs |
| 6 | `gap` | Infrastructure Gap | Current vs Target Level of Service, Service Level Gap cards | Always |
| 7 | `evidence` | Evidence Summary | Evidence Availability Matrix | Always |

Sections 1, 6, 7 are always included and cannot be toggled off.
Sections 2–5 are toggled by the theme checkboxes in Step 2 (and can be toggled on left panel after generation).

---

## New Feature: "Copy Chart" Button

**File:** `src/components/charts/ChartWrapper.tsx`

Add a clipboard copy button alongside the existing download dropdown:
- Uses `html2canvas` to capture the chart div at 3x scale (same as PNG export)
- Calls `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])`
- Button shows a brief "Copied!" state for 1.5s on success
- Falls back gracefully if Clipboard API not available (hides button)
- Icon: `Clipboard` from lucide-react

This is a global improvement — the copy button appears on **all** charts across the app, not just the business case page.

---

## Callout Text (per section)

Static strings defined in `src/components/business-case/callouts.ts`, keyed by section ID and project type:

```typescript
export const CALLOUTS: Record<string, Record<string, string>> = {
  road: {
    scene: "Establishes the demographic context of the study area — population size, age profile, and socio-economic characteristics that drive transport demand.",
    growth: "Documents the scale of projected growth, a core requirement of the Benefits Management Framework. High growth rates strengthen the case for new capacity.",
    'car-dependency': "Demonstrates structural reliance on private vehicles — a key problem statement for road investment. Trend data shows this is not a short-term phenomenon.",
    congestion: "Quantifies the travel time burden on existing users. Commute time trends establish a deteriorating baseline against which project benefits are measured.",
    economy: "Links transport access to employment and economic activity. Relevant to the Strategic Economic Infrastructure test in NSW infrastructure guidelines.",
    gap: "Benchmarks current performance against TfNSW level of service standards, providing an evidence-based statement of the infrastructure gap.",
    evidence: "Summary of available data quality. Informs the Evidence Assessment section of the business case and flags where supplementary data collection may be needed.",
  },
};
```

---

## PDF Export

Reuses the existing `html2canvas` + `jsPDF` pattern from `src/app/report/page.tsx`.
Filename: `{projectName}_{primaryLGA}_business_case.pdf`

---

## Files to Create

| File | Purpose |
|---|---|
| `src/app/business-case/page.tsx` | Results page |
| `src/components/business-case/WizardModal.tsx` | 3-step wizard modal |
| `src/components/business-case/callouts.ts` | Callout text per section/type |
| `src/store/businessCaseStore.ts` | Zustand store (persisted) |

## Files to Modify

| File | Change |
|---|---|
| `src/components/layout/Sidebar.tsx` | Add Business Case nav item |
| `src/components/charts/ChartWrapper.tsx` | Add clipboard copy button |

---

## Verification

1. Run `npm run dev` and navigate to `/business-case`
2. Wizard modal opens automatically — step through all 3 steps with a road project for Penrith LGA
3. Verify all 7 sections render with correct charts and callout text
4. Toggle a theme off in Step 2 — confirm corresponding section is absent from output
5. Toggle a section off in the left panel — confirm it disappears from the right panel
6. Click "Copy chart" on any chart — paste into an image editor or Word doc to confirm clipboard copy works
7. Click "Download PNG" — confirm high-res PNG downloads
8. Click "Export PDF" — confirm multi-page PDF generates with all visible sections
9. Refresh page — confirm project state persists (localStorage)
10. Click "New Project" — confirm wizard reopens and state resets on Generate
