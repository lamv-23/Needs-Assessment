'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Car, Activity, TrendingUp } from 'lucide-react';
import PieChart from '@/components/charts/PieChart';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsLineChart from '@/components/charts/LineChart';
import StatCard from '@/components/ui/StatCard';
import { FindingCallout } from '@/components/ui/FindingCallout';
import { BenchmarkBar } from '@/components/strategic-alignment/BenchmarkBar';
import { formatPercent, CHART_COLORS } from '@/lib/utils';

interface Props {
  areaName: string;
  carModeShare: number;
  ptModeShare: number;
  avgCommuteTime: number | null;
  activeModeShare: number;
  journeyToWork: { name: string; value: number }[];
  modeShareTrendData: { year: number; Car: number; Train: number; Bus: number; Active: number; WFH: number }[];
  benchmarkCarMode: { greaterSydney: number; nsw: number };
}

export function EvidencePanelP5({ areaName, carModeShare, ptModeShare, avgCommuteTime, activeModeShare, journeyToWork, modeShareTrendData, benchmarkCarMode }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setOpen((value) => !value)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50">
        <div className="flex items-center gap-2">
          <Car className="w-5 h-5 text-green-600" />
          <span className="text-sm font-semibold text-gray-900">P5 · Reimagine road space to drive mode shift</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard icon={Car} label="Car driver mode share" value={formatPercent(carModeShare)} />
            <StatCard icon={Activity} label="PT mode share" value={formatPercent(ptModeShare)} />
            <StatCard icon={TrendingUp} label="Average commute time" value={avgCommuteTime !== null ? `${avgCommuteTime.toFixed(1)} min` : 'N/A'} subtitle={avgCommuteTime !== null ? undefined : 'No official commute-time source integrated'} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ChartWrapper title="Journey-to-work mode share" data={journeyToWork} dataKeys={['value']}>
              <PieChart data={journeyToWork.filter((item) => item.value > 0)} innerRadius={52} height={260} />
            </ChartWrapper>
            <ChartWrapper title="Mode share trend" data={modeShareTrendData} dataKeys={['Car', 'Train', 'Bus', 'Active', 'WFH']} xAxisKey="year">
              <NeedsLineChart data={modeShareTrendData} dataKeys={['Car', 'Train', 'Bus', 'Active', 'WFH']} xAxisKey="year" colors={[CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2], CHART_COLORS[3], CHART_COLORS[4]]} height={260} />
            </ChartWrapper>
          </div>

          <FindingCallout severity={carModeShare > 75 ? 'warning' : 'info'} heading="Why this matters for P5">
            Car driver mode share of {formatPercent(carModeShare)} and active mode share of {formatPercent(activeModeShare)} quantify the scale of car dependency and the opportunity for road space reallocation, network reform and mode shift investment.
          </FindingCallout>

          <BenchmarkBar
            label="Car mode share"
            areaName={areaName}
            areaValue={carModeShare}
            greaterSydneyValue={benchmarkCarMode.greaterSydney}
            nswValue={benchmarkCarMode.nsw}
            unit="%"
            direction="lower_better"
          />
        </div>
      )}
    </div>
  );
}
