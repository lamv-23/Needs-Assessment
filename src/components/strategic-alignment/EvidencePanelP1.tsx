'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Shield, Users, TrendingUp, Car } from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsLineChart from '@/components/charts/LineChart';
import { FindingCallout } from '@/components/ui/FindingCallout';
import { BenchmarkBar } from '@/components/strategic-alignment/BenchmarkBar';
import { formatNumber, formatPercent, CHART_COLORS } from '@/lib/utils';

interface Props {
  areaName: string;
  pop2021: number;
  pop2041: number;
  popGrowthPct: number;
  zeroCarShare: number;
  popChartData: { year: number; Population: number }[];
  benchmarkGrowth: { greaterSydney: number; nsw: number };
}

export function EvidencePanelP1({ areaName, pop2021, pop2041, popGrowthPct, zeroCarShare, popChartData, benchmarkGrowth }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setOpen((value) => !value)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-600" />
          <span className="text-sm font-semibold text-gray-900">P1 · Towards zero trauma</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard icon={Users} label="Population (2021)" value={formatNumber(pop2021)} />
            <StatCard icon={TrendingUp} label="Projected Population (2041)" value={formatNumber(pop2041)} />
            <StatCard icon={Car} label="Zero-car households" value={formatPercent(zeroCarShare)} />
          </div>

          <ChartWrapper title="Population projections 2021–2041" data={popChartData} dataKeys={['Population']} xAxisKey="year">
            <NeedsLineChart data={popChartData} dataKeys={['Population']} xAxisKey="year" colors={[CHART_COLORS[0]]} height={260} />
          </ChartWrapper>

          <FindingCallout severity={popGrowthPct > 25 ? 'warning' : 'info'} heading="Why this matters for P1">
            Population growth of {formatPercent(popGrowthPct)} to 2041, combined with {formatPercent(zeroCarShare)} of households with no vehicle, increases exposure to road trauma risk and dependence on safe access to the network.
          </FindingCallout>

          <BenchmarkBar
            label="Population growth to 2041"
            areaName={areaName}
            areaValue={popGrowthPct}
            greaterSydneyValue={benchmarkGrowth.greaterSydney}
            nswValue={benchmarkGrowth.nsw}
            unit="%"
          />
        </div>
      )}
    </div>
  );
}
