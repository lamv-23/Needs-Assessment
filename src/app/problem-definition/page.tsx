'use client';

import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsLineChart from '@/components/charts/LineChart';
import NeedsBarChart from '@/components/charts/BarChart';
import StackedBar from '@/components/charts/StackedBar';
import { useAppStore } from '@/store';
import { formatNumber, CHART_COLORS } from '@/lib/utils';
import {
  Clock,
  Car,
  Train,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
} from 'lucide-react';
import { useLiveData } from '@/hooks/useLiveData';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';

// ─── Service Level Standards ──────────────────────────────────────────────────
// Based on TfNSW planning standards and Connecting NSW mode share targets

type UrbanType = 'inner' | 'middle' | 'outer' | 'regional';

interface LevelOfServiceTarget {
  indicator: string;
  unit: string;
  inner: number;
  middle: number;
  outer: number;
  regional: number;
  direction: 'higher_better' | 'lower_better';
  source: string;
}

const LOS_TARGETS: LevelOfServiceTarget[] = [
  {
    indicator: 'PT Mode Share (journey to work)',
    unit: '%',
    inner: 40,
    middle: 25,
    outer: 15,
    regional: 12,
    direction: 'higher_better',
    source: 'Connecting NSW / TfNSW Benchmarks',
  },
  {
    indicator: 'Car Driver Mode Share',
    unit: '%',
    inner: 30,
    middle: 45,
    outer: 60,
    regional: 62,
    direction: 'lower_better',
    source: 'Connecting NSW / TfNSW Benchmarks',
  },
  {
    indicator: 'Active Transport Mode Share',
    unit: '%',
    inner: 12,
    middle: 6,
    outer: 3,
    regional: 4,
    direction: 'higher_better',
    source: 'NSW Active Transport Strategy',
  },
  {
    indicator: 'Average Commute Time (one way)',
    unit: 'min',
    inner: 28,
    middle: 34,
    outer: 40,
    regional: 35,
    direction: 'lower_better',
    source: 'Connecting NSW 30-minute city concept',
  },
];

// ─── Evidence Availability Items ─────────────────────────────────────────────

interface EvidenceItem {
  category: string;
  item: string;
  statusKey: 'available' | 'partial' | 'unavailable';
  note: string;
  source: string;
}

const EVIDENCE_ITEMS: EvidenceItem[] = [
  {
    category: 'Demand & Population',
    item: 'Base year population (ABS Census)',
    statusKey: 'available',
    note: 'ABS 2021 Census data available',
    source: 'ABS Census 2021',
  },
  {
    category: 'Demand & Population',
    item: 'Population projections 2021–2041',
    statusKey: 'available',
    note: 'NSW DPE / TfNSW TZP24 projections available',
    source: 'NSW DPE; TfNSW TZP24',
  },
  {
    category: 'Demand & Population',
    item: 'Employment forecasts 2021–2041',
    statusKey: 'available',
    note: 'TfNSW TZP24 employment projections available',
    source: 'TfNSW TZP24',
  },
  {
    category: 'Transport Performance',
    item: 'Journey-to-work mode shares (census years)',
    statusKey: 'available',
    note: 'ABS Census data for 2011, 2016, 2021',
    source: 'ABS Census',
  },
  {
    category: 'Transport Performance',
    item: 'TfNSW mode share & patronage trends',
    statusKey: 'partial',
    note: 'TfNSW static data available for some LGAs; live API not connected',
    source: 'TfNSW static data',
  },
  {
    category: 'Transport Performance',
    item: 'Journey time reliability (on-time running)',
    statusKey: 'unavailable',
    note: 'Requires TfNSW operational data — not available via public API',
    source: 'TfNSW Operations (manual request)',
  },
  {
    category: 'Transport Performance',
    item: 'Crowding levels (peak load factors)',
    statusKey: 'unavailable',
    note: 'Requires TfNSW patronage counts — not publicly available',
    source: 'TfNSW Patronage Data (manual request)',
  },
  {
    category: 'Infrastructure Condition',
    item: 'Asset condition ratings',
    statusKey: 'unavailable',
    note: 'Held in TfNSW / Transport Asset Holding Entity registers',
    source: 'TAHE / TfNSW Asset Management Systems',
  },
  {
    category: 'Safety',
    item: 'Crash data by severity and location',
    statusKey: 'partial',
    note: 'Available via NSW Centre for Road Safety (manual extraction; not integrated)',
    source: 'TfNSW / NSW Centre for Road Safety',
  },
  {
    category: 'Economic Cost',
    item: 'Delay costs (congestion cost by link/period)',
    statusKey: 'unavailable',
    note: 'Requires traffic count data and TfNSW Economic Parameter Values to monetise',
    source: 'TfNSW TPG economic parameters + VKT data',
  },
  {
    category: 'Economic Cost',
    item: 'TfNSW Economic Parameter Values (value of time, VOC, crash costs)',
    statusKey: 'available',
    note: 'Published by TfNSW; available in Economic Appraisal module (when added)',
    source: 'TfNSW Economic Parameters 2023',
  },
];

// ─── Helper to infer urban type from area name / profile ─────────────────────

function inferUrbanType(areaId: string): UrbanType {
  const innerAreas = ['lga_sydney', 'lga_north_sydney', 'lga_woollahra', 'lga_waverley', 'lga_inner_west', 'lga_randwick', 'sa2_sydney_cbd', 'sa2_surry_hills', 'sa2_newtown'];
  const outerAreas = ['lga_penrith', 'lga_campbelltown', 'lga_camden', 'lga_wollondilly', 'lga_hawkesbury', 'lga_blue_mountains', 'lga_blacktown', 'lga_hills', 'lga_liverpool', 'lga_fairfield'];
  const regionalAreas = ['lga_central_coast', 'lga_newcastle', 'lga_lake_macquarie', 'lga_wollongong', 'lga_shellharbour', 'lga_maitland', 'lga_cessnock'];
  if (innerAreas.includes(areaId)) return 'inner';
  if (outerAreas.includes(areaId)) return 'outer';
  if (regionalAreas.includes(areaId)) return 'regional';
  return 'middle';
}

// ─── Status badge helper ──────────────────────────────────────────────────────

function EvidenceBadge({ status }: { status: 'available' | 'partial' | 'unavailable' }) {
  if (status === 'available') {
    return (
      <span className="flex items-center gap-1 text-emerald-700">
        <CheckCircle2 className="w-4 h-4" />
        <span className="text-xs font-medium">Available</span>
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span className="flex items-center gap-1 text-amber-600">
        <AlertTriangle className="w-4 h-4" />
        <span className="text-xs font-medium">Partial</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-red-500">
      <XCircle className="w-4 h-4" />
      <span className="text-xs font-medium">Not available</span>
    </span>
  );
}

// ─── Gap status helper ────────────────────────────────────────────────────────

function gapStatus(current: number, target: number, direction: 'higher_better' | 'lower_better') {
  const gap = direction === 'higher_better' ? current - target : target - current;
  if (gap >= 0) return { label: 'Meets target', color: 'text-emerald-700 bg-emerald-50', gap };
  if (gap >= -5) return { label: 'Near target', color: 'text-amber-700 bg-amber-50', gap };
  return { label: 'Below target', color: 'text-red-700 bg-red-50', gap };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProblemDefinitionPage() {
  const { selectedArea, selectedYear } = useAppStore();

  const area = selectedArea ?? { id: 'lga_sydney', name: 'City of Sydney', type: 'lga' as const };
  const areaId = area.id;
  const year = selectedYear;
  const urbanType = inferUrbanType(areaId);

  const {
    transport: { data: transportData, meta: transportMeta },
    growth: { data: growthData },
  } = useLiveData(areaId, year);

  // ── Derived transport metrics ──────────────────────────────────────────────
  const carModeShare = transportData.journeyToWork
    .filter((m: { name: string; value: number }) => m.name.startsWith('Car (driver'))
    .reduce((sum: number, m: { name: string; value: number }) => sum + m.value, 0);

  const ptModeShare = transportData.journeyToWork
    .filter((m: { name: string; value: number }) => ['Train', 'Bus', 'Ferry'].includes(m.name))
    .reduce((sum: number, m: { name: string; value: number }) => sum + m.value, 0);

  const activeModeShare = transportData.journeyToWork
    .filter((m: { name: string; value: number }) => ['Cycling', 'Walking'].includes(m.name))
    .reduce((sum: number, m: { name: string; value: number }) => sum + m.value, 0);

  // ── Population-based demand forecast ──────────────────────────────────────
  const pop2021 =
    growthData.populationHistory.find((d: { year: number; population: number }) => d.year === 2021)?.population ??
    growthData.populationHistory[growthData.populationHistory.length - 1]?.population ?? 0;

  const pop2041 =
    growthData.populationProjections.find((d: { year: number; population: number }) => d.year === 2041)?.population ?? 0;

  const popGrowthPct = pop2021 > 0 ? Math.round(((pop2041 - pop2021) / pop2021) * 1000) / 10 : 0;

  // ── Demand scenarios ─────────────────────────────────────────────────────
  const DAILY_TRIPS_PER_PERSON = 1.8; // average, source: TfNSW
  const allPop = [...growthData.populationHistory, ...growthData.populationProjections];
  const demandScenarioData = allPop.map((d: { year: number; population: number }) => ({
    year: d.year,
    'Constant mode share': Math.round(d.population * DAILY_TRIPS_PER_PERSON * (ptModeShare / 100)),
    '+5pp PT mode shift': Math.round(d.population * DAILY_TRIPS_PER_PERSON * ((ptModeShare + 5) / 100)),
    '+10pp PT mode shift': Math.round(d.population * DAILY_TRIPS_PER_PERSON * ((ptModeShare + 10) / 100)),
  }));

  // ── Mode share trend ───────────────────────────────────────────────────────
  const modeShareTrendData = transportData.modeShareTrend.map(
    (d: { year: number; car: number; train: number; bus: number; active: number; wfh: number }) => ({
      year: d.year,
      'Car (driver)': d.car,
      Train: d.train,
      Bus: d.bus,
      'Active transport': d.active,
      'Work from home': d.wfh,
    })
  );

  // ── Service level gap ─────────────────────────────────────────────────────
  const currentValues: Record<string, number> = {
    'PT Mode Share (journey to work)': ptModeShare,
    'Car Driver Mode Share': carModeShare,
    'Active Transport Mode Share': activeModeShare,
    'Average Commute Time (one way)': transportData.avgCommute,
  };

  // ── Journey to work snapshot sorted descending ─────────────────────────────
  const jtw2021 = [...transportData.journeyToWork]
    .filter((m: { name: string; value: number }) => m.value > 0.5)
    .sort((a: { name: string; value: number }, b: { name: string; value: number }) => b.value - a.value);

  // ── Stacked mode share by census year ─────────────────────────────────────
  const stackedModeData = transportData.modeShareTrend.map(
    (d: { year: number; car: number; train: number; bus: number; active: number; wfh: number }) => ({
      name: String(d.year),
      'Car (driver)': Math.round(d.car * 10) / 10,
      'Train': Math.round(d.train * 10) / 10,
      'Bus': Math.round(d.bus * 10) / 10,
      'Active': Math.round(d.active * 10) / 10,
      'WFH': Math.round(d.wfh * 10) / 10,
    })
  );

  // ── Current vs target gap bar chart ───────────────────────────────────────
  const losGapChartData = LOS_TARGETS.map((t) => {
    const current = currentValues[t.indicator] ?? 0;
    const target = t[urbanType];
    return {
      name: t.indicator.replace(' (journey to work)', '').replace(' (one way)', ''),
      Current: Math.round(current * 10) / 10,
      Target: target,
    };
  });

  const evidenceCategories = Array.from(new Set(EVIDENCE_ITEMS.map(e => e.category)));
  const availableCount = EVIDENCE_ITEMS.filter(e => e.statusKey === 'available').length;
  const partialCount = EVIDENCE_ITEMS.filter(e => e.statusKey === 'partial').length;
  const unavailableCount = EVIDENCE_ITEMS.filter(e => e.statusKey === 'unavailable').length;

  return (
    <div>
      <Header
        title="Problem Definition & Evidence Base"
        subtitle={`${area.name} — Business Case Evidence Summary`}
      />

      <div className="p-6 space-y-6">
        <DataSourceBadge meta={transportMeta} />

        {/* ── Stat Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Car}
            label="Car Driver Mode Share"
            value={`${carModeShare.toFixed(1)}%`}
            subtitle="Journey to work (2021)"
          />
          <StatCard
            icon={Train}
            label="PT Mode Share"
            value={`${ptModeShare.toFixed(1)}%`}
            subtitle="Train + bus + ferry (2021)"
          />
          <StatCard
            icon={Clock}
            label="Avg Commute Time"
            value={`${transportData.avgCommute} min`}
            subtitle="One-way (indicative)"
          />
          <StatCard
            icon={TrendingUp}
            label="Population Growth 2021–2041"
            value={`+${popGrowthPct}%`}
            subtitle={`${formatNumber(pop2021)} → ${formatNumber(pop2041)}`}
          />
        </div>

        {/* ── Journey to Work Snapshot ─────────────────────────────────── */}
        <ChartWrapper
          title="Journey to Work — Mode Share Snapshot (2021)"
          subtitle={`${area.name} — ABS Census 2021`}
          data={jtw2021}
          dataKeys={['value']}
        >
          <p className="text-sm text-gray-500 mb-4">
            This chart establishes the 2021 base year mode share — the starting point for all demand
            forecasts, benefit estimates, and problem quantification in the business case. High car
            dependency or underrepresentation of PT and active modes indicate a structural service gap.
          </p>
          <NeedsBarChart
            data={jtw2021}
            dataKeys={['value']}
            colors={CHART_COLORS}
            layout="vertical"
            xAxisLabel="Mode Share (%)"
            height={300}
          />
        </ChartWrapper>

        {/* ── Mode Share Trend + Stacked ───────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartWrapper
            title="Mode Share Trend (2011–2021)"
            subtitle="ABS Census journey-to-work by mode"
            data={modeShareTrendData}
            dataKeys={['Car (driver)', 'Train', 'Bus', 'Active transport', 'Work from home']}
            xAxisKey="year"
          >
            <p className="text-sm text-gray-500 mb-4">
              Tracking mode share across three census years reveals whether the transport network is
              shifting toward or away from sustainable modes. A widening gap between car and PT lines
              indicates structural dependence on private vehicles — a primary problem indicator.
            </p>
            <NeedsLineChart
              data={modeShareTrendData}
              dataKeys={['Car (driver)', 'Train', 'Bus', 'Active transport', 'Work from home']}
              xAxisKey="year"
              colors={[CHART_COLORS[0], CHART_COLORS[2], CHART_COLORS[1], CHART_COLORS[3], CHART_COLORS[4]]}
              yAxisLabel="Mode Share (%)"
              height={280}
            />
          </ChartWrapper>

          <ChartWrapper
            title="Stacked Mode Composition by Census Year"
            subtitle="100% composition view — shift in transport mix over time"
            data={stackedModeData}
            dataKeys={['Car (driver)', 'Train', 'Bus', 'Active', 'WFH']}
          >
            <p className="text-sm text-gray-500 mb-4">
              The stacked view shows the relative composition of all modes together, making it easier
              to see whether active transport and PT are growing their share of total trips or being
              displaced. This presentation is commonly used in ATAP Strategic Merit Test chapters.
            </p>
            <StackedBar
              data={stackedModeData}
              dataKeys={['Car (driver)', 'Train', 'Bus', 'Active', 'WFH']}
              colors={[CHART_COLORS[0], CHART_COLORS[2], CHART_COLORS[1], CHART_COLORS[3], CHART_COLORS[4]]}
              layout="horizontal"
              yAxisLabel="Mode Share (%)"
              height={280}
            />
          </ChartWrapper>
        </div>

        {/* ── Vehicle Ownership + Current vs Target ───────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartWrapper
            title="Vehicle Ownership Distribution"
            subtitle="Share of households by number of registered vehicles — ABS Census 2021"
            data={transportData.vehicleOwnership}
            dataKeys={['value']}
          >
            <p className="text-sm text-gray-500 mb-4">
              Vehicle ownership is a structural indicator of car dependence and a leading predictor of
              future congestion and PT uptake. A high proportion of 2+ vehicle households in the absence
              of quality PT alternatives supports the case for investment.
            </p>
            <NeedsBarChart
              data={transportData.vehicleOwnership}
              dataKeys={['value']}
              colors={[CHART_COLORS[0], CHART_COLORS[2], CHART_COLORS[1], CHART_COLORS[3]]}
              layout="vertical"
              xAxisLabel="Share of Households (%)"
              height={260}
            />
          </ChartWrapper>

          <ChartWrapper
            title="Current vs Target — Level of Service"
            subtitle={`${area.name} vs. Connecting NSW / TfNSW standards for ${urbanType} area type`}
            data={losGapChartData}
            dataKeys={['Current', 'Target']}
          >
            <p className="text-sm text-gray-500 mb-4">
              Comparing current performance against mode-appropriate service level benchmarks quantifies
              the size of the gap that justifies intervention. Bars that fall short of their target
              provide direct evidence of a service deficiency for business case writers.
            </p>
            <NeedsBarChart
              data={losGapChartData}
              dataKeys={['Current', 'Target']}
              colors={[CHART_COLORS[0], CHART_COLORS[3]]}
              layout="horizontal"
              yAxisLabel="Value"
              height={260}
            />
          </ChartWrapper>
        </div>

        {/* ── PT Demand Scenarios ──────────────────────────────────────── */}
        <ChartWrapper
          title="Implied PT Demand — Projection Scenarios (2011–2041)"
          subtitle="Estimated daily PT trips under three mode share assumptions (NSW DPE population base)"
          data={demandScenarioData}
          dataKeys={['Constant mode share', '+5pp PT mode shift', '+10pp PT mode shift']}
          xAxisKey="year"
        >
          <p className="text-sm text-gray-500 mb-4">
            This chart models future PT trip demand by applying different mode share assumptions to
            population projections. The constant mode share scenario shows demand growth from population
            growth alone; the +5pp and +10pp scenarios show the amplified effect of mode shift investment.
            ATAP requires sensitivity testing across scenarios where patronage drives the benefit estimate.
          </p>
          <NeedsLineChart
            data={demandScenarioData}
            dataKeys={['Constant mode share', '+5pp PT mode shift', '+10pp PT mode shift']}
            xAxisKey="year"
            colors={[CHART_COLORS[0], CHART_COLORS[2], CHART_COLORS[1]]}
            yAxisLabel="PT trips / day (estimated)"
            height={320}
          />
          <p className="text-xs text-gray-400 mt-3 px-1">
            Assumes {DAILY_TRIPS_PER_PERSON} daily trips per person. Base: {formatNumber(pop2021)} persons (2021), {ptModeShare.toFixed(1)}% PT mode share.
            Projected to {formatNumber(pop2041)} persons (2041). This is an indicative demand model for problem definition purposes — a
            formal patronage model (STM or equivalent) is required for the full business case CBA.
          </p>
        </ChartWrapper>

        {/* ── Service Level Gap Detail ─────────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-1">Service Level Gap Assessment — Detail</h3>
          <p className="text-sm text-gray-500 mb-4">
            A quantified gap between current performance and the desired level of service is a mandatory
            element of the ATAP problem definition. Each indicator is assessed against benchmarks for
            a <span className="font-medium capitalize">{urbanType}</span> area type, drawn from Connecting NSW targets and TfNSW service standards.
          </p>
          <div className="space-y-3">
            {LOS_TARGETS.map((t) => {
              const current = currentValues[t.indicator] ?? null;
              const target = t[urbanType];
              const status = current !== null ? gapStatus(current, target, t.direction) : null;
              const pct = current !== null ? Math.min(100, Math.max(0, t.direction === 'higher_better' ? (current / target) * 100 : (target / current) * 100)) : 0;
              return (
                <div key={t.indicator} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 leading-tight">{t.indicator}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{t.source}</p>
                    </div>
                    {status && (
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${status.color}`}>
                        {status.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm mb-3">
                    <div><span className="text-gray-500 text-xs">Current</span><div className="font-semibold text-gray-900">{current !== null ? `${current.toFixed(1)}${t.unit}` : '—'}</div></div>
                    <div><span className="text-gray-500 text-xs">Target</span><div className="font-semibold text-gray-700">{t.direction === 'higher_better' ? '≥' : '≤'} {target}{t.unit}</div></div>
                    {status && <div><span className="text-gray-500 text-xs">Gap</span><div className={`font-semibold ${status.gap >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{status.gap > 0 ? '+' : ''}{status.gap.toFixed(1)}{t.unit}</div></div>}
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${status && status.gap >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Evidence Availability Matrix ──────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-5 h-5 text-primary-600" />
            <h3 className="text-base font-semibold text-gray-900">Evidence Availability Matrix</h3>
          </div>
          <p className="text-sm text-gray-500 mb-2">
            A comprehensive problem definition requires evidence across demand, performance, condition, safety, and
            economic cost dimensions (VAGO 2023 / ATAP Guidance). The matrix identifies what this
            dashboard provides, what is partially available, and what must be sourced separately before submission.
          </p>
          <div className="flex flex-wrap gap-3 mb-5 mt-3">
            <span className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> {availableCount} available
            </span>
            <span className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full font-medium">
              <AlertTriangle className="w-3.5 h-3.5" /> {partialCount} partial
            </span>
            <span className="flex items-center gap-1.5 text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-full font-medium">
              <XCircle className="w-3.5 h-3.5" /> {unavailableCount} not available — must be sourced separately
            </span>
          </div>

          <div className="space-y-6">
            {evidenceCategories.map((cat) => (
              <div key={cat}>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{cat}</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left font-medium text-gray-600 pb-2 pr-4 w-1/2">Data item</th>
                        <th className="text-left font-medium text-gray-600 pb-2 pr-4 w-1/6">Status</th>
                        <th className="text-left font-medium text-gray-600 pb-2 pr-4">Note</th>
                        <th className="text-left font-medium text-gray-600 pb-2">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {EVIDENCE_ITEMS.filter((e) => e.category === cat).map((item) => (
                        <tr key={item.item} className="hover:bg-gray-50">
                          <td className="py-2 pr-4 text-gray-800 font-medium">{item.item}</td>
                          <td className="py-2 pr-4">
                            <EvidenceBadge status={item.statusKey} />
                          </td>
                          <td className="py-2 pr-4 text-gray-500 text-xs">{item.note}</td>
                          <td className="py-2 text-gray-400 text-xs">{item.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Available in this dashboard
            </span>
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Partially available — manual steps required
            </span>
            <span className="flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-red-400" /> Not available — must be sourced separately
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
