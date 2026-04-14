'use client';

import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsLineChart from '@/components/charts/LineChart';
import NeedsBarChart from '@/components/charts/BarChart';
import StackedBar from '@/components/charts/StackedBar';
import { FindingCallout } from '@/components/ui/FindingCallout';
import { NarrativeProblemStatement } from '@/components/ui/NarrativeProblemStatement';
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
  Users,
  ArrowRight,
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

const BASE_EVIDENCE_ITEMS: EvidenceItem[] = [
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
    note: 'ABS trend series available in-app; official TfNSW patronage source will be detected dynamically',
    source: 'ABS Census + TfNSW Open Data',
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
    note: 'Official NSW crash workbook connection is assessed dynamically per area',
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

function buildEvidenceItems(hasPatronageSource: boolean, hasCrashTrend: boolean): EvidenceItem[] {
  return BASE_EVIDENCE_ITEMS.map((item) => {
    if (item.item === 'TfNSW mode share & patronage trends') {
      return hasPatronageSource
        ? {
            ...item,
            statusKey: 'available' as const,
            note: 'ABS mode-share trends are available in-app and the official TfNSW patronage visualisation is connected',
            source: 'ABS Census + TfNSW Open Data',
          }
        : {
            ...item,
            statusKey: 'partial' as const,
            note: 'ABS mode-share trends are available, but TfNSW exposes patronage primarily through visualisation feeds rather than a structured API',
            source: 'ABS Census + TfNSW Open Data',
          };
    }

    if (item.item === 'Crash data by severity and location') {
      return hasCrashTrend
        ? {
            ...item,
            statusKey: 'available' as const,
            note: 'Official NSW Crash Data workbook is integrated and aggregated by year for this LGA',
            source: 'TfNSW / NSW Centre for Road Safety',
          }
        : {
            ...item,
            statusKey: 'partial' as const,
            note: 'Official crash workbook exists, but no records were matched to this selected area yet',
            source: 'TfNSW / NSW Centre for Road Safety',
          };
    }

    return item;
  });
}

// ─── Helper to infer urban type from area name / profile ─────────────────────

const INNER_AREAS  = new Set(['lga_sydney', 'lga_north_sydney', 'lga_woollahra', 'lga_waverley', 'lga_inner_west', 'lga_randwick', 'lga_mosman', 'lga_lane_cove', 'lga_willoughby', 'lga_hunters_hill', 'sa2_sydney_cbd', 'sa2_surry_hills', 'sa2_newtown']);
const OUTER_AREAS  = new Set(['lga_penrith', 'lga_campbelltown', 'lga_camden', 'lga_wollondilly', 'lga_hawkesbury', 'lga_blue_mountains', 'lga_blacktown', 'lga_hills', 'lga_liverpool', 'lga_fairfield']);
const MIDDLE_AREAS = new Set(['lga_parramatta', 'lga_ryde', 'lga_ku_ring_gai', 'lga_northern_beaches', 'lga_hornsby', 'lga_sutherland', 'lga_bayside', 'lga_georges_river', 'lga_cumberland', 'lga_strathfield', 'lga_burwood', 'lga_canada_bay', 'lga_bankstown', 'lga_canterbury_bankstown']);
const REGIONAL_AREAS = new Set(['lga_central_coast', 'lga_newcastle', 'lga_lake_macquarie', 'lga_wollongong', 'lga_shellharbour', 'lga_kiama', 'lga_shoalhaven', 'lga_maitland', 'lga_cessnock', 'lga_port_stephens', 'lga_singleton', 'lga_tamworth', 'lga_wagga_wagga', 'lga_albury', 'lga_dubbo', 'lga_orange', 'lga_bathurst', 'lga_armidale', 'lga_coffs_harbour', 'lga_tweed', 'lga_lismore', 'lga_port_macquarie_hastings']);

function inferUrbanType(areaId: string): { type: UrbanType; inferred: boolean } {
  if (INNER_AREAS.has(areaId))    return { type: 'inner',    inferred: false };
  if (OUTER_AREAS.has(areaId))    return { type: 'outer',    inferred: false };
  if (MIDDLE_AREAS.has(areaId))   return { type: 'middle',   inferred: false };
  if (REGIONAL_AREAS.has(areaId)) return { type: 'regional', inferred: false };
  return { type: 'middle', inferred: true }; // defaulted — not explicitly classified
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

function getTargetByIndicatorPrefix(prefix: string): LevelOfServiceTarget | null {
  const target = LOS_TARGETS.find((item) => item.indicator.startsWith(prefix));
  if (!target) {
    console.error(`Missing level-of-service target for indicator prefix "${prefix}"`);
    return null;
  }
  return target;
}

// ─── Section Heading ─────────────────────────────────────────────────────────

function SectionHeading({ number, title, subtitle }: { number: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 pt-2">
      <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
        {number}
      </span>
      <div>
        <h2 className="text-base font-bold text-gray-900 leading-tight">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProblemDefinitionPage() {
  const { selectedArea, selectedYear } = useAppStore();

  const area = selectedArea ?? { id: 'lga_sydney', name: 'City of Sydney', type: 'lga' as const };
  const areaId = area.id;
  const year = selectedYear;
  const { type: urbanType, inferred: urbanTypeInferred } = inferUrbanType(areaId);

  const {
    transport: { data: transportData, meta: transportMeta },
    growth: { data: growthData },
    isLoading,
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
    ...(transportData.avgCommute !== null ? { 'Average Commute Time (one way)': transportData.avgCommute } : {}),
  };

  const evidenceItems = buildEvidenceItems(
    Boolean(transportData.patronageSource),
    Boolean((transportData.crashTrend ?? []).length)
  );

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
  const losGapChartData = LOS_TARGETS
    .map((t) => {
      const current = currentValues[t.indicator];
      if (current === undefined) return null;
      const target = t[urbanType];
      return {
        name: t.indicator.replace(' (journey to work)', '').replace(' (one way)', ''),
        Current: Math.round(current * 10) / 10,
        Target: target,
      };
    })
    .filter(Boolean) as Array<{ name: string; Current: number; Target: number }>;

  const ptModeShareTarget = getTargetByIndicatorPrefix('PT Mode Share');
  const carDriverTarget = getTargetByIndicatorPrefix('Car Driver');
  const activeTransportTarget = getTargetByIndicatorPrefix('Active');

  const evidenceCategories = Array.from(new Set(evidenceItems.map(e => e.category)));
  const availableCount = evidenceItems.filter(e => e.statusKey === 'available').length;
  const partialCount = evidenceItems.filter(e => e.statusKey === 'partial').length;
  const unavailableCount = evidenceItems.filter(e => e.statusKey === 'unavailable').length;

  // ── Worst service gap for callout ──────────────────────────────────────────
  const worstGap = LOS_TARGETS.reduce<{ label: string; gap: number; unit: string } | null>((worst, t) => {
    const current = currentValues[t.indicator] ?? null;
    if (current === null) return worst;
    const target = t[urbanType];
    const status = gapStatus(current, target, t.direction);
    if (status.gap < 0 && (worst === null || status.gap < worst.gap)) {
      return { label: t.indicator, gap: status.gap, unit: t.unit };
    }
    return worst;
  }, null);

  const carTrendChange = modeShareTrendData.length >= 2
    ? (modeShareTrendData[modeShareTrendData.length - 1]['Car (driver)'] as number) -
      (modeShareTrendData[0]['Car (driver)'] as number)
    : null;

  const ptTrendChange = modeShareTrendData.length >= 2
    ? (modeShareTrendData[modeShareTrendData.length - 1]['Train'] as number) +
      (modeShareTrendData[modeShareTrendData.length - 1]['Bus'] as number) -
      ((modeShareTrendData[0]['Train'] as number) + (modeShareTrendData[0]['Bus'] as number))
    : null;

  const trendStartYear = modeShareTrendData.length >= 2 ? modeShareTrendData[0].year : null;
  const trendEndYear   = modeShareTrendData.length >= 2 ? modeShareTrendData[modeShareTrendData.length - 1].year : null;

  const maxDailyDemand2041 = demandScenarioData.find(d => d.year === 2041)?.['+10pp PT mode shift'] as number | undefined;

  return (
    <div>
      <Header
        title="Problem Definition & Evidence Base"
        subtitle={`${area.name} — Business Case Evidence Summary`}
      />

      <div className="p-6 space-y-8">
        <DataSourceBadge meta={transportMeta} isLoading={isLoading} />

        {/* Urban type classification notice */}
        {urbanTypeInferred && (
          <FindingCallout severity="info" heading={`Urban type defaulted to "middle" for ${area.name}`}>
            This area has not been explicitly classified as inner / middle / outer / regional. Benchmark
            targets are using <strong>middle-area</strong> standards — verify this is appropriate and add{' '}
            {area.id} to the relevant classification set in <code>inferUrbanType()</code>.
          </FindingCallout>
        )}

        {/* ══ Auto-generated Problem Statement ══════════════════════════════ */}
        <NarrativeProblemStatement
          areaName={area.name}
          urbanType={urbanType}
          carModeShare={carModeShare}
          ptModeShare={ptModeShare}
          activeModeShare={activeModeShare}
          avgCommute={transportData.avgCommute}
          pop2021={pop2021}
          pop2041={pop2041}
          popGrowthPct={popGrowthPct}
          ptTarget={ptModeShareTarget?.[urbanType] ?? 0}
          carTarget={carDriverTarget?.[urbanType] ?? 0}
        />

        {/* ══ Section 1 — The Context ═══════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionHeading
            number="1"
            title="The Context"
            subtitle="Population and growth setting for the transport problem"
          />
          <p className="text-sm text-gray-600 leading-relaxed">
            Understanding the scale and trajectory of population and employment growth is the
            foundation of any problem definition. A growing population increases pressure on existing
            transport infrastructure, and without proactive investment, service levels deteriorate
            relative to demand. The figures below set the context for the need assessment.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Users}
              label="Population (2021)"
              value={formatNumber(pop2021)}
              subtitle="ABS Census / ERP base year"
            />
            <StatCard
              icon={TrendingUp}
              label="Projected Population (2041)"
              value={pop2041 > 0 ? formatNumber(pop2041) : '—'}
              subtitle="NSW DPE projection"
            />
            <StatCard
              icon={TrendingUp}
              label="Population Growth 2021–2041"
              value={pop2041 > 0 ? `+${popGrowthPct.toFixed(1)}%` : '—'}
              subtitle={pop2041 > 0 ? `+${formatNumber(pop2041 - pop2021)} residents` : 'No projection data'}
            />
            <StatCard
              icon={Clock}
              label="Avg One-Way Commute"
              value={transportData.avgCommute !== null ? `${transportData.avgCommute} min` : 'N/A'}
              subtitle={transportData.avgCommute !== null ? 'Official source loaded' : 'No official commute-time source integrated'}
            />
          </div>
          {pop2041 > 0 && popGrowthPct > 15 && (
            <FindingCallout severity="warning" heading="Significant population growth projected">
              {area.name} is projected to add {formatNumber(pop2041 - pop2021)} residents by 2041 — a{' '}
              {popGrowthPct.toFixed(1)}% increase. Without commensurate transport investment, per-capita
              service levels will decline and car dependency is likely to increase.
            </FindingCallout>
          )}
          {pop2041 > 0 && popGrowthPct <= 15 && popGrowthPct > 0 && (
            <FindingCallout severity="info" heading="Moderate population growth projected">
              {area.name} is projected to grow by {popGrowthPct.toFixed(1)}% to {formatNumber(pop2041)} residents by
              2041. Transport network capacity should be reviewed to ensure service quality is maintained.
            </FindingCallout>
          )}
        </section>

        {/* ══ Section 2 — The Problem ═══════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionHeading
            number="2"
            title="The Problem"
            subtitle="Current mode share, trends, and structural transport dependency"
          />
          <p className="text-sm text-gray-600 leading-relaxed">
            The core transport problem is defined by the current distribution of journey-to-work mode
            share and how it has changed over time. High car dependency — particularly in areas with
            growing populations — signals an undersupply of viable public transport and active travel
            options. The charts below establish the baseline and reveal directional trends since 2011.
          </p>

          {/* Key mode share stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              icon={Car}
              label="Car Driver Mode Share"
              value={`${carModeShare.toFixed(1)}%`}
              subtitle={carDriverTarget
                ? `Target ≤ ${carDriverTarget[urbanType]}% for ${urbanType} areas`
                : `Target unavailable for ${urbanType} areas`}
            />
            <StatCard
              icon={Train}
              label="PT Mode Share"
              value={`${ptModeShare.toFixed(1)}%`}
              subtitle={ptModeShareTarget
                ? `Target ≥ ${ptModeShareTarget[urbanType]}% for ${urbanType} areas`
                : `Target unavailable for ${urbanType} areas`}
            />
            <StatCard
              icon={Activity}
              label="Active Transport Share"
              value={`${activeModeShare.toFixed(1)}%`}
              subtitle={activeTransportTarget
                ? `Target ≥ ${activeTransportTarget[urbanType]}% for ${urbanType} areas`
                : `Target unavailable for ${urbanType} areas`}
            />
          </div>

          {/* JTW snapshot */}
          <ChartWrapper
            title="Journey to Work — Mode Share Snapshot (2021)"
            subtitle={`${area.name} — ABS Census 2021`}
            data={jtw2021}
            dataKeys={['value']}
          >
            <NeedsBarChart
              data={jtw2021}
              dataKeys={['value']}
              colors={CHART_COLORS}
              layout="vertical"
              xAxisLabel="Mode Share (%)"
              height={300}
            />
          </ChartWrapper>

          {/* Trend callout — only shown when ≥2 census years of data exist */}
          {carTrendChange === null && (
            <FindingCallout severity="info" heading="Trend data covers one census year only">
              Mode share trend analysis requires at least two census years of data. Only 2021 data is
              available for {area.name}. Historical census data for 2011 and 2016 may not yet be loaded for this area.
            </FindingCallout>
          )}
          {carTrendChange !== null && carTrendChange > 2 && (
            <FindingCallout severity="critical" heading="Car dependency is increasing over time">
              Car driver mode share has increased by {carTrendChange.toFixed(1)} percentage points between{' '}
              {trendStartYear} and {trendEndYear}. This indicates the transport network has not kept pace
              with growth and that structural car dependency is deepening — strengthening the case for
              intervention.
            </FindingCallout>
          )}
          {carTrendChange !== null && carTrendChange <= 2 && carTrendChange >= -2 && (
            <FindingCallout severity="info" heading="Car mode share has remained broadly stable">
              Car driver mode share has changed by {Math.abs(carTrendChange).toFixed(1)} percentage points
              between {trendStartYear} and {trendEndYear}. Stability at a high car share still represents
              an unmet need — the challenge is shifting existing car trips, not just accommodating new ones.
            </FindingCallout>
          )}
          {carTrendChange !== null && carTrendChange < -2 && (
            <FindingCallout severity="success" heading="Car mode share is declining">
              Car driver mode share has fallen by {Math.abs(carTrendChange).toFixed(1)} percentage points
              since {trendStartYear}
              {ptTrendChange !== null && ptTrendChange > 0 ? `, with PT share growing by ${ptTrendChange.toFixed(1)}pp` : ''}.
              This trend should be sustained and accelerated through continued investment.
            </FindingCallout>
          )}

          {/* Mode trend + stacked */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartWrapper
              title={`Mode Share Trend (${trendStartYear ?? '—'}–${trendEndYear ?? '—'})`}
              subtitle={`ABS Census journey-to-work by mode${modeShareTrendData.length < 2 ? ' — insufficient data for trend' : ''}`}
              data={modeShareTrendData}
              dataKeys={['Car (driver)', 'Train', 'Bus', 'Active transport', 'Work from home']}
              xAxisKey="year"
            >
              <p className="text-xs text-gray-500 mb-3">
                Tracking across three census years reveals whether the network is shifting toward
                or away from sustainable modes. A widening gap between car and PT lines is a primary
                problem indicator for an ATAP Strategic Merit Test.
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
              title="Mode Composition by Census Year"
              subtitle="100% stacked view — shift in transport mix over time"
              data={stackedModeData}
              dataKeys={['Car (driver)', 'Train', 'Bus', 'Active', 'WFH']}
            >
              <p className="text-xs text-gray-500 mb-3">
                The stacked composition view makes it easy to see whether PT and active modes are
                growing their share of total trips. Used in ATAP Strategic Merit Test chapters to
                demonstrate directional change in the transport task.
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
        </section>

        {/* ══ Section 3 — The Evidence ══════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionHeading
            number="3"
            title="The Evidence"
            subtitle="Service level gap assessment against Connecting NSW benchmarks"
          />
          <p className="text-sm text-gray-600 leading-relaxed">
            A quantified service level gap is a mandatory element of a well-formed ATAP problem
            definition. The analysis below compares current transport performance against published
            benchmarks for a{' '}
            <span className="font-semibold capitalize">{urbanType}</span> area type, using Connecting NSW
            targets and TfNSW service standards. Vehicle ownership data provides a structural
            indicator of car dependency and the scale of behaviour change required.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartWrapper
              title="Vehicle Ownership Distribution"
              subtitle="Households by number of registered vehicles — ABS Census 2021"
              data={transportData.vehicleOwnership}
              dataKeys={['value']}
            >
              <p className="text-xs text-gray-500 mb-3">
                A high proportion of 2+ vehicle households in the absence of quality PT alternatives
                is both a symptom of structural car dependency and evidence of suppressed demand for
                better services. This supports the case for investment.
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
              subtitle={`${area.name} vs. Connecting NSW / TfNSW standards (${urbanType} area type)`}
              data={losGapChartData}
              dataKeys={['Current', 'Target']}
            >
              <p className="text-xs text-gray-500 mb-3">
                Bars falling short of their target provide direct, quantified evidence of a service
                deficiency. These gaps are the primary inputs for the problem definition chapter of
                any Preliminary or Detailed Business Case.
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

          {/* Service level gap detail */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Service Level Gap Detail</h3>
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

          {worstGap && (
            <FindingCallout severity="critical" heading={`Largest service gap: ${worstGap.label}`}>
              The current deficit of {Math.abs(worstGap.gap).toFixed(1)}{worstGap.unit} against the {urbanType}-area
              benchmark is the most significant quantified gap in this assessment. This indicator should
              feature prominently in the ATAP problem definition and Strategic Merit Test narrative.
            </FindingCallout>
          )}
        </section>

        {/* ══ Section 4 — Future Demand ═════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionHeading
            number="4"
            title="Future Demand"
            subtitle="Population-driven PT demand projections to 2041 under mode share scenarios"
          />
          <p className="text-sm text-gray-600 leading-relaxed">
            Projecting future demand establishes the scale of investment need and demonstrates that
            doing nothing is not a viable option. The model below applies three mode share scenarios
            to NSW DPE population projections to estimate daily PT trip demand to 2041. Under a
            constant mode share, demand grows with population. Under mode shift scenarios — achievable
            through targeted investment — demand grows substantially further, improving the benefit-cost
            case for intervention.
          </p>

          <ChartWrapper
            title="Implied PT Demand — Projection Scenarios (2011–2041)"
            subtitle="Estimated daily PT trips under three mode share assumptions (NSW DPE population base)"
            data={demandScenarioData}
            dataKeys={['Constant mode share', '+5pp PT mode shift', '+10pp PT mode shift']}
            xAxisKey="year"
          >
            <NeedsLineChart
              data={demandScenarioData}
              dataKeys={['Constant mode share', '+5pp PT mode shift', '+10pp PT mode shift']}
              xAxisKey="year"
              colors={[CHART_COLORS[0], CHART_COLORS[2], CHART_COLORS[1]]}
              yAxisLabel="PT trips / day (estimated)"
              height={320}
            />
            <p className="text-xs text-gray-400 mt-3 px-1">
              Assumes {DAILY_TRIPS_PER_PERSON} daily trips per person. Base: {formatNumber(pop2021)} persons
              (2021), {ptModeShare.toFixed(1)}% PT mode share. Projected to {formatNumber(pop2041)} persons
              (2041). This is an indicative demand model for problem definition purposes — a formal
              patronage model (STM or equivalent) is required for a full business case CBA.
            </p>
          </ChartWrapper>

          {maxDailyDemand2041 && pop2021 > 0 && (
            <FindingCallout severity="info" heading="Significant headroom from mode shift investment">
              Under the +10pp PT mode shift scenario, daily PT demand in {area.name} could reach{' '}
              {formatNumber(Math.round(maxDailyDemand2041))} trips per day by 2041 — compared with{' '}
              {formatNumber(Math.round(pop2021 * DAILY_TRIPS_PER_PERSON * (ptModeShare / 100)))} trips under
              current conditions. ATAP requires sensitivity testing across scenarios where patronage
              drives the benefit estimate.
            </FindingCallout>
          )}
        </section>

        {/* ══ Section 5 — Evidence Base ═════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionHeading
            number="5"
            title="Evidence Base"
            subtitle="Availability matrix — what this dashboard provides vs. what must be sourced separately"
          />
          <p className="text-sm text-gray-600 leading-relaxed">
            A complete problem definition requires evidence across five dimensions: demand and
            population, transport performance, infrastructure condition, safety, and economic cost
            (VAGO 2023 / ATAP Guidance Note). The matrix below identifies data availability for
            each required evidence item — helping business case writers prioritise data collection
            efforts before submission.
          </p>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-primary-600" />
              <h3 className="text-sm font-semibold text-gray-900">Evidence Availability Matrix</h3>
              <div className="flex flex-wrap gap-2 ml-auto">
                <span className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
                  <CheckCircle2 className="w-3 h-3" /> {availableCount} available
                </span>
                <span className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full font-medium">
                  <AlertTriangle className="w-3 h-3" /> {partialCount} partial
                </span>
                <span className="flex items-center gap-1.5 text-xs bg-red-50 text-red-600 px-2.5 py-1 rounded-full font-medium">
                  <XCircle className="w-3 h-3" /> {unavailableCount} gaps
                </span>
              </div>
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
                        {evidenceItems.filter((e) => e.category === cat).map((item) => (
                          <tr key={item.item} className="hover:bg-gray-50">
                            <td className="py-2 pr-4 text-gray-800 font-medium">{item.item}</td>
                            <td className="py-2 pr-4"><EvidenceBadge status={item.statusKey} /></td>
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
          </div>
        </section>

        {/* ══ Conclusion / Next Steps ═══════════════════════════════════════ */}
        <section className="space-y-4">
          <SectionHeading
            number="✓"
            title="Conclusion & Next Steps"
            subtitle="Summary of findings and actions required before business case submission"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* What's done */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800">Evidence available</p>
              </div>
              <ul className="space-y-1.5">
                {evidenceItems.filter(e => e.statusKey === 'available').map(e => (
                  <li key={e.item} className="text-xs text-emerald-700 flex items-start gap-1.5">
                    <span className="mt-0.5 flex-shrink-0">·</span>{e.item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Partial / needs work */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-semibold text-amber-800">Partially available</p>
              </div>
              <ul className="space-y-1.5">
                {evidenceItems.filter(e => e.statusKey === 'partial').map(e => (
                  <li key={e.item} className="text-xs text-amber-700 flex items-start gap-1.5">
                    <span className="mt-0.5 flex-shrink-0">·</span>{e.item}
                    <span className="text-amber-500 ml-1">— {e.note}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Gaps / must source */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="w-4 h-4 text-red-500" />
                <p className="text-sm font-semibold text-red-800">Must be sourced separately</p>
              </div>
              <ul className="space-y-1.5">
                {evidenceItems.filter(e => e.statusKey === 'unavailable').map(e => (
                  <li key={e.item} className="text-xs text-red-700 flex items-start gap-1.5">
                    <span className="mt-0.5 flex-shrink-0">·</span>{e.item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recommended next steps */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Recommended next steps</h4>
            <ol className="space-y-2">
              {[
                'Request journey time reliability and crowding data from TfNSW via formal data request.',
                'Obtain asset condition ratings from TAHE / TfNSW Asset Management for infrastructure chapter.',
                'Extract crash data from NSW Centre for Road Safety for the safety problem evidence.',
                'Commission or obtain traffic count data to monetise delay costs using TfNSW Economic Parameter Values.',
                'Engage a transport modeller to validate implied PT demand figures using STM or equivalent.',
                'Use the Strategic Alignment module to map findings against FTS 2056 outcomes and SEIFA distribution.',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
              <ArrowRight className="w-3.5 h-3.5" />
              Continue to <a href="/strategic-alignment" className="text-primary-600 font-medium hover:underline ml-1">Strategic Alignment</a> to map this problem against FTS 2056 outcomes.
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
