'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, DollarSign, Shield, Users, AlertCircle } from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import { FindingCallout } from '@/components/ui/FindingCallout';
import { BenchmarkBar } from '@/components/strategic-alignment/BenchmarkBar';
import { formatCurrency, formatPercent } from '@/lib/utils';

interface Props {
  areaName: string;
  seifaScore: number;
  seifaInfo: { label: string; color: string; description: string };
  unemploymentRate: number;
  participationRate: number;
  medianWeeklyIncome: number;
  benchmarkSeifa: { greaterSydney: number; nsw: number };
}

export function EvidencePanelP4({ areaName, seifaScore, seifaInfo, unemploymentRate, participationRate, medianWeeklyIncome, benchmarkSeifa }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setOpen((value) => !value)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-purple-600" />
          <span className="text-sm font-semibold text-gray-900">P4 · Reduce transport disadvantage</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard icon={Shield} label="SEIFA score" value={seifaScore} subtitle={seifaInfo.label} />
            <StatCard icon={AlertCircle} label="Unemployment" value={formatPercent(unemploymentRate)} />
            <StatCard icon={Users} label="Participation rate" value={formatPercent(participationRate)} />
            <StatCard icon={DollarSign} label="Median weekly income" value={formatCurrency(medianWeeklyIncome)} />
          </div>

          <FindingCallout severity={seifaScore < 950 ? 'warning' : 'info'} heading="Why this matters for P4">
            {seifaInfo.description} Unemployment at {formatPercent(unemploymentRate)} and median weekly income of {formatCurrency(medianWeeklyIncome)} provide additional evidence about the scale of transport disadvantage and barriers to opportunity.
          </FindingCallout>

          <BenchmarkBar
            label="SEIFA score"
            areaName={areaName}
            areaValue={seifaScore}
            greaterSydneyValue={benchmarkSeifa.greaterSydney}
            nswValue={benchmarkSeifa.nsw}
            direction="higher_better"
          />
        </div>
      )}
    </div>
  );
}
