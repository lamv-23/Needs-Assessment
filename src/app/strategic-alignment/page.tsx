'use client';

import Link from 'next/link';
import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import { FindingCallout } from '@/components/ui/FindingCallout';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';
import { PriorityGrid } from '@/components/strategic-alignment/PriorityGrid';
import { StrategyHierarchy } from '@/components/strategic-alignment/StrategyHierarchy';
import { AlignmentStrengthBadge } from '@/components/strategic-alignment/AlignmentStrengthBadge';
import { EvidencePanelP1 } from '@/components/strategic-alignment/EvidencePanelP1';
import { EvidencePanelP2 } from '@/components/strategic-alignment/EvidencePanelP2';
import { EvidencePanelP3 } from '@/components/strategic-alignment/EvidencePanelP3';
import { EvidencePanelP4 } from '@/components/strategic-alignment/EvidencePanelP4';
import { EvidencePanelP5 } from '@/components/strategic-alignment/EvidencePanelP5';
import { EvidencePanelP6 } from '@/components/strategic-alignment/EvidencePanelP6';
import { useAppStore } from '@/store';
import { useProjectSync } from '@/hooks/useProjectSync';
import { useLiveData } from '@/hooks/useLiveData';
import { useStrategicAlignmentStore } from '@/store/strategicAlignmentStore';
import { computeAlignmentStrength, strongestPriorityNarrative } from '@/lib/alignment-scoring';
import { getCarModeShare, getPTModeShare, getActiveModeShare, getVehicleOwnershipShare } from '@/lib/data/transport-helpers';
import { STRATEGY_HIERARCHY, CONNECTING_NSW_PRIORITIES, BENCHMARK_VALUES, seifaBand, type PriorityCode } from '@/lib/data/strategy-data';
import { formatNumber } from '@/lib/utils';
import { Shield, Users, TrendingUp, Briefcase, Layers, RotateCcw, ArrowRight } from 'lucide-react';

export default function StrategicAlignmentPage() {
  const { syncStatus, currentProjectId } = useProjectSync();
  const { selectedArea, selectedYear } = useAppStore();
  const { selectedPriorities, clearAll } = useStrategicAlignmentStore();

  const area = selectedArea ?? { id: 'lga_sydney', name: 'City of Sydney', type: 'lga' as const };
  const { demographics, growth, transport, economy, isLoading } = useLiveData(area.id, selectedYear);

  const demData = demographics.data;
  const growthData = growth.data;
  const transportData = transport.data;
  const econData = economy.data;
  const combinedMeta = demographics.meta.liveFields.length >= growth.meta.liveFields.length ? demographics.meta : growth.meta;

  const pop2021 = growthData.populationHistory.find((row) => row.year === 2021)?.population ?? growthData.populationHistory[growthData.populationHistory.length - 1]?.population ?? 0;
  const pop2041 = growthData.populationProjections.find((row) => row.year === 2041)?.population ?? 0;
  const jobs2021 = growthData.employmentGrowth.find((row) => row.year === 2021)?.jobs ?? 0;
  const jobs2041 = growthData.employmentGrowth.find((row) => row.year === 2041)?.jobs ?? 0;
  const popGrowthPct = pop2021 > 0 ? ((pop2041 - pop2021) / pop2021) * 100 : 0;
  const jobsToPopulationRatio = pop2021 > 0 ? (jobs2021 / pop2021) * 100 : 0;

  const carModeShare = getCarModeShare(transportData.journeyToWork);
  const ptModeShare = getPTModeShare(transportData.journeyToWork);
  const activeModeShare = getActiveModeShare(transportData.journeyToWork);
  const zeroCarShare = getVehicleOwnershipShare(transportData.vehicleOwnership, 'zero-car');
  const multiCarShare = getVehicleOwnershipShare(transportData.vehicleOwnership, 'multi-car');

  const popChartData = [...growthData.populationHistory, ...growthData.populationProjections].map((row) => ({ year: row.year, Population: row.population }));
  const modeShareTrendData = transportData.modeShareTrend.map((row) => ({
    year: row.year,
    Car: row.car,
    Train: row.train,
    Bus: row.bus,
    Active: row.active,
    WFH: row.wfh,
  }));
  const employmentProjectionData = growthData.employmentGrowth.map((row) => ({ year: row.year, Jobs: row.jobs }));
  const employmentByIndustry = econData.employmentByIndustry.slice(0, 10);
  const seifaInfo = seifaBand(demData.seifaScore);

  const scores = Object.fromEntries(
    CONNECTING_NSW_PRIORITIES.map((priority) => [
      priority.code,
      computeAlignmentStrength(priority.code, {
        popGrowthPct,
        avgCommuteTime: transportData.avgCommute,
        carModeShare,
        seifaScore: demData.seifaScore,
        unemploymentRate: econData.unemploymentRate,
      }),
    ])
  ) as Record<PriorityCode, ReturnType<typeof computeAlignmentStrength>>;

  const visiblePriorities = selectedPriorities.length === 0
    ? CONNECTING_NSW_PRIORITIES.map((priority) => priority.code)
    : selectedPriorities;

  const showPanel = (code: PriorityCode) => visiblePriorities.includes(code);
  const narrative = strongestPriorityNarrative(scores, area.name);

  return (
    <div>
      <Header title="Strategic Alignment" subtitle={`${area.name} — interactive strategy and priority builder`} />

      <div className="p-6 space-y-6">
        {currentProjectId && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Strategic alignment changes are syncing to the active server project. Status: <span className="font-medium capitalize">{syncStatus}</span>
          </div>
        )}
        <DataSourceBadge meta={combinedMeta} isLoading={isLoading} />

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Alignment summary</h2>
              <p className="text-sm text-gray-500 mt-1">Strength indicators are generated from current area metrics and help focus the strategic merit narrative.</p>
            </div>
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:border-gray-300"
            >
              <RotateCcw className="w-4 h-4" />
              Clear selections
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
            {CONNECTING_NSW_PRIORITIES.map((priority) => (
              <div key={priority.code} className="rounded-xl border border-gray-200 p-3 bg-gray-50">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${priority.color}`}>{priority.code}</span>
                  <AlignmentStrengthBadge strength={scores[priority.code].strength} />
                </div>
                <p className="mt-2 text-sm font-medium text-gray-900">{priority.name}</p>
                <p className="mt-1 text-xs text-gray-500">{scores[priority.code].metric}</p>
              </div>
            ))}
          </div>

          <FindingCallout severity="info" heading="Auto-generated narrative">
            {narrative}
          </FindingCallout>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard icon={Shield} label="SEIFA Score (IRSAD)" value={demData.seifaScore} subtitle={seifaInfo.label} />
          <StatCard icon={Users} label="Population (2021)" value={formatNumber(pop2021)} subtitle={growth.meta.liveFields.includes('populationHistory') ? 'Live / projected data available' : 'Indicative'} />
          <StatCard icon={TrendingUp} label="Projected Population (2041)" value={`${formatNumber(pop2041)} (+${popGrowthPct.toFixed(1)}%)`} subtitle="Growth to 2041" />
          <StatCard icon={Briefcase} label="Projected Employment (2041)" value={formatNumber(jobs2041)} subtitle={growth.meta.liveFields.includes('employmentGrowth') ? 'TfNSW TZP24 / sample fallback' : 'Indicative'} />
        </div>

        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Connecting NSW Priorities</h3>
          </div>
          <PriorityGrid priorities={CONNECTING_NSW_PRIORITIES} scores={scores} />
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Evidence panels</h3>
            <p className="text-sm text-gray-500 mt-1">When no priorities are selected, all evidence panels remain visible for browsing. Selecting priorities filters this section.</p>
          </div>

          {showPanel('P1') && (
            <EvidencePanelP1
              areaName={area.name}
              pop2021={pop2021}
              pop2041={pop2041}
              popGrowthPct={popGrowthPct}
              zeroCarShare={zeroCarShare}
              popChartData={popChartData}
              benchmarkGrowth={BENCHMARK_VALUES.populationGrowthPct2041}
            />
          )}
          {showPanel('P2') && (
            <EvidencePanelP2
              areaName={area.name}
              avgCommuteTime={transportData.avgCommute}
              ptPatronage={transportData.ptPatronage}
              vehicleOwnership={transportData.vehicleOwnership}
              benchmarkCommute={BENCHMARK_VALUES.avgCommuteTime}
            />
          )}
          {showPanel('P3') && (
            <EvidencePanelP3
              areaName={area.name}
              carModeShare={carModeShare}
              activeModeShare={activeModeShare}
              multiCarShare={multiCarShare}
              modeShareTrendData={modeShareTrendData}
              vehicleOwnership={transportData.vehicleOwnership}
              benchmarkCarMode={BENCHMARK_VALUES.carModeShare}
            />
          )}
          {showPanel('P4') && (
            <EvidencePanelP4
              areaName={area.name}
              seifaScore={demData.seifaScore}
              seifaInfo={seifaInfo}
              unemploymentRate={econData.unemploymentRate}
              participationRate={econData.participationRate}
              medianWeeklyIncome={econData.medianWeeklyIncome}
              benchmarkSeifa={BENCHMARK_VALUES.seifaScore}
            />
          )}
          {showPanel('P5') && (
            <EvidencePanelP5
              areaName={area.name}
              carModeShare={carModeShare}
              ptModeShare={ptModeShare}
              avgCommuteTime={transportData.avgCommute}
              activeModeShare={activeModeShare}
              journeyToWork={transportData.journeyToWork}
              modeShareTrendData={modeShareTrendData}
              benchmarkCarMode={BENCHMARK_VALUES.carModeShare}
            />
          )}
          {showPanel('P6') && (
            <EvidencePanelP6
              areaName={area.name}
              unemploymentRate={econData.unemploymentRate}
              participationRate={econData.participationRate}
              medianWeeklyIncome={econData.medianWeeklyIncome}
              jobsToPopulationRatio={jobsToPopulationRatio}
              employmentByIndustry={employmentByIndustry}
              employmentProjectionData={employmentProjectionData}
              benchmarkUnemployment={BENCHMARK_VALUES.unemploymentRate}
            />
          )}
        </section>

        <section>
          <StrategyHierarchy hierarchy={STRATEGY_HIERARCHY} />
        </section>

        <div className="bg-gradient-to-r from-primary-50 to-indigo-50 rounded-xl border border-primary-100 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Ready to build your case?</h3>
            <p className="text-sm text-gray-600 mt-1">Your selected priorities, strategies and notes can now flow into the business case report.</p>
          </div>
          <Link href="/business-case" className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
            Go to Business Case
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
