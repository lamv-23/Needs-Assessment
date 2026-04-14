'use client';

import { useState } from 'react';
import { Activity, ChevronDown, ChevronUp, Car, Train } from 'lucide-react';
import ChartWrapper from '@/components/charts/ChartWrapper';
import PieChart from '@/components/charts/PieChart';
import StatCard from '@/components/ui/StatCard';
import { FindingCallout } from '@/components/ui/FindingCallout';
import { BenchmarkBar } from '@/components/strategic-alignment/BenchmarkBar';
import { getVehicleOwnershipShare } from '@/lib/data/transport-helpers';
import { formatNumber } from '@/lib/utils';

interface Props {
  areaName: string;
  avgCommuteTime: number | null;
  ptPatronage: number | null;
  vehicleOwnership: { name: string; value: number }[];
  benchmarkCommute: { greaterSydney: number; nsw: number };
}

export function EvidencePanelP2({ areaName, avgCommuteTime, ptPatronage, vehicleOwnership, benchmarkCommute }: Props) {
  const [open, setOpen] = useState(true);
  const zeroCar = getVehicleOwnershipShare(vehicleOwnership, 'zero-car');

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setOpen((value) => !value)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          <span className="text-sm font-semibold text-gray-900">P2 · Restore reliability & build resilience</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard icon={Car} label="Average commute" value={avgCommuteTime !== null ? `${avgCommuteTime.toFixed(1)} min` : 'N/A'} subtitle={avgCommuteTime !== null ? undefined : 'No official commute-time source integrated'} />
            <StatCard icon={Train} label="PT patronage per capita" value={ptPatronage !== null && ptPatronage > 0 ? formatNumber(ptPatronage) : 'N/A'} subtitle={ptPatronage !== null && ptPatronage > 0 ? 'Annual trips per capita' : 'No official patronage source integrated'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <ChartWrapper title="Vehicle ownership distribution" data={vehicleOwnership} dataKeys={['value']}>
              <PieChart data={vehicleOwnership.filter((item) => item.value > 0)} innerRadius={52} height={240} labelMode="value" valueSuffix="%" />
            </ChartWrapper>

            <FindingCallout severity={avgCommuteTime !== null && avgCommuteTime > 35 ? 'warning' : 'info'} heading="Why this matters for P2">
              {avgCommuteTime !== null
                ? `Commute time of ${avgCommuteTime.toFixed(1)} minutes and ${zeroCar.toFixed(1)}% of households without a car indicate reliance on a reliable transport network and stronger consequences when services are disrupted.`
                : `${zeroCar.toFixed(1)}% of households without a car indicates reliance on a reliable transport network, but official commute-time data is not currently integrated for this area.`}
            </FindingCallout>
          </div>

          {avgCommuteTime !== null && (
            <BenchmarkBar
              label="Average commute time"
              areaName={areaName}
              areaValue={avgCommuteTime}
              greaterSydneyValue={benchmarkCommute.greaterSydney}
              nswValue={benchmarkCommute.nsw}
              unit=" min"
              direction="lower_better"
            />
          )}
        </div>
      )}
    </div>
  );
}
