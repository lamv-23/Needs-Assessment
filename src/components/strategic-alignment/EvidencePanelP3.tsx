'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Zap, Car, Bike, Layers3 } from 'lucide-react';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsLineChart from '@/components/charts/LineChart';
import PieChart from '@/components/charts/PieChart';
import StatCard from '@/components/ui/StatCard';
import { FindingCallout } from '@/components/ui/FindingCallout';
import { BenchmarkBar } from '@/components/strategic-alignment/BenchmarkBar';
import { formatPercent, CHART_COLORS } from '@/lib/utils';

interface Props {
  areaName: string;
  carModeShare: number;
  activeModeShare: number;
  multiCarShare: number;
  modeShareTrendData: { year: number; Car: number; Train: number; Bus: number; Active: number; WFH: number }[];
  vehicleOwnership: { name: string; value: number }[];
  benchmarkCarMode: { greaterSydney: number; nsw: number };
}

export function EvidencePanelP3({ areaName, carModeShare, activeModeShare, multiCarShare, modeShareTrendData, vehicleOwnership, benchmarkCarMode }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setOpen((value) => !value)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-teal-600" />
          <span className="text-sm font-semibold text-gray-900">P3 · Transition to net zero emissions</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard icon={Car} label="Car mode share" value={formatPercent(carModeShare)} />
            <StatCard icon={Bike} label="Active mode share" value={formatPercent(activeModeShare)} />
            <StatCard icon={Layers3} label="3+ vehicle households" value={formatPercent(multiCarShare)} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ChartWrapper title="Mode share trend" data={modeShareTrendData} dataKeys={['Car', 'Train', 'Bus', 'Active']} xAxisKey="year">
              <NeedsLineChart data={modeShareTrendData} dataKeys={['Car', 'Train', 'Bus', 'Active']} xAxisKey="year" colors={[CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2], CHART_COLORS[3]]} height={260} />
            </ChartWrapper>

            <ChartWrapper title="Vehicle ownership" data={vehicleOwnership} dataKeys={['value']}>
              <PieChart data={vehicleOwnership.filter((item) => item.value > 0)} innerRadius={52} height={260} labelMode="value" valueSuffix="%" />
            </ChartWrapper>
          </div>

          <FindingCallout severity={carModeShare > 75 ? 'warning' : 'info'} heading="Why this matters for P3">
            Car mode share of {formatPercent(carModeShare)} implies high per-capita transport emissions. With {formatPercent(multiCarShare)} of households owning 3 or more vehicles, decarbonisation depends on mode shift and lower-emissions travel options.
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
