# Business Case Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guided 3-step wizard at `/business-case` that helps road project business case writers quickly generate a narrative-ordered evidence report with charts and callout text.

**Architecture:** A new Zustand store (`businessCaseStore`) persists the writer's project configuration (name, areas, problem themes, section toggles). A wizard modal (`WizardModal.tsx`) collects this configuration across 3 steps, then the results page (`/business-case/page.tsx`) renders the narrative report by pulling data from `useLiveData` and charts from existing chart components. A global clipboard copy button is added to `ChartWrapper`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Zustand (persist), Recharts via existing chart components, html2canvas, jsPDF, lucide-react, Tailwind CSS.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/store/businessCaseStore.ts` | Project state (name, areas, themes, toggles), persisted to localStorage |
| Create | `src/components/business-case/callouts.ts` | Static callout text keyed by section ID + project type |
| Create | `src/components/business-case/WizardModal.tsx` | 3-step modal: project context → problem framing → review & generate |
| Create | `src/app/business-case/page.tsx` | Results page: left panel controls, right panel narrative report |
| Modify | `src/components/charts/ChartWrapper.tsx` | Add clipboard copy button |
| Modify | `src/components/layout/Sidebar.tsx` | Add "Business Case" nav item under Tools |

---

## Task 1: Create the businessCaseStore

**Files:**
- Create: `src/store/businessCaseStore.ts`

- [ ] **Step 1: Write the store**

```typescript
// src/store/businessCaseStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const THEMES = [
  { key: 'growth', label: 'Population & employment growth pressure' },
  { key: 'congestion', label: 'Congestion / travel time reliability' },
  { key: 'car-dependency', label: 'Car dependency / lack of alternatives' },
  { key: 'economy', label: 'Access to jobs / economic centres' },
  { key: 'freight', label: 'Freight / logistics network gaps' },
] as const;

export type ThemeKey = typeof THEMES[number]['key'];

// Sections 'scene', 'gap', 'evidence' are always included (non-toggleable).
// Sections 'growth', 'car-dependency', 'congestion', 'economy' are theme-driven.
export const SECTION_IDS = ['scene', 'growth', 'car-dependency', 'congestion', 'economy', 'gap', 'evidence'] as const;
export type SectionId = typeof SECTION_IDS[number];

const DEFAULT_TOGGLES: Record<SectionId, boolean> = {
  scene: true,
  growth: true,
  'car-dependency': true,
  congestion: true,
  economy: true,
  gap: true,
  evidence: true,
};

interface BusinessCaseState {
  projectName: string;
  projectType: 'road' | null;
  areaIds: string[];
  themes: ThemeKey[];
  sectionToggles: Record<SectionId, boolean>;
  setProject: (update: Partial<Pick<BusinessCaseState, 'projectName' | 'projectType' | 'areaIds' | 'themes' | 'sectionToggles'>>) => void;
  toggleSection: (id: SectionId) => void;
  clearProject: () => void;
}

export const useBusinessCaseStore = create<BusinessCaseState>()(
  persist(
    (set, get) => ({
      projectName: '',
      projectType: null,
      areaIds: [],
      themes: THEMES.map(t => t.key),
      sectionToggles: { ...DEFAULT_TOGGLES },

      setProject: (update) => set((state) => ({ ...state, ...update })),

      toggleSection: (id) =>
        set((state) => ({
          sectionToggles: {
            ...state.sectionToggles,
            [id]: !state.sectionToggles[id],
          },
        })),

      clearProject: () =>
        set({
          projectName: '',
          projectType: null,
          areaIds: [],
          themes: THEMES.map(t => t.key),
          sectionToggles: { ...DEFAULT_TOGGLES },
        }),
    }),
    {
      name: 'business-case-store',
      partialize: (state) => ({
        projectName: state.projectName,
        projectType: state.projectType,
        areaIds: state.areaIds,
        themes: state.themes,
        sectionToggles: state.sectionToggles,
      }),
    }
  )
);
```

- [ ] **Step 2: Verify it compiles**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `businessCaseStore.ts`.

- [ ] **Step 3: Commit**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment"
git add src/store/businessCaseStore.ts
git commit -m "feat: add businessCaseStore for wizard state"
```

---

## Task 2: Create callouts.ts

**Files:**
- Create: `src/components/business-case/callouts.ts`

- [ ] **Step 1: Create the directory and file**

```typescript
// src/components/business-case/callouts.ts
import type { SectionId } from '@/store/businessCaseStore';

export const CALLOUTS: Record<'road', Record<SectionId, string>> = {
  road: {
    scene: 'Establishes the demographic context of the study area — population size, age profile, and socio-economic characteristics that drive transport demand.',
    growth: 'Documents the scale of projected growth, a core requirement of the Benefits Management Framework. High growth rates strengthen the case for new capacity.',
    'car-dependency':
      'Demonstrates structural reliance on private vehicles — a key problem statement for road investment. Trend data shows this is not a short-term phenomenon.',
    congestion:
      'Quantifies the travel time burden on existing users. Commute time trends establish a deteriorating baseline against which project benefits are measured.',
    economy:
      'Links transport access to employment and economic activity. Relevant to the Strategic Economic Infrastructure test in NSW infrastructure guidelines.',
    gap: 'Benchmarks current performance against TfNSW level of service standards, providing an evidence-based statement of the infrastructure gap.',
    evidence:
      'Summary of available data quality. Informs the Evidence Assessment section of the business case and flags where supplementary data collection may be needed.',
  },
};
```

- [ ] **Step 2: Verify it compiles**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment"
git add src/components/business-case/callouts.ts
git commit -m "feat: add business case callout text"
```

---

## Task 3: Add clipboard copy button to ChartWrapper

**Files:**
- Modify: `src/components/charts/ChartWrapper.tsx`

- [ ] **Step 1: Replace the file with the updated version**

The full updated file (adds `copied` state, `handleCopyToClipboard` function, `Clipboard` + `Check` icons, and the copy button rendered next to the download dropdown):

```typescript
'use client';

import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { Download, ChevronDown, Clipboard, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChartWrapperProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  data?: Array<Record<string, unknown>>;
  dataKeys?: string[];
  xAxisKey?: string;
}

function toHeaderLabel(key: string): string {
  const spaced = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ');
  return spaced
    .split(' ')
    .map((word) => {
      const upper = word.toUpperCase();
      if (word.length <= 3 && word === word.toLowerCase()) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export default function ChartWrapper({
  title,
  subtitle,
  children,
  className,
  data,
  dataKeys,
  xAxisKey = 'name',
}: ChartWrapperProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const captureCanvas = async () => {
    if (!chartRef.current) return null;
    await new Promise((resolve) => setTimeout(resolve, 100));
    return html2canvas(chartRef.current, {
      backgroundColor: '#ffffff',
      scale: 3,
      useCORS: true,
    });
  };

  const handleExportPNG = async () => {
    setExporting(true);
    try {
      const canvas = await captureCanvas();
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `${title.replace(/\s+/g, '_').toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Failed to export chart:', error);
    } finally {
      setExporting(false);
      setDropdownOpen(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!navigator.clipboard) return;
    try {
      const canvas = await captureCanvas();
      if (!canvas) return;
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }, 'image/png');
    } catch (error) {
      console.error('Failed to copy chart:', error);
    }
  };

  const handleExportExcel = () => {
    if (!data || data.length === 0) return;
    setDropdownOpen(false);
    try {
      const allKeys = dataKeys && dataKeys.length > 0
        ? [xAxisKey, ...dataKeys].filter((k) => k in data[0])
        : Object.keys(data[0]);
      const headerRow = allKeys.map(toHeaderLabel);
      const dataRows = data.map((row) => allKeys.map((k) => row[k] ?? ''));
      const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
      const workbook = XLSX.utils.book_new();
      const sheetName = title.slice(0, 31);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, `${title.replace(/\s+/g, '_').toLowerCase()}.xlsx`);
    } catch (error) {
      console.error('Failed to export Excel:', error);
    }
  };

  const hasExcelData = data && data.length > 0;
  const clipboardSupported = typeof navigator !== 'undefined' && !!navigator.clipboard;

  return (
    <div
      className={cn(
        'bg-white rounded-lg shadow-sm border border-gray-200 p-6',
        className
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {clipboardSupported && (
            <button
              onClick={handleCopyToClipboard}
              title="Copy chart to clipboard"
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Clipboard className="w-4 h-4" />
              )}
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              disabled={exporting}
            >
              <Download className="w-4 h-4" />
              <ChevronDown className="w-3 h-3" />
            </button>
            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[180px]">
                  <button
                    onClick={handleExportPNG}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Download PNG (3x)
                  </button>
                  {hasExcelData && (
                    <button
                      onClick={handleExportExcel}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Download Excel (.xlsx)
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div ref={chartRef}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Smoke-test in browser**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment" && npm run dev
```

Navigate to `/demographics`. Confirm:
- Clipboard icon appears next to the download button on each chart
- Clicking it briefly shows a green check
- Clicking the download dropdown still shows PNG and Excel options

- [ ] **Step 4: Commit**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment"
git add src/components/charts/ChartWrapper.tsx
git commit -m "feat: add clipboard copy button to ChartWrapper"
```

---

## Task 4: Add Business Case nav item to Sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add `Wand2` to the import and add the nav item**

In `src/components/layout/Sidebar.tsx`, change the lucide-react import line from:

```typescript
import {
  LayoutDashboard,
  Users,
  Train,
  TrendingUp,
  GraduationCap,
  Home,
  BarChart3,
  GitCompare,
  FileText,
  Upload,
  ChevronLeft,
  ChevronRight,
  Layers,
  ClipboardList,
} from 'lucide-react';
```

to:

```typescript
import {
  LayoutDashboard,
  Users,
  Train,
  TrendingUp,
  GraduationCap,
  Home,
  BarChart3,
  GitCompare,
  FileText,
  Upload,
  ChevronLeft,
  ChevronRight,
  Layers,
  ClipboardList,
  Wand2,
} from 'lucide-react';
```

Then change the Tools section from:

```typescript
  {
    label: 'Tools',
    items: [
      { href: '/compare', label: 'Compare Areas', icon: GitCompare },
      { href: '/report', label: 'Report Builder', icon: FileText },
      { href: '/upload', label: 'Upload Data', icon: Upload },
    ],
  },
```

to:

```typescript
  {
    label: 'Tools',
    items: [
      { href: '/compare', label: 'Compare Areas', icon: GitCompare },
      { href: '/report', label: 'Report Builder', icon: FileText },
      { href: '/business-case', label: 'Business Case', icon: Wand2 },
      { href: '/upload', label: 'Upload Data', icon: Upload },
    ],
  },
```

- [ ] **Step 2: Verify it compiles**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment" && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment"
git add src/components/layout/Sidebar.tsx
git commit -m "feat: add Business Case nav item to sidebar"
```

---

## Task 5: Build the WizardModal

**Files:**
- Create: `src/components/business-case/WizardModal.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/business-case/WizardModal.tsx
'use client';

import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Wand2 } from 'lucide-react';
import { THEMES, type ThemeKey } from '@/store/businessCaseStore';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';

interface WizardModalProps {
  onGenerate: (config: {
    projectName: string;
    areaIds: string[];
    themes: ThemeKey[];
  }) => void;
  onClose: () => void;
}

const PROJECT_TYPES = [
  { key: 'road', label: 'Road', available: true },
  { key: 'rail', label: 'Rail / Metro', available: false },
  { key: 'active', label: 'Active Transport', available: false },
  { key: 'freight', label: 'Freight', available: false },
] as const;

export default function WizardModal({ onGenerate, onClose }: WizardModalProps) {
  const [step, setStep] = useState(1);
  const [projectType, setProjectType] = useState<'road'>('road');
  const [projectName, setProjectName] = useState('');
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [areaSearch, setAreaSearch] = useState('');
  const [themes, setThemes] = useState<ThemeKey[]>(THEMES.map(t => t.key));

  const filteredAreas = SAMPLE_AREAS.filter(a =>
    a.type === 'lga' &&
    a.name.toLowerCase().includes(areaSearch.toLowerCase())
  ).slice(0, 40);

  const toggleArea = (id: string) => {
    setAreaIds(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const toggleTheme = (key: ThemeKey) => {
    setThemes(prev =>
      prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key]
    );
  };

  const canProceedStep1 = projectName.trim().length > 0 && areaIds.length > 0;
  const canProceedStep2 = themes.length > 0;

  const handleGenerate = () => {
    onGenerate({ projectName: projectName.trim(), areaIds, themes });
  };

  const selectedAreaNames = areaIds.map(id => SAMPLE_AREAS.find(a => a.id === id)?.name ?? id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-gray-900 font-semibold">
            <Wand2 className="w-5 h-5 text-indigo-600" />
            Business Case Wizard
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex px-6 pt-4 gap-2">
          {[1, 2, 3].map(n => (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step >= n ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}>{n}</div>
              {n < 3 && <div className={`flex-1 h-0.5 ${step > n ? 'bg-indigo-600' : 'bg-gray-100'}`} />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="px-6 py-5 min-h-[320px]">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Step 1 of 3</p>
                <h2 className="text-lg font-semibold text-gray-900">Project Context</h2>
              </div>

              {/* Project type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Project type</label>
                <div className="grid grid-cols-2 gap-2">
                  {PROJECT_TYPES.map(pt => (
                    <button
                      key={pt.key}
                      disabled={!pt.available}
                      onClick={() => pt.available && setProjectType('road')}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium text-left transition-colors ${
                        pt.available
                          ? projectType === pt.key
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                          : 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50'
                      }`}
                    >
                      {pt.label}
                      {!pt.available && <span className="ml-1 text-xs text-gray-300">(soon)</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Project name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="e.g. Western Sydney Airport Connector Road"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Area selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Study area LGAs <span className="text-gray-400 font-normal">(up to 4)</span>
                </label>
                {areaIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {areaIds.map(id => (
                      <span key={id} className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs">
                        {SAMPLE_AREAS.find(a => a.id === id)?.name ?? id}
                        <button onClick={() => toggleArea(id)} className="hover:text-indigo-900">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={areaSearch}
                  onChange={e => setAreaSearch(e.target.value)}
                  placeholder="Search LGA..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto">
                  {filteredAreas.map(area => (
                    <button
                      key={area.id}
                      onClick={() => toggleArea(area.id)}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors ${
                        areaIds.includes(area.id) ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                      }`}
                    >
                      {area.name}
                    </button>
                  ))}
                  {filteredAreas.length === 0 && (
                    <p className="px-3 py-2 text-sm text-gray-400">No results</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Step 2 of 3</p>
                <h2 className="text-lg font-semibold text-gray-900">Problem Framing</h2>
                <p className="text-sm text-gray-500 mt-1">Select the problems this project addresses. Each theme adds relevant evidence sections to your report.</p>
              </div>
              <div className="space-y-2">
                {THEMES.map(theme => (
                  <label key={theme.key} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={themes.includes(theme.key)}
                      onChange={() => toggleTheme(theme.key)}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    <span className="text-sm text-gray-800">{theme.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Step 3 of 3</p>
                <h2 className="text-lg font-semibold text-gray-900">Review & Generate</h2>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-sm">
                <div>
                  <span className="text-gray-500">Project:</span>{' '}
                  <span className="font-medium text-gray-900">{projectName}</span>
                </div>
                <div>
                  <span className="text-gray-500">Type:</span>{' '}
                  <span className="font-medium text-gray-900 capitalize">{projectType}</span>
                </div>
                <div>
                  <span className="text-gray-500">Areas:</span>{' '}
                  <span className="font-medium text-gray-900">{selectedAreaNames.join(', ')}</span>
                </div>
                <div>
                  <span className="text-gray-500">Evidence themes:</span>
                  <ul className="mt-1 space-y-0.5 ml-2">
                    {THEMES.filter(t => themes.includes(t.key)).map(t => (
                      <li key={t.key} className="text-gray-700">· {t.label}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              <Wand2 className="w-4 h-4" />
              Generate Business Case Evidence
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment"
git add src/components/business-case/WizardModal.tsx
git commit -m "feat: build 3-step Business Case WizardModal"
```

---

## Task 6: Build the /business-case results page

**Files:**
- Create: `src/app/business-case/page.tsx`

This is the largest task. It creates the full two-column results page.

- [ ] **Step 1: Create the page**

```typescript
// src/app/business-case/page.tsx
'use client';

import { useState, useRef } from 'react';
import Header from '@/components/layout/Header';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsBarChart from '@/components/charts/BarChart';
import NeedsLineChart from '@/components/charts/LineChart';
import NeedsPieChart from '@/components/charts/PieChart';
import WizardModal from '@/components/business-case/WizardModal';
import { CALLOUTS } from '@/components/business-case/callouts';
import {
  useBusinessCaseStore,
  THEMES,
  SECTION_IDS,
  type ThemeKey,
  type SectionId,
} from '@/store/businessCaseStore';
import { useAppStore } from '@/store';
import { useLiveData } from '@/hooks/useLiveData';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import { getProjectionsForArea } from '@/lib/data/nsw-projections-data';
import { formatNumber, formatPercent, CHART_COLORS } from '@/lib/utils';
import { Wand2, Download, RotateCcw } from 'lucide-react';

// Which themes activate which sections
const THEME_TO_SECTIONS: Record<ThemeKey, SectionId[]> = {
  growth: ['growth'],
  congestion: ['car-dependency', 'congestion'],
  'car-dependency': ['car-dependency'],
  economy: ['economy'],
  freight: [],
};

// Sections that are always shown
const ALWAYS_ON: SectionId[] = ['scene', 'gap', 'evidence'];

const SECTION_HEADINGS: Record<SectionId, string> = {
  scene: 'Setting the Scene',
  growth: 'Growth Pressure',
  'car-dependency': 'Car Dependency',
  congestion: 'Congestion & Commute',
  economy: 'Economic Activity',
  gap: 'Infrastructure Gap',
  evidence: 'Evidence Summary',
};

export default function BusinessCasePage() {
  const { selectedYear } = useAppStore();
  const {
    projectName,
    projectType,
    areaIds,
    themes,
    sectionToggles,
    setProject,
    toggleSection,
    clearProject,
  } = useBusinessCaseStore();

  const [wizardOpen, setWizardOpen] = useState(!projectName);
  const reportRef = useRef<HTMLDivElement>(null);

  const primaryAreaId = areaIds[0] ?? 'lga_sydney';
  const primaryArea = SAMPLE_AREAS.find(a => a.id === primaryAreaId);
  const { demographics, transport, economy, growth } = useLiveData(primaryAreaId, selectedYear);

  const nswProjections = getProjectionsForArea(primaryAreaId).length > 0
    ? getProjectionsForArea(primaryAreaId)
    : getProjectionsForArea(primaryArea?.name ?? '');

  const handleGenerate = (config: { projectName: string; areaIds: string[]; themes: ThemeKey[] }) => {
    // Derive which sections should be on based on themes
    const themeActivated = new Set<SectionId>();
    config.themes.forEach(theme => {
      THEME_TO_SECTIONS[theme]?.forEach(s => themeActivated.add(s));
    });
    const toggles = Object.fromEntries(
      SECTION_IDS.map(id => [id, ALWAYS_ON.includes(id) || themeActivated.has(id)])
    ) as Record<SectionId, boolean>;

    setProject({
      projectName: config.projectName,
      projectType: 'road',
      areaIds: config.areaIds,
      themes: config.themes,
      sectionToggles: toggles,
    });
    setWizardOpen(false);
  };

  const handleNewProject = () => {
    clearProject();
    setWizardOpen(true);
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= 297;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= 297;
      }
      const safeName = projectName.replace(/\s+/g, '_');
      const safeArea = (primaryArea?.name ?? 'area').replace(/\s+/g, '_');
      pdf.save(`${safeName}_${safeArea}_business_case.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    }
  };

  // Sections visible = toggled on AND (always-on OR theme-activated)
  const visibleSections = SECTION_IDS.filter(id => sectionToggles[id]);

  // --- Data preparation ---
  const d = demographics.data;
  const t = transport.data;
  const e = economy.data;
  const g = growth.data;

  const modeShareData = [
    { name: 'Car (driver)', value: t.carModeShare },
    { name: 'Car (passenger)', value: t.carPassengerShare ?? 0 },
    { name: 'Public transport', value: t.ptModeShare },
    { name: 'Active', value: t.activeTransportShare ?? 0 },
    { name: 'Work from home', value: t.workFromHomeShare ?? 0 },
    { name: 'Other', value: t.otherModeShare ?? 0 },
  ].filter(item => item.value > 0);

  const modeShareTrendData = (t.modeShareTrend ?? []).map((row: Record<string, unknown>) => ({
    year: row.year,
    Car: row.car,
    'Public Transport': row.pt,
    Active: row.active,
  }));

  const industryData = (e.employmentByIndustry ?? [])
    .slice(0, 10)
    .map((row: { industry: string; employed: number }) => ({ name: row.industry, value: row.employed }));

  const employmentProjectionData = (g.employmentProjections ?? []).map(
    (row: { year: number; employment: number }) => ({ year: String(row.year), Employment: row.employment })
  );

  const popProjectionData = [
    ...(g.historicalPopulation ?? []).map((row: { year: number; population: number }) => ({
      year: String(row.year), Population: row.population, type: 'historical',
    })),
    ...nswProjections.map(row => ({
      year: String(row.year), Population: row.population, type: 'projected',
    })),
  ];

  const callouts = CALLOUTS[projectType ?? 'road'];

  const renderSection = (id: SectionId) => {
    const callout = callouts[id];
    return (
      <div key={id} className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{SECTION_HEADINGS[id]}</h2>
          {callout && <p className="text-sm text-gray-500 mt-1 italic">{callout}</p>}
        </div>

        {id === 'scene' && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Population', value: formatNumber(d.totalPopulation) },
              { label: 'Median Age', value: `${d.medianAge} yrs` },
              { label: 'SEIFA Score', value: d.seifaScore ? String(d.seifaScore) : 'N/A' },
              { label: 'Car Mode Share', value: formatPercent(t.carModeShare) },
              { label: 'Median Income', value: `$${d.medianWeeklyIncome ?? 'N/A'}/wk` },
              { label: 'Primary LGA', value: primaryArea?.name ?? primaryAreaId },
            ].map(stat => (
              <div key={stat.label} className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">{stat.label}</div>
                <div className="text-lg font-bold text-gray-900 mt-0.5">{stat.value}</div>
              </div>
            ))}
          </div>
        )}

        {id === 'growth' && (
          <div className="grid grid-cols-1 gap-4">
            <ChartWrapper
              title="Population Growth & Projections"
              data={popProjectionData}
              dataKeys={['Population']}
              xAxisKey="year"
            >
              <NeedsLineChart
                data={popProjectionData}
                lines={[{ key: 'Population', name: 'Population', color: CHART_COLORS[0] }]}
                xKey="year"
                height={260}
              />
            </ChartWrapper>
            {employmentProjectionData.length > 0 && (
              <ChartWrapper
                title="Employment Growth & Projections"
                data={employmentProjectionData}
                dataKeys={['Employment']}
                xAxisKey="year"
              >
                <NeedsLineChart
                  data={employmentProjectionData}
                  lines={[{ key: 'Employment', name: 'Employment', color: CHART_COLORS[1] }]}
                  xKey="year"
                  height={260}
                />
              </ChartWrapper>
            )}
          </div>
        )}

        {id === 'car-dependency' && (
          <div className="grid grid-cols-1 gap-4">
            <ChartWrapper
              title="Journey to Work Mode Share (2021)"
              data={modeShareData}
              dataKeys={['value']}
              xAxisKey="name"
            >
              <NeedsBarChart
                data={modeShareData}
                bars={[{ key: 'value', name: 'Share (%)', color: CHART_COLORS[0] }]}
                xKey="name"
                layout="horizontal"
                height={220}
              />
            </ChartWrapper>
            {modeShareTrendData.length > 0 && (
              <ChartWrapper
                title="Mode Share Trend (2011–2021)"
                data={modeShareTrendData}
                dataKeys={['Car', 'Public Transport', 'Active']}
                xAxisKey="year"
              >
                <NeedsLineChart
                  data={modeShareTrendData}
                  lines={[
                    { key: 'Car', name: 'Car', color: CHART_COLORS[0] },
                    { key: 'Public Transport', name: 'Public Transport', color: CHART_COLORS[1] },
                    { key: 'Active', name: 'Active', color: CHART_COLORS[2] },
                  ]}
                  xKey="year"
                  height={240}
                />
              </ChartWrapper>
            )}
          </div>
        )}

        {id === 'congestion' && (
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <p>Average commute time: <span className="font-semibold text-gray-900">{t.avgCommuteTime} minutes</span></p>
            <p className="mt-1">PT mode share: <span className="font-semibold text-gray-900">{formatPercent(t.ptModeShare)}</span></p>
            {!t.commuteTimeTrend && (
              <p className="mt-2 text-gray-400 italic">Commute time trend data not available for this LGA. Run <code>npm run seed:abs</code> to fetch live TfNSW data.</p>
            )}
          </div>
        )}

        {id === 'economy' && industryData.length > 0 && (
          <ChartWrapper
            title="Employment by Industry"
            data={industryData}
            dataKeys={['value']}
            xAxisKey="name"
          >
            <NeedsBarChart
              data={industryData}
              bars={[{ key: 'value', name: 'Employed', color: CHART_COLORS[2] }]}
              xKey="name"
              layout="horizontal"
              height={300}
            />
          </ChartWrapper>
        )}

        {id === 'gap' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-gray-700">
            <p className="font-medium text-amber-900 mb-1">Level of Service Gap</p>
            <p>Car mode share of <span className="font-semibold">{formatPercent(t.carModeShare)}</span> against TfNSW outer metro target of ~60%. PT mode share of <span className="font-semibold">{formatPercent(t.ptModeShare)}</span> against target of ~20–25%.</p>
            <p className="mt-2 text-gray-500 italic">For detailed gap analysis see the <a href="/problem-definition" className="text-indigo-600 hover:underline">Problem Definition</a> page.</p>
          </div>
        )}

        {id === 'evidence' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium text-gray-700 border border-gray-200">Category</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700 border border-gray-200">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700 border border-gray-200">Source</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { category: 'Demand & Population', status: 'Available', source: 'ABS Census 2021, NSW DPE Projections' },
                  { category: 'Transport Performance', status: demographics.meta.hasLiveData ? 'Available' : 'Partial', source: 'TfNSW TZP24, ABS Census' },
                  { category: 'Infrastructure Condition', status: 'Not Available', source: 'Requires supplementary data collection' },
                  { category: 'Safety', status: 'Not Available', source: 'Requires ROADS data / crash statistics' },
                  { category: 'Economic Cost', status: 'Partial', source: 'ABS income data; full BCA requires modelling' },
                ].map(row => (
                  <tr key={row.category}>
                    <td className="px-3 py-2 border border-gray-200 text-gray-800">{row.category}</td>
                    <td className="px-3 py-2 border border-gray-200">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        row.status === 'Available' ? 'bg-emerald-50 text-emerald-700' :
                        row.status === 'Partial' ? 'bg-amber-50 text-amber-700' :
                        'bg-red-50 text-red-700'
                      }`}>{row.status}</span>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 text-gray-500">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Business Case Wizard"
        subtitle={projectName || 'Generate evidence for your infrastructure business case'}
      />

      {wizardOpen && (
        <WizardModal
          onGenerate={handleGenerate}
          onClose={() => projectName ? setWizardOpen(false) : undefined}
        />
      )}

      {projectName && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel */}
          <div className="w-72 border-r border-gray-100 bg-gray-50 flex flex-col overflow-y-auto p-4 gap-4 flex-shrink-0">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Project</label>
              <p className="text-sm font-semibold text-gray-900">{projectName}</p>
              <p className="text-xs text-gray-500">{SAMPLE_AREAS.find(a => a.id === primaryAreaId)?.name ?? primaryAreaId}{areaIds.length > 1 ? ` +${areaIds.length - 1} more` : ''}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Sections</label>
              <div className="space-y-1">
                {SECTION_IDS.filter(id => sectionToggles[id] !== undefined).map(id => {
                  const alwaysOn = ALWAYS_ON.includes(id);
                  return (
                    <label key={id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-gray-100 ${alwaysOn ? 'opacity-60' : ''}`}>
                      <input
                        type="checkbox"
                        checked={sectionToggles[id]}
                        disabled={alwaysOn}
                        onChange={() => !alwaysOn && toggleSection(id)}
                        className="accent-indigo-600"
                      />
                      <span className="text-gray-700">{SECTION_HEADINGS[id]}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto space-y-2">
              <button
                onClick={handleExportPDF}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Export PDF
              </button>
              <button
                onClick={handleNewProject}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                New Project
              </button>
            </div>
          </div>

          {/* Right panel */}
          <div className="flex-1 overflow-y-auto p-6 bg-white">
            <div ref={reportRef} className="max-w-3xl mx-auto space-y-10">
              {/* Cover */}
              <div className="border-b border-gray-200 pb-6">
                <div className="flex items-center gap-2 text-indigo-600 mb-2">
                  <Wand2 className="w-5 h-5" />
                  <span className="text-sm font-medium uppercase tracking-wide">Business Case Evidence</span>
                </div>
                <h1 className="text-3xl font-bold text-gray-900">{projectName}</h1>
                <p className="text-gray-500 mt-1">{SAMPLE_AREAS.find(a => a.id === primaryAreaId)?.name ?? primaryAreaId} · {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>

              {/* Narrative sections */}
              {visibleSections.map(id => renderSection(id))}
            </div>
          </div>
        </div>
      )}

      {!projectName && !wizardOpen && (
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
          >
            <Wand2 className="w-5 h-5" />
            Start Business Case Wizard
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment" && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. If there are type errors relating to chart component props (e.g. `bars`, `lines` prop shapes), read the relevant chart component file and adjust the props to match its actual interface.

- [ ] **Step 3: Smoke-test the full flow in browser**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment" && npm run dev
```

1. Click "Business Case" in the sidebar — wizard modal opens
2. Step 1: enter a project name, select Penrith LGA, click Next
3. Step 2: leave all themes checked, click Next
4. Step 3: review summary, click "Generate Business Case Evidence"
5. Confirm results page renders with left panel (section toggles, Export PDF, New Project) and right panel (cover + narrative sections)
6. Uncheck "Growth Pressure" in left panel — section disappears from right panel
7. Click "Export PDF" — PDF downloads
8. Click "New Project" — wizard reopens
9. Refresh page — project state persists (cover + sections still visible)

- [ ] **Step 4: Commit**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment"
git add src/app/business-case/page.tsx
git commit -m "feat: build /business-case results page with narrative report"
```

---

## Task 7: Final end-to-end verification

- [ ] **Step 1: Full smoke test**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment" && npm run dev
```

Run through this checklist:

| Check | Expected |
|---|---|
| `/business-case` opens wizard on first visit | ✓ |
| Wizard step 1 — Next disabled until name + area selected | ✓ |
| Wizard step 2 — uncheck a theme, proceed | ✓ |
| Wizard step 3 — summary card shows correct values | ✓ |
| Generate → results page renders | ✓ |
| Unchecked theme → its section absent from report | ✓ |
| Section toggle in left panel works | ✓ |
| Clipboard copy button on any chart page | ✓ |
| Clipboard copy shows green check for 1.5s | ✓ |
| Download PNG still works | ✓ |
| Export PDF generates file named `{project}_{area}_business_case.pdf` | ✓ |
| Refresh — project persists | ✓ |
| New Project — wizard reopens, generate replaces old state | ✓ |
| "Business Case" in sidebar — active state highlights correctly | ✓ |

- [ ] **Step 2: Build check**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment" && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Final commit**

```bash
cd "/Users/victor/Documents/Needs Assessment/Needs-Assessment"
git add -A
git status
# Verify only expected files are staged
git commit -m "feat: complete business case wizard — end-to-end verified"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✓ `/business-case` route with sidebar entry
- ✓ 3-step wizard modal (project context → problem framing → review & generate)
- ✓ businessCaseStore with localStorage persistence
- ✓ All 7 narrative sections with callout text
- ✓ Section visibility driven by theme selection
- ✓ Section toggles on left panel
- ✓ Per-chart PNG download (existing) + clipboard copy (new)
- ✓ Export PDF
- ✓ "New Project" resets and reopens wizard
- ✓ Road-only at launch (other types greyed out)
- ✓ Clipboard copy button added globally to ChartWrapper

**Type consistency:** `ThemeKey`, `SectionId`, `SECTION_IDS`, `THEMES` all defined in `businessCaseStore.ts` and imported consistently in `WizardModal.tsx`, `page.tsx`, and `callouts.ts`.

**Chart props:** The plan uses `bars`, `lines`, `xKey`, `layout`, `height` props. If the actual BarChart/LineChart component interfaces differ, Task 6 Step 2 instructs the implementer to read the component and adjust props accordingly.
