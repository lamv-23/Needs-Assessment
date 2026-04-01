'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsLineChart from '@/components/charts/LineChart';
import NeedsBarChart from '@/components/charts/BarChart';
import PieChart from '@/components/charts/PieChart';
import { useAppStore } from '@/store';
import { formatNumber, CHART_COLORS } from '@/lib/utils';
import {
  Users,
  TrendingUp,
  Briefcase,
  Shield,
  CheckCircle2,
  Layers,
  MapPin,
  BookOpen,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Car,
  DollarSign,
  Activity,
} from 'lucide-react';
import { useLiveData } from '@/hooks/useLiveData';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';

// ─── Strategy Hierarchy ───────────────────────────────────────────────────────

interface StrategyItem {
  name: string;
  description: string;
  mandatory: boolean;
  atapPhase?: string;
}

interface StrategyLevel {
  level: string;
  icon: React.ComponentType<{ className?: string }>;
  items: StrategyItem[];
}

const STRATEGY_HIERARCHY: StrategyLevel[] = [
  {
    level: 'Federal',
    icon: Shield,
    items: [
      {
        name: 'Infrastructure Australia Assessment Framework',
        description: 'Required for projects seeking federal co-funding. Five stages: problem identification → options assessment → business case → detailed business case → evaluation.',
        mandatory: true,
        atapPhase: 'SMT / BCR',
      },
      {
        name: 'ATAP (Australian Transport Assessment & Planning) Guidelines',
        description: 'National framework for transport planning and appraisal — Strategic Merit Test, economic appraisal methods (BCA), options development.',
        mandatory: true,
        atapPhase: 'All phases',
      },
    ],
  },
  {
    level: 'NSW State',
    icon: Layers,
    items: [
      {
        name: 'Connecting NSW Strategy (2024)',
        description: 'Supersedes Future Transport 2056. Sets 6 priorities for NSW transport: Zero trauma · Reliability & resilience · Net zero emissions · Reduce disadvantage · Mode shift · Whole-of-government outcomes. Projects must map to at least one priority.',
        mandatory: true,
        atapPhase: 'SMT',
      },
      {
        name: 'NSW Premier\'s Priorities',
        description: 'Current priorities include improving transport access and reducing commute times for Western Sydney and outer metropolitan areas.',
        mandatory: false,
        atapPhase: 'SMT',
      },
      {
        name: 'NSW 20-Year Infrastructure Strategy (INSS)',
        description: 'Infrastructure NSW\'s prioritised list of state infrastructure investments. Alignment strengthens the strategic case.',
        mandatory: false,
        atapPhase: 'SMT',
      },
      {
        name: 'Movement and Place Framework',
        description: 'Classifies every NSW road/corridor by movement priority (network function) and place quality (urban context). Determines appropriate mode emphasis, speed, and street design.',
        mandatory: true,
        atapPhase: 'Options',
      },
      {
        name: 'Net Zero Plan & TfNSW Decarbonisation Roadmap',
        description: 'TPG24-29 now mandates carbon emission valuation in all CBAs. Projects must address Scope 1–3 emissions and modal shift contribution to net zero.',
        mandatory: true,
        atapPhase: 'CBA',
      },
    ],
  },
  {
    level: 'Regional / District',
    icon: MapPin,
    items: [
      {
        name: 'Greater Sydney Region Plan (GSC) / District Plans',
        description: '6 district plans for Greater Sydney; embed transport service requirements into planning approvals. Relevant for Sydney-region LGAs.',
        mandatory: false,
        atapPhase: 'SMT',
      },
      {
        name: 'Regional Transport Plans (TfNSW)',
        description: 'Published for each of the 8 NSW transport regions. Sets regional connectivity objectives, service standards, and network priorities.',
        mandatory: false,
        atapPhase: 'SMT',
      },
      {
        name: 'Local Strategic Planning Statements (LSPS)',
        description: 'Each council must have an LSPS aligning local land use decisions with district and regional plans. Transport provisions support the place-based analysis.',
        mandatory: false,
        atapPhase: 'SMT',
      },
    ],
  },
  {
    level: 'Network / Mode-Specific',
    icon: BookOpen,
    items: [
      {
        name: 'Sydney Metro Network Plan',
        description: 'Identifies corridors under investigation or committed for rapid transit. Projects must be consistent with, or present a case for variation from, this plan.',
        mandatory: false,
        atapPhase: 'Options',
      },
      {
        name: 'Bus Reform & Point to Point Transport Strategy',
        description: 'Sets bus network frequency standards, route rationalisation objectives. Relevant for bus and integrated transport projects.',
        mandatory: false,
        atapPhase: 'Options',
      },
      {
        name: 'NSW Freight and Ports Plan',
        description: 'Identifies strategic freight corridors, intermodal precincts (IMTS), and port land use protections. Mandatory for freight/logistics projects.',
        mandatory: false,
        atapPhase: 'SMT',
      },
      {
        name: 'NSW Active Transport Strategy & Walking/Cycling Plans',
        description: 'Sets targets for walking and cycling mode share. Requires local active transport plans to demonstrate network connectivity.',
        mandatory: false,
        atapPhase: 'Options',
      },
    ],
  },
];

// ─── Connecting NSW Priorities ─────────────────────────────────────────────────

const CONNECTING_NSW_PRIORITIES = [
  {
    code: 'P1',
    name: 'Towards zero trauma',
    color: 'bg-red-100 text-red-800',
    description: 'Aspire to eliminate trauma across the entire NSW transport network and ensure the safety and peace of mind of communities across NSW.',
  },
  {
    code: 'P2',
    name: 'Restore reliability & build resilience',
    color: 'bg-blue-100 text-blue-800',
    description: 'Enhance transport access and connectivity by minimising disruptions, restoring reliability, ensuring safety and strengthening network resilience.',
  },
  {
    code: 'P3',
    name: 'Transition to net zero emissions',
    color: 'bg-teal-100 text-teal-800',
    description: 'Drive a reduction in emissions and accelerate the decarbonisation of NSW\'s transport sector to transition to a net zero future.',
  },
  {
    code: 'P4',
    name: 'Reduce transport disadvantage',
    color: 'bg-purple-100 text-purple-800',
    description: 'Connect all people in NSW to jobs, health, education, cultural and recreational services regardless of where they live and their ability to pay.',
  },
  {
    code: 'P5',
    name: 'Reimagine road space to drive mode shift',
    color: 'bg-green-100 text-green-800',
    description: 'Accommodate the travel demands of a growing population and support sustainability goals without sacrificing quality of life and health outcomes.',
  },
  {
    code: 'P6',
    name: 'Enable whole-of-government outcomes',
    color: 'bg-amber-100 text-amber-800',
    description: 'Work collaboratively with cross-agency partners to support Government priorities including housing delivery, energy transition and Closing the Gap.',
  },
];

// ─── SEIFA context bands ──────────────────────────────────────────────────────

function seifaBand(score: number): { label: string; color: string; description: string } {
  if (score >= 1050) return { label: 'Low disadvantage', color: 'text-emerald-700', description: 'Area is in the least disadvantaged quartile nationally' };
  if (score >= 1000) return { label: 'Below average disadvantage', color: 'text-blue-700', description: 'Area is slightly below the national median of disadvantage' };
  if (score >= 950) return { label: 'Moderate disadvantage', color: 'text-amber-700', description: 'Area is moderately disadvantaged relative to NSW average' };
  return { label: 'High disadvantage', color: 'text-red-700', description: 'Area is in the most disadvantaged quartile — strong equity case for P4 (Reduce transport disadvantage)' };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StrategicAlignmentPage() {
  const { selectedArea } = useAppStore();

  const area = selectedArea ?? { id: 'lga_sydney', name: 'City of Sydney', type: 'lga' as const };
  const areaId = area.id;

  const {
    demographics: { data: demData, meta: demMeta },
    growth: { data: growthData, meta: growthMeta },
    transport: { data: transportData },
    economy: { data: econData },
  } = useLiveData(areaId, 2021);

  // Merge meta (use the more data-rich one)
  const combinedMeta = demMeta.liveFields.length >= growthMeta.liveFields.length ? demMeta : growthMeta;

  // ── Collapsible panel state ────────────────────────────────────────────────
  const [p5Open, setP5Open] = useState(true);
  const [p4Open, setP4Open] = useState(true);
  const [p2Open, setP2Open] = useState(true);

  // ── Growth metrics ─────────────────────────────────────────────────────────
  const pop2021 =
    growthData.populationHistory.find((d: { year: number; population: number }) => d.year === 2021)?.population ??
    growthData.populationHistory[growthData.populationHistory.length - 1]?.population ?? 0;

  const pop2041 =
    growthData.populationProjections.find((d: { year: number; population: number }) => d.year === 2041)?.population ?? 0;

  const jobs2021 =
    growthData.employmentGrowth.find((d: { year: number; jobs: number }) => d.year === 2021)?.jobs ?? 0;
  const jobs2041 =
    growthData.employmentGrowth.find((d: { year: number; jobs: number }) => d.year === 2041)?.jobs ?? 0;

  const popGrowthPct = pop2021 > 0 ? Math.round(((pop2041 - pop2021) / pop2021) * 1000) / 10 : 0;

  // ── Population projection chart data ──────────────────────────────────────
  const allPop = [
    ...growthData.populationHistory,
    ...growthData.populationProjections,
  ];
  const popChartData = allPop.map((d: { year: number; population: number }) => ({
    year: d.year,
    Population: d.population,
  }));

  // ── Employment projection chart data ──────────────────────────────────────
  const empChartData = growthData.employmentGrowth.map((d: { year: number; jobs: number }) => ({
    year: d.year,
    Jobs: d.jobs,
  }));

  // ── Jobs-to-population ratio (self-containment proxy) ──────────────────────
  const allPopForRatio = [
    ...growthData.populationHistory,
    ...growthData.populationProjections,
  ];
  const jobsRatioData = allPopForRatio.map((pd: { year: number; population: number }) => {
    const jobEntry = growthData.employmentGrowth.find((e: { year: number; jobs: number }) => e.year === pd.year);
    const ratio = jobEntry && pd.population > 0
      ? Math.round((jobEntry.jobs / pd.population) * 1000) / 10
      : null;
    return { year: pd.year, 'Jobs per 100 persons': ratio ?? 0 };
  });

  // ── Combined population + employment chart ──────────────────────────────
  const combinedGrowthData = allPopForRatio.map((pd: { year: number; population: number }) => {
    const jobEntry = growthData.employmentGrowth.find((e: { year: number; jobs: number }) => e.year === pd.year);
    return {
      year: pd.year,
      Population: pd.population,
      Employment: jobEntry?.jobs ?? 0,
    };
  });

  // ── Population growth by period (bar) ─────────────────────────────────────
  const allPopList = [...growthData.populationHistory, ...growthData.populationProjections];
  const popPeriods = [
    { name: '2011–2016', start: 2011, end: 2016 },
    { name: '2016–2021', start: 2016, end: 2021 },
    { name: '2021–2026', start: 2021, end: 2026 },
    { name: '2026–2031', start: 2026, end: 2031 },
    { name: '2031–2036', start: 2031, end: 2036 },
    { name: '2036–2041', start: 2036, end: 2041 },
  ].map(p => {
    const startPop = allPopList.find((d: { year: number; population: number }) => d.year === p.start)?.population ?? 0;
    const endPop = allPopList.find((d: { year: number; population: number }) => d.year === p.end)?.population ?? 0;
    const growthPct = startPop > 0 ? Math.round(((endPop - startPop) / startPop) * 1000) / 10 : 0;
    return { name: p.name, 'Growth (%)': growthPct };
  });

  // ── Transport chart data ───────────────────────────────────────────────────
  const modeShareTrendData = transportData.modeShareTrend.map((d: { year: number; car: number; train: number; bus: number; active: number; wfh: number }) => ({
    year: d.year,
    'Car': d.car,
    'Train': d.train,
    'Bus': d.bus,
    'Active': d.active,
    'WFH': d.wfh,
  }));

  const carModeShare = transportData.journeyToWork.find((d: { name: string; value: number }) => d.name === 'Car (driver)')?.value ?? 0;
  const ptModeShare = (transportData.journeyToWork.find((d: { name: string; value: number }) => d.name === 'Train')?.value ?? 0)
    + (transportData.journeyToWork.find((d: { name: string; value: number }) => d.name === 'Bus')?.value ?? 0)
    + (transportData.journeyToWork.find((d: { name: string; value: number }) => d.name === 'Ferry')?.value ?? 0);
  const activeModeShare = (transportData.journeyToWork.find((d: { name: string; value: number }) => d.name === 'Cycling')?.value ?? 0)
    + (transportData.journeyToWork.find((d: { name: string; value: number }) => d.name === 'Walking')?.value ?? 0);

  const seifaInfo = seifaBand(demData.seifaScore);
  const seifaCompData = [
    { name: area.name, SEIFA: demData.seifaScore },
    { name: 'Greater Sydney avg', SEIFA: 1020 },
    { name: 'NSW average', SEIFA: 1000 },
  ];

  return (
    <div>
      <Header
        title="Strategic Alignment"
        subtitle={`${area.name} — Strategy Hierarchy & Distributional Analysis`}
      />

      <div className="p-6 space-y-6">
        <DataSourceBadge meta={combinedMeta} />

        {/* ── Stat Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Shield}
            label="SEIFA Score (IRSAD)"
            value={demData.seifaScore}
            subtitle={seifaInfo.label}
          />
          <StatCard
            icon={Users}
            label="Population (2021)"
            value={formatNumber(pop2021)}
            subtitle={growthMeta.liveFields.includes('populationProjections') ? 'NSW DPE base year' : 'Indicative'}
          />
          <StatCard
            icon={TrendingUp}
            label="Projected Population (2041)"
            value={`${formatNumber(pop2041)} (+${popGrowthPct}%)`}
            subtitle={growthMeta.liveFields.includes('populationProjections') ? 'NSW DPE 2024 projections' : 'Indicative'}
          />
          <StatCard
            icon={Briefcase}
            label="Projected Employment (2041)"
            value={formatNumber(jobs2041)}
            subtitle={growthMeta.liveFields.includes('employmentGrowth') ? 'TfNSW TZP24' : 'Indicative'}
          />
        </div>

        {/* ── Connecting NSW Priorities ─────────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-primary-600" />
            <h3 className="text-base font-semibold text-gray-900">Connecting NSW Strategy — Priorities</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            The Connecting NSW Strategy (2024) supersedes Future Transport 2056. Business cases must demonstrate
            alignment with at least one priority. The ATAP Strategic Merit Test requires qualitative evidence
            against the applicable priority/priorities. Select those most relevant to your project and document
            how the proposed intervention advances each one.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {CONNECTING_NSW_PRIORITIES.map((o) => (
              <div key={o.code} className="border border-gray-100 rounded-lg p-3 hover:border-gray-200 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${o.color}`}>{o.code}</span>
                  <span className="text-sm font-medium text-gray-800">{o.name}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{o.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── P5 · Mode Shift Evidence ──────────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <button
            onClick={() => setP5Open(o => !o)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2">
              <Car className="w-5 h-5 text-green-600" />
              <div>
                <span className="text-sm font-semibold text-gray-900">P5 · Mode Shift — Supporting Evidence</span>
                <span className="ml-2 text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-semibold">P5</span>
              </div>
            </div>
            {p5Open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {p5Open && (
            <div className="px-5 pb-5 space-y-5 border-t border-gray-100">
              <p className="text-sm text-gray-500 pt-4">
                Current mode share and historical trends quantify the scale of car dependency and the opportunity for
                mode shift. High car driver mode share directly supports the strategic case under Connecting NSW P5
                (Reimagine road space to drive mode shift) and is a required input to the ATAP Strategic Merit Test.
              </p>

              {/* Stat strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  icon={Car}
                  label="Car Driver Mode Share"
                  value={`${carModeShare.toFixed(1)}%`}
                  subtitle="Journey to work (ABS Census 2021)"
                />
                <StatCard
                  icon={Activity}
                  label="PT Mode Share"
                  value={`${ptModeShare.toFixed(1)}%`}
                  subtitle="Train + Bus + Ferry combined"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Avg Commute Time"
                  value={`${transportData.avgCommute} min`}
                  subtitle="One-way (TfNSW / ABS)"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Journey to work donut */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Journey-to-Work Mode Share</h4>
                  <PieChart
                    data={transportData.journeyToWork.filter((d: { name: string; value: number }) => d.value > 0)}
                    innerRadius={50}
                    height={260}
                  />
                  <p className="text-xs text-gray-400 mt-2 text-center">Source: ABS Census 2021 (G55) / Sample</p>
                </div>

                {/* Mode share trend */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Mode Share Trend (2019–2024)</h4>
                  <NeedsLineChart
                    data={modeShareTrendData}
                    dataKeys={['Car', 'Train', 'Bus', 'Active', 'WFH']}
                    xAxisKey="year"
                    colors={[CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2], CHART_COLORS[3], CHART_COLORS[4]]}
                    yAxisLabel="%"
                    height={260}
                  />
                  <p className="text-xs text-gray-400 mt-2 text-center">Source: TfNSW Open Data / Sample</p>
                </div>
              </div>

              {/* Active mode share context */}
              <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                <p className="text-sm font-medium text-green-800">
                  Active transport mode share: {activeModeShare.toFixed(1)}% (walking + cycling)
                </p>
                <p className="text-xs text-green-700 mt-0.5">
                  Low active mode share indicates potential for infrastructure investment in walking and cycling
                  networks, supporting P5 and P3 (Net zero emissions) simultaneously.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── P4 · Equity & Disadvantage Evidence ──────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <button
            onClick={() => setP4Open(o => !o)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-purple-600" />
              <div>
                <span className="text-sm font-semibold text-gray-900">P4 · Reduce Transport Disadvantage — Supporting Evidence</span>
                <span className="ml-2 text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-semibold">P4</span>
              </div>
            </div>
            {p4Open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {p4Open && (
            <div className="px-5 pb-5 space-y-5 border-t border-gray-100">
              <p className="text-sm text-gray-500 pt-4">
                Labour market and income indicators contextualise the SEIFA score and build the equity argument
                for transport investment. High unemployment or low income combined with a low SEIFA score provides
                strong distributional justification under P4 and satisfies ATAP Distributional Analysis requirements.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  icon={Shield}
                  label="SEIFA Score (IRSAD)"
                  value={demData.seifaScore}
                  subtitle={seifaInfo.label}
                />
                <StatCard
                  icon={AlertCircle}
                  label="Unemployment Rate"
                  value={`${econData.unemploymentRate.toFixed(1)}%`}
                  subtitle="ABS Labour Force / Census 2021"
                />
                <StatCard
                  icon={Users}
                  label="Labour Participation"
                  value={`${econData.participationRate.toFixed(1)}%`}
                  subtitle="% of working-age population"
                />
                <StatCard
                  icon={DollarSign}
                  label="Median Weekly Income"
                  value={`$${formatNumber(econData.medianWeeklyIncome)}`}
                  subtitle="Household (ABS Census 2021)"
                />
              </div>

              <div className={`p-3 rounded-lg border ${seifaInfo.color.includes('red') ? 'bg-red-50 border-red-100' : seifaInfo.color.includes('amber') ? 'bg-amber-50 border-amber-100' : 'bg-blue-50 border-blue-100'}`}>
                <p className={`text-sm font-medium ${seifaInfo.color}`}>
                  Equity assessment: {seifaInfo.label} — {seifaInfo.description}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Unemployment rate of {econData.unemploymentRate.toFixed(1)}% and median household income of ${formatNumber(econData.medianWeeklyIncome)}/week
                  {econData.unemploymentRate > 6 ? ' indicate elevated economic hardship, strengthening the equity case for prioritised transport investment.' : ' are broadly in line with state averages.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── P2 · Reliability & Resilience Evidence ────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <button
            onClick={() => setP2Open(o => !o)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              <div>
                <span className="text-sm font-semibold text-gray-900">P2 · Reliability & Resilience — Supporting Evidence</span>
                <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-semibold">P2</span>
              </div>
            </div>
            {p2Open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {p2Open && (
            <div className="px-5 pb-5 space-y-5 border-t border-gray-100">
              <p className="text-sm text-gray-500 pt-4">
                Vehicle ownership distribution reveals household dependency on private vehicles and vulnerability
                to network disruption. High multi-car household rates indicate low PT viability, while zero-car
                households represent captive PT users most affected by reliability failures.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatCard
                  icon={Car}
                  label="Avg Commute Time"
                  value={`${transportData.avgCommute} min`}
                  subtitle="One-way average (TfNSW / ABS)"
                />
                <StatCard
                  icon={Activity}
                  label="PT Patronage per Capita"
                  value={transportData.ptPatronage > 0 ? formatNumber(transportData.ptPatronage) : 'N/A'}
                  subtitle="Annual trips per capita (TfNSW)"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Vehicle Ownership Distribution</h4>
                  <PieChart
                    data={transportData.vehicleOwnership.filter((d: { name: string; value: number }) => d.value > 0)}
                    innerRadius={50}
                    height={240}
                  />
                  <p className="text-xs text-gray-400 mt-2 text-center">Source: ABS Census 2021 / Sample</p>
                </div>

                <div className="flex flex-col justify-center space-y-3">
                  {transportData.vehicleOwnership.map((d: { name: string; value: number }, i: number) => (
                    <div key={d.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-sm text-gray-700">{d.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{d.value.toFixed(1)}%</span>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400 pt-1">
                    {(transportData.vehicleOwnership[0]?.value ?? 0) > 10
                      ? `${(transportData.vehicleOwnership[0]?.value ?? 0).toFixed(1)}% of households have no vehicle — these residents are fully dependent on PT, walking, or cycling.`
                      : 'Low zero-car household rate indicates strong car dependency across the area.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Distributional Analysis + Population Projections ─────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SEIFA distributional context */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Distributional Impact Analysis</h3>
            <p className="text-sm text-gray-500 mb-4">
              The SEIFA IRSAD score positions this area on the national disadvantage spectrum. Lower scores
              strengthen the equity argument for investment under Connecting NSW Priority P4 (Reduce transport disadvantage) and
              satisfy the distributional analysis requirement increasingly cited in Australian federal
              business case guidelines, following the UK Green Book review.
            </p>
            <NeedsBarChart
              data={seifaCompData}
              dataKeys={['SEIFA']}
              colors={[
                demData.seifaScore < 970 ? CHART_COLORS[0] : CHART_COLORS[2],
                CHART_COLORS[6],
                CHART_COLORS[4],
              ]}
              layout="vertical"
              xAxisLabel="SEIFA IRSAD Score"
              height={200}
            />
            <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
              <p className={`text-sm font-medium ${seifaInfo.color}`}>{seifaInfo.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{seifaInfo.description}</p>
              <p className="text-xs text-gray-400 mt-1">Source: ABS SEIFA 2021 (IRSAD)</p>
            </div>
          </div>

          {/* Population projections */}
          <ChartWrapper
            title="Population Projections 2011–2041"
            subtitle="Historical (ABS ERP / Census) + projected (NSW DPE 2024)"
            data={popChartData}
            dataKeys={['Population']}
            xAxisKey="year"
          >
            <p className="text-sm text-gray-500 mb-4">
              Population growth is the primary driver of transport demand and the key evidence base for
              justifying capacity investment. The NSW DPE official projection must be cited and used
              as the demographic assumption in any business case for this area.
            </p>
            <NeedsLineChart
              data={popChartData}
              dataKeys={['Population']}
              xAxisKey="year"
              colors={[CHART_COLORS[0]]}
              yAxisLabel="Persons"
              height={260}
            />
          </ChartWrapper>
        </div>

        {/* ── Combined population + employment growth ───────────────────── */}
        <ChartWrapper
          title="Population & Employment Growth (2011–2041)"
          subtitle="Combined view — ABS ERP / Census + NSW DPE projections + TfNSW TZP24 employment forecasts"
          data={combinedGrowthData}
          dataKeys={['Population', 'Employment']}
          xAxisKey="year"
        >
          <p className="text-sm text-gray-500 mb-4">
            Overlaying population and employment projections on the same axis demonstrates the total
            scale of activity growth the transport network must accommodate. Where employment grows
            faster than population it implies rising inbound commute pressure and strengthens the
            agglomeration benefit argument under Connecting NSW Priority P6 (Enable whole-of-government outcomes).
          </p>
          <NeedsLineChart
            data={combinedGrowthData}
            dataKeys={['Population', 'Employment']}
            xAxisKey="year"
            colors={[CHART_COLORS[0], CHART_COLORS[1]]}
            yAxisLabel="Count"
            height={320}
          />
        </ChartWrapper>

        {/* ── Growth by period + Jobs ratio ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartWrapper
            title="Population Growth Rate by 5-Year Period"
            subtitle="Percentage change per period — historical and projected"
            data={popPeriods}
            dataKeys={['Growth (%)']}
          >
            <p className="text-sm text-gray-500 mb-4">
              Breaking growth into 5-year intervals reveals whether demand pressure is accelerating or
              easing over the project assessment period. Sustained high growth in 2021–2036 indicates
              transport investment needs to be delivered early to avoid congestion and capacity shortfalls.
            </p>
            <NeedsBarChart
              data={popPeriods}
              dataKeys={['Growth (%)']}
              colors={[CHART_COLORS[0]]}
              layout="horizontal"
              yAxisLabel="Growth (%)"
              height={280}
            />
          </ChartWrapper>

          <ChartWrapper
            title="Jobs-to-Population Ratio (2011–2041)"
            subtitle="Employment per 100 residents — proxy for self-containment and commute trip generation"
            data={jobsRatioData}
            dataKeys={['Jobs per 100 persons']}
            xAxisKey="year"
          >
            <p className="text-sm text-gray-500 mb-4">
              The jobs-to-population ratio is an indicator of local economic self-containment. A rising
              ratio implies more jobs per resident and increasing inbound commute trips, reinforcing the
              case for PT and arterial road capacity (Connecting NSW Priority P5 — Mode shift). A falling ratio means residents
              must travel further for work, strengthening the outbound commute investment case.
            </p>
            <NeedsLineChart
              data={jobsRatioData}
              dataKeys={['Jobs per 100 persons']}
              xAxisKey="year"
              colors={[CHART_COLORS[1]]}
              yAxisLabel="Jobs per 100 persons"
              height={280}
            />
          </ChartWrapper>
        </div>

        {/* ── Strategy Hierarchy Reference ─────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-primary-600" />
            <h3 className="text-base font-semibold text-gray-900">Applicable Strategy Hierarchy</h3>
          </div>
          <p className="text-sm text-gray-500 mb-5">
            Every NSW transport business case must map to the applicable strategy documents at each level
            of this hierarchy. Items marked <span className="font-medium text-primary-700">Required</span> are
            mandatory under TfNSW submission guidelines or Infrastructure Australia assessment framework
            requirements. The ATAP phase column indicates where each strategy is typically cited.
          </p>

          <div className="space-y-6">
            {STRATEGY_HIERARCHY.map((level) => {
              const Icon = level.icon;
              return (
                <div key={level.level}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4 text-gray-500" />
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{level.level}</h4>
                  </div>
                  <div className="space-y-2">
                    {level.items.map((item) => (
                      <div
                        key={item.name}
                        className={`border rounded-lg p-3 ${item.mandatory ? 'border-primary-200 bg-primary-50/40' : 'border-gray-100'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-800">{item.name}</span>
                              {item.mandatory && (
                                <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded font-semibold">
                                  Required
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.description}</p>
                          </div>
                          {item.atapPhase && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded whitespace-nowrap flex-shrink-0">
                              {item.atapPhase}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Disclaimer */}
          <div className="mt-5 pt-4 border-t border-gray-100 flex gap-2 text-xs text-gray-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              Strategy documents and policy requirements change over time. Always verify against the latest published
              versions from TfNSW, Infrastructure NSW, and Infrastructure Australia before submitting.
            </p>
          </div>
        </div>

        {/* ── Network Alignment Checklist ──────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-5 h-5 text-primary-600" />
            <h3 className="text-base font-semibold text-gray-900">Network & Committed Projects Alignment</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            ATAP guidelines require the base case to include all committed and funded projects in the
            network, preventing double-counting of benefits. Complete this checklist before finalising
            the base case specification to confirm consistency with network plans and land use assumptions.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                item: 'Verify initiative is consistent with endorsed corridor strategies',
                note: 'Check TfNSW Corridor Strategies and Precinct Transport Plans for this area',
              },
              {
                item: 'Include all committed / funded projects in base case',
                note: 'Source from Infrastructure NSW PIR, TfNSW Capital Delivery Program, and Budget Forward Estimates',
              },
              {
                item: 'Check for overlapping or complementary projects',
                note: 'Avoid double-counting benefits with other funded initiatives nearby',
              },
              {
                item: 'Confirm zoning and land use assumptions',
                note: 'Align with LEPs, DCP, and any rezoning proposals in the corridor',
              },
              {
                item: 'Document identified projects in regional transport plans',
                note: 'Cite relevant passage from the applicable Regional Transport Plan or service plan',
              },
              {
                item: 'Assess distributional impacts using SEIFA and precinct demographics',
                note: 'UK Green Book review requirement; also ATAP Distributional Analysis guidance',
              },
            ].map((c, i) => (
              <div key={i} className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg">
                <div className="w-5 h-5 border-2 border-gray-300 rounded flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-800">{c.item}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
