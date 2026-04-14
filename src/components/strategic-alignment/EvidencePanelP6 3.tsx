'use client';

import { useState } from 'react';
import { Briefcase, ChevronDown, ChevronUp, DollarSign, TrendingUp, Users } from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsBarChart from '@/components/charts/BarChart';
import NeedsLineChart from '@/components/charts/LineChart';
import { FindingCallout } from '@/components/ui/FindingCallout';
import { BenchmarkBar } from '@/components/strategic-alignment/BenchmarkBar';
import { formatCurrency, formatPercent, CHART_COLORS } from '@/lib/utils';

interface Props {
  areaName: string;
  unemploymentRate: number;
  participationRate: number;
  medianWeeklyIncome: number;
  jobsToPopulationRatio: number;
  employmentByIndustry: { name: string; value: number }[];
  employmentProjectionData: { year: number; Jobs: number }[];
  benchmarkUnemployment: { greaterSydney: number; nsw: number };
}

export function EvidencePanelP6({ areaName, unemploymentRate, participationRate, medianWeeklyIncome, jobsToPopulationRatio, employmentByIndustry, employmentProjectionData, benchmarkUnemployment }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setOpen((value) => !value)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50">
        <div className="flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-amber-600" />
          <span className="text-sm font-semibold text-gray-900">P6 · Enable whole-of-government outcomes</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard icon={TrendingUp} label="Unemployment" value={formatPercent(unemploymentRate)} />
            <StatCard icon={Users} label="Participation" value={formatPercent(participationRate)} />
            <StatCard icon={DollarSign} label="Median income" value={formatCurrency(medianWeeklyIncome)} />
            <StatCard icon={Briefcase} label="Jobs per 100 residents" value={jobsToPopulationRatio.toFixed(1)} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ChartWrapper title="Employment by industry" data={employmentByIndustry} dataKeys={['value']}>
              <NeedsBarChart data={employmentByIndustry} dataKeys={['value']} layout="horizontal" colors={[CHART_COLORS[1]]} height={320} />
            </ChartWrapper>
            <ChartWrapper title="Employment projections 2021–2041" data={employmentProjectionData} dataKeys={['Jobs']} xAxisKey="year">
              <NeedsLineChart data={employmentProjectionData} dataKeys={['Jobs']} xAxisKey="year" colors={[CHART_COLORS[3]]} height={260} />
            </ChartWrapper>
          </div>

          <FindingCallout severity={unemploymentRate > 7 ? 'warning' : 'info'} heading="Why this matters for P6">
            Unemployment at {formatPercent(unemploymentRate)} and median income of {formatCurrency(medianWeeklyIncome)} suggest transport investment can support access to jobs and broader government productivity objectives. A jobs-to-population ratio of {jobsToPopulationRatio.toFixed(1)} per 100 residents indicates how strongly the local network is tied to employment access.
          </FindingCallout>

          <BenchmarkBar
            label="Unemployment rate"
            areaName={areaName}
            areaValue={unemploymentRate}
            greaterSydneyValue={benchmarkUnemployment.greaterSydney}
            nswValue={benchmarkUnemployment.nsw}
            unit="%"
            direction="lower_better"
          />
        </div>
      )}
    </div>
  );
}
