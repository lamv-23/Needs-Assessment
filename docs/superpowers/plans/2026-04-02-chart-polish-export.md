# Chart Polish & Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish all charts to consulting-grade quality for professional document export, increase PNG export to 3x scale, and add Excel (.xlsx) data download to every chart.

**Architecture:** All changes are confined to `src/lib/utils.ts` (palette) and `src/components/charts/` (5 chart components + ChartWrapper). `ChartWrapper` gets new `data`/`dataKeys` props threaded from each call site; Excel export uses the already-installed `xlsx` package.

**Tech Stack:** Recharts 2.15.x, xlsx 0.18.5 (already installed), html2canvas 1.4.1 (already installed), Next.js 14 App Router, TypeScript

---

## Files Modified

| File | Change |
|------|--------|
| `src/lib/utils.ts` | Replace `CHART_COLORS` with polished palette |
| `src/components/charts/ChartWrapper.tsx` | Add `data`/`dataKeys` props, PNG 3x, Excel export |
| `src/components/charts/BarChart.tsx` | Visual polish (grid, tooltip, axes, bar radius) |
| `src/components/charts/LineChart.tsx` | Visual polish (grid, tooltip, axes, line width, dots) |
| `src/components/charts/PieChart.tsx` | Visual polish (grid, tooltip, label size) |
| `src/components/charts/PopulationPyramid.tsx` | Visual polish (grid, tooltip, axes) |
| `src/components/charts/StackedBar.tsx` | Visual polish (grid, tooltip, axes, bar radius) |

No page files need changing — `data` and `dataKeys` props already exist on all chart components and are passed through at every call site; they just need forwarding into `ChartWrapper`.

---

## Shared Style Constants (reference for all tasks)

These values are used consistently across Tasks 2–6:

```ts
// Grid
stroke="#e2e8f0"
strokeOpacity={0.8}
strokeDasharray="3 3"

// Tooltip contentStyle
{
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  fontSize: 12,
  fontFamily: 'Inter, system-ui, sans-serif',
}

// Axis tick style
{ fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif', fill: '#374151' }

// Axis label style (for label objects)
{ fontWeight: 600, fontSize: 12, fill: '#111827' }
```

---

### Task 1: Update CHART_COLORS palette

**Files:**
- Modify: `src/lib/utils.ts:45-56`

- [ ] **Step 1: Replace CHART_COLORS**

In `src/lib/utils.ts`, replace lines 45–56:

```ts
export const CHART_COLORS = [
  '#2563EB', // deep blue (primary)
  '#0891B2', // teal-cyan
  '#059669', // emerald
  '#D97706', // warm amber
  '#7C3AED', // violet
  '#DC2626', // clear red
  '#0284C7', // sky blue
  '#EA580C', // burnt orange
  '#4F46E5', // indigo
  '#0D9488', // teal
];
```

- [ ] **Step 2: Verify dev server compiles**

Run: `npm run dev`
Expected: Server starts on localhost:3000 with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils.ts
git commit -m "feat: update CHART_COLORS to consulting-grade palette"
```

---

### Task 2: Polish BarChart component

**Files:**
- Modify: `src/components/charts/BarChart.tsx`

- [ ] **Step 1: Update CartesianGrid, Tooltip, axes, and bar radius**

Replace the full content of `src/components/charts/BarChart.tsx`:

```tsx
'use client';

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from '@/lib/utils';

interface BarChartProps {
  data: Array<Record<string, string | number>>;
  dataKeys: string[];
  colors?: string[];
  layout?: 'vertical' | 'horizontal';
  xAxisLabel?: string;
  yAxisLabel?: string;
  height?: number;
}

const TICK_STYLE = { fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif', fill: '#374151' };
const LABEL_STYLE = { fontWeight: 600, fontSize: 12, fill: '#111827' };
const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  fontSize: 12,
  fontFamily: 'Inter, system-ui, sans-serif',
};

export default function BarChart({
  data,
  dataKeys,
  colors = CHART_COLORS,
  layout = 'horizontal',
  xAxisLabel,
  yAxisLabel,
  height = 400,
}: BarChartProps) {
  const isVertical = layout === 'vertical';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        layout={isVertical ? 'vertical' : 'horizontal'}
        margin={{ top: 5, right: 30, left: 20, bottom: xAxisLabel ? 30 : 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.8} />
        {isVertical ? (
          <>
            <XAxis
              type="number"
              tick={TICK_STYLE}
              label={
                xAxisLabel
                  ? { value: xAxisLabel, position: 'bottom', offset: 10, style: LABEL_STYLE }
                  : undefined
              }
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={TICK_STYLE}
              label={
                yAxisLabel
                  ? { value: yAxisLabel, angle: -90, position: 'insideLeft', offset: -10, style: LABEL_STYLE }
                  : undefined
              }
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey="name"
              tick={TICK_STYLE}
              label={
                xAxisLabel
                  ? { value: xAxisLabel, position: 'bottom', offset: 10, style: LABEL_STYLE }
                  : undefined
              }
            />
            <YAxis
              tick={TICK_STYLE}
              label={
                yAxisLabel
                  ? { value: yAxisLabel, angle: -90, position: 'insideLeft', offset: -10, style: LABEL_STYLE }
                  : undefined
              }
            />
          </>
        )}
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend />
        {dataKeys.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            fill={colors[index % colors.length]}
            radius={[3, 3, 0, 0]}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/BarChart.tsx
git commit -m "feat: polish BarChart — refined grid, tooltip, typography, bar radius"
```

---

### Task 3: Polish LineChart component

**Files:**
- Modify: `src/components/charts/LineChart.tsx`

- [ ] **Step 1: Update LineChart with bold lines, refined grid, tooltip, axes**

Replace the full content of `src/components/charts/LineChart.tsx`:

```tsx
'use client';

import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from '@/lib/utils';

interface LineChartProps {
  data: Array<Record<string, string | number>>;
  dataKeys: string[];
  colors?: string[];
  xAxisKey?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  height?: number;
}

const TICK_STYLE = { fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif', fill: '#374151' };
const LABEL_STYLE = { fontWeight: 600, fontSize: 12, fill: '#111827' };
const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  fontSize: 12,
  fontFamily: 'Inter, system-ui, sans-serif',
};

export default function LineChart({
  data,
  dataKeys,
  colors = CHART_COLORS,
  xAxisKey = 'name',
  xAxisLabel,
  yAxisLabel,
  height = 400,
}: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: xAxisLabel ? 30 : 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.8} />
        <XAxis
          dataKey={xAxisKey}
          tick={TICK_STYLE}
          label={
            xAxisLabel
              ? { value: xAxisLabel, position: 'bottom', offset: 10, style: LABEL_STYLE }
              : undefined
          }
        />
        <YAxis
          tick={TICK_STYLE}
          label={
            yAxisLabel
              ? { value: yAxisLabel, angle: -90, position: 'insideLeft', offset: -10, style: LABEL_STYLE }
              : undefined
          }
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend />
        {dataKeys.map((key, index) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={colors[index % colors.length]}
            strokeWidth={3}
            dot={{ r: 3, strokeWidth: 2 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/LineChart.tsx
git commit -m "feat: polish LineChart — bolder lines, refined grid, tooltip, typography"
```

---

### Task 4: Polish PieChart component

**Files:**
- Modify: `src/components/charts/PieChart.tsx`

- [ ] **Step 1: Update PieChart tooltip, label font size**

Replace the full content of `src/components/charts/PieChart.tsx`:

```tsx
'use client';

import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from '@/lib/utils';

interface PieChartDataItem {
  name: string;
  value: number;
}

interface PieChartProps {
  data: PieChartDataItem[];
  colors?: string[];
  showLabels?: boolean;
  innerRadius?: number;
  height?: number;
}

interface LabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}

const RADIAN = Math.PI / 180;

const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  fontSize: 12,
  fontFamily: 'Inter, system-ui, sans-serif',
};

function renderCustomLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: LabelProps) {
  if (percent < 0.03) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={13}
      fontWeight={600}
      fontFamily="Inter, system-ui, sans-serif"
    >
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  );
}

export default function PieChart({
  data,
  colors = CHART_COLORS,
  showLabels = true,
  innerRadius = 0,
  height = 400,
}: PieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsPieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius="80%"
          dataKey="value"
          nameKey="name"
          label={showLabels ? renderCustomLabel : false}
          labelLine={false}
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={colors[index % colors.length]}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => value.toLocaleString()}
          contentStyle={TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }} />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/PieChart.tsx
git commit -m "feat: polish PieChart — larger labels, refined tooltip, typography"
```

---

### Task 5: Polish PopulationPyramid component

**Files:**
- Modify: `src/components/charts/PopulationPyramid.tsx`

- [ ] **Step 1: Update grid, tooltip, axes typography**

Replace the full content of `src/components/charts/PopulationPyramid.tsx`:

```tsx
'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { formatNumber } from '@/lib/utils';

interface PyramidDataItem {
  ageGroup: string;
  male: number;
  female: number;
}

interface PopulationPyramidProps {
  data: PyramidDataItem[];
  height?: number;
  maleColor?: string;
  femaleColor?: string;
}

const TICK_STYLE = { fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif', fill: '#374151' };
const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  fontSize: 12,
  fontFamily: 'Inter, system-ui, sans-serif',
};

export default function PopulationPyramid({
  data,
  height = 500,
  maleColor = '#2563EB',
  femaleColor = '#DC2626',
}: PopulationPyramidProps) {
  const transformedData = data.map((item) => ({
    ageGroup: item.ageGroup,
    male: -Math.abs(item.male),
    female: Math.abs(item.female),
  }));

  const maxValue = Math.max(
    ...data.map((d) => Math.max(d.male, d.female))
  );

  const formatTick = (value: number) => formatNumber(Math.abs(value));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={transformedData}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        barCategoryGap="15%"
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.8} />
        <XAxis
          type="number"
          domain={[-maxValue * 1.1, maxValue * 1.1]}
          tickFormatter={formatTick}
          tick={TICK_STYLE}
        />
        <YAxis
          type="category"
          dataKey="ageGroup"
          width={80}
          tick={TICK_STYLE}
        />
        <Tooltip
          formatter={(value: number, name: string) => [
            formatNumber(Math.abs(value)),
            name.charAt(0).toUpperCase() + name.slice(1),
          ]}
          contentStyle={TOOLTIP_STYLE}
        />
        <Legend
          formatter={(value: string) =>
            value.charAt(0).toUpperCase() + value.slice(1)
          }
          wrapperStyle={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }}
        />
        <Bar dataKey="male" name="male">
          {transformedData.map((_, index) => (
            <Cell key={`male-${index}`} fill={maleColor} />
          ))}
        </Bar>
        <Bar dataKey="female" name="female">
          {transformedData.map((_, index) => (
            <Cell key={`female-${index}`} fill={femaleColor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

Note: `maleColor` default updated from `#3b82f6` to `#2563EB` and `femaleColor` from `#ec4899` to `#DC2626` to match new palette. Sites that pass explicit colors are unaffected.

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/PopulationPyramid.tsx
git commit -m "feat: polish PopulationPyramid — refined grid, tooltip, typography, updated default colors"
```

---

### Task 6: Polish StackedBar component

**Files:**
- Modify: `src/components/charts/StackedBar.tsx`

- [ ] **Step 1: Update StackedBar with same polish as BarChart**

Replace the full content of `src/components/charts/StackedBar.tsx`:

```tsx
'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from '@/lib/utils';

interface StackedBarProps {
  data: Array<Record<string, string | number>>;
  dataKeys: string[];
  colors?: string[];
  layout?: 'vertical' | 'horizontal';
  xAxisLabel?: string;
  yAxisLabel?: string;
  height?: number;
}

const TICK_STYLE = { fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif', fill: '#374151' };
const LABEL_STYLE = { fontWeight: 600, fontSize: 12, fill: '#111827' };
const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  fontSize: 12,
  fontFamily: 'Inter, system-ui, sans-serif',
};

export default function StackedBar({
  data,
  dataKeys,
  colors = CHART_COLORS,
  layout = 'horizontal',
  xAxisLabel,
  yAxisLabel,
  height = 400,
}: StackedBarProps) {
  const isVertical = layout === 'vertical';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={isVertical ? 'vertical' : 'horizontal'}
        margin={{ top: 5, right: 30, left: 20, bottom: xAxisLabel ? 30 : 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.8} />
        {isVertical ? (
          <>
            <XAxis
              type="number"
              tick={TICK_STYLE}
              label={
                xAxisLabel
                  ? { value: xAxisLabel, position: 'bottom', offset: 10, style: LABEL_STYLE }
                  : undefined
              }
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={TICK_STYLE}
              label={
                yAxisLabel
                  ? { value: yAxisLabel, angle: -90, position: 'insideLeft', offset: -10, style: LABEL_STYLE }
                  : undefined
              }
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey="name"
              tick={TICK_STYLE}
              label={
                xAxisLabel
                  ? { value: xAxisLabel, position: 'bottom', offset: 10, style: LABEL_STYLE }
                  : undefined
              }
            />
            <YAxis
              tick={TICK_STYLE}
              label={
                yAxisLabel
                  ? { value: yAxisLabel, angle: -90, position: 'insideLeft', offset: -10, style: LABEL_STYLE }
                  : undefined
              }
            />
          </>
        )}
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }} />
        {dataKeys.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="stack"
            fill={colors[index % colors.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/StackedBar.tsx
git commit -m "feat: polish StackedBar — refined grid, tooltip, typography"
```

---

### Task 7: Upgrade ChartWrapper — PNG 3x + Excel export

**Files:**
- Modify: `src/components/charts/ChartWrapper.tsx`

- [ ] **Step 1: Replace ChartWrapper with updated version**

Replace the full content of `src/components/charts/ChartWrapper.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { Download, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChartWrapperProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  data?: Array<Record<string, unknown>>;
  dataKeys?: string[];
}

function toHeaderLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ChartWrapper({
  title,
  subtitle,
  children,
  className,
  data,
  dataKeys,
}: ChartWrapperProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportPNG = async () => {
    if (!chartRef.current) return;
    setExporting(true);
    try {
      // Short delay to ensure fonts are fully rendered
      await new Promise((resolve) => setTimeout(resolve, 100));
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        allowTaint: false,
      });
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

  const handleExportExcel = () => {
    if (!data || data.length === 0) return;
    setDropdownOpen(false);

    // Determine columns: use dataKeys if provided, else all keys from first row
    const allKeys = dataKeys && dataKeys.length > 0
      ? ['name', ...dataKeys].filter((k) => k in data[0])
      : Object.keys(data[0]);

    const headerRow = allKeys.map(toHeaderLabel);
    const dataRows = data.map((row) => allKeys.map((k) => row[k] ?? ''));

    const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    const workbook = XLSX.utils.book_new();
    // Excel sheet names max 31 chars
    const sheetName = title.slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `${title.replace(/\s+/g, '_').toLowerCase()}.xlsx`);
  };

  const hasExcelData = data && data.length > 0;

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
      <div ref={chartRef}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors. If `xlsx` types are missing run: `npm install --save-dev @types/xlsx` (though xlsx 0.18.5 ships its own types — no extra install needed).

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/ChartWrapper.tsx
git commit -m "feat: ChartWrapper — PNG at 3x scale, Excel data download"
```

---

### Task 8: Wire data/dataKeys into ChartWrapper at call sites

**Context:** `ChartWrapper` now accepts `data` and `dataKeys` props for Excel export, but they're optional — charts without them will just hide the Excel button. We need to find all `ChartWrapper` usages and pass through `data` and `dataKeys` where available.

**Files:**
- Search all pages for `<ChartWrapper`

- [ ] **Step 1: Find all ChartWrapper usages**

Run:
```bash
grep -rn "ChartWrapper" src/app --include="*.tsx" -l
```
Expected: Lists all page files that use ChartWrapper.

- [ ] **Step 2: For each page file, add data/dataKeys to ChartWrapper**

For every `<ChartWrapper title="...">` that wraps a chart component which already has a `data` and `dataKeys` prop, pass those same values up:

**Pattern — before:**
```tsx
<ChartWrapper title="Journey to Work Mode Share">
  <NeedsBarChart
    data={transportData.journeyToWork}
    dataKeys={['value']}
    ...
  />
</ChartWrapper>
```

**Pattern — after:**
```tsx
<ChartWrapper
  title="Journey to Work Mode Share"
  data={transportData.journeyToWork}
  dataKeys={['value']}
>
  <NeedsBarChart
    data={transportData.journeyToWork}
    dataKeys={['value']}
    ...
  />
</ChartWrapper>
```

Apply this pattern to every ChartWrapper that wraps a chart with a `data` prop. For ChartWrappers that wrap maps or other non-chart children (e.g. the NSW map), skip — `data`/`dataKeys` are optional so the Excel button simply won't appear.

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app
git commit -m "feat: wire data/dataKeys into ChartWrapper at all chart call sites"
```

---

### Task 9: End-to-end verification

- [ ] **Step 1: Run dev server**

```bash
npm run dev
```
Expected: Starts on localhost:3000 with no errors.

- [ ] **Step 2: Visual check — demographics page**

Open http://localhost:3000/demographics.
- Charts use new deeper blue/teal/emerald/amber palette
- Axis text is darker and slightly smaller (11px)
- Grid lines are cooler gray
- Population pyramid renders correctly

- [ ] **Step 3: Visual check — transport and economy pages**

Open http://localhost:3000/transport and http://localhost:3000/economy.
- Line charts have bolder (3px) lines
- Tooltips have rounded corners and subtle shadow

- [ ] **Step 4: PNG download test**

Click the download dropdown on any chart → "Download PNG (3x)".
- File downloads
- Open in Preview/Photos — zoom to 200%, verify crisp edges (no pixelation)

- [ ] **Step 5: Excel download test**

Click the download dropdown on any chart → "Download Excel (.xlsx)".
- File downloads
- Open in Excel or Numbers
- Verify: first row is header with human-readable column names, subsequent rows are data

- [ ] **Step 6: Check charts without data prop**

Maps (e.g. the NSW demographics choropleth map) should show download dropdown with only "Download PNG (3x)" — no Excel option.

- [ ] **Step 7: Final build check**

```bash
npm run build
```
Expected: Build completes with no errors.
