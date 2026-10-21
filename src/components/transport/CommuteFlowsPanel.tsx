'use client';

import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsBarChart from '@/components/charts/BarChart';
import { formatNumber, formatPercent, CHART_COLORS } from '@/lib/utils';
import type { TransportData } from '@/lib/data/sample-data';

interface Props {
  areaName: string;
  commuteFlows: TransportData['commuteFlows'];
}

/** Census journey-to-work flows: where residents work and where local workers live. */
export default function CommuteFlowsPanel({ areaName, commuteFlows }: Props) {
  if (!commuteFlows) {
    return (
      <ChartWrapper
        title="Where Residents Work"
        subtitle="Census journey-to-work flows between LGAs"
        className="lg:col-span-2"
      >
        <div className="flex items-center justify-center h-32 text-sm text-slate-400 text-center px-6">
          Census commuting flows between LGAs have not been loaded yet.
        </div>
      </ChartWrapper>
    );
  }

  const destinations = commuteFlows.topDestinations.map(d => ({ name: d.name, 'Resident workers': d.workers }));
  const origins = commuteFlows.topOrigins.map(o => ({ name: o.name, 'Local jobs': o.workers }));

  return (
    <ChartWrapper
      title="Where Residents Work"
      subtitle={`ABS Census ${commuteFlows.censusYear} journey to work, LGA of residence × LGA of workplace${commuteFlows.censusYear === 2021 ? ' (taken during COVID-19 lockdowns)' : ''}`}
      className="lg:col-span-2"
      data={destinations}
      dataKeys={['Resident workers']}
    >
      <div className="space-y-5 p-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{formatPercent(commuteFlows.selfContainment)}</div>
            <div className="text-xs text-blue-600 mt-1">Residents who work locally</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {formatNumber(commuteFlows.workLocally)} of {formatNumber(commuteFlows.residentWorkers)} employed residents
            </div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-emerald-700">{formatPercent(commuteFlows.selfSufficiency)}</div>
            <div className="text-xs text-emerald-600 mt-1">Local jobs held by residents</div>
            <div className="text-xs text-slate-500 mt-0.5">{formatNumber(commuteFlows.localJobs)} people work in {areaName}</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-amber-700">{formatNumber(commuteFlows.residentWorkers - commuteFlows.workLocally)}</div>
            <div className="text-xs text-amber-600 mt-1">Residents commuting out</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Top destination: {commuteFlows.topDestinations[0]?.name ?? 'none'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-2">Where {areaName} residents work (outside the LGA)</h4>
            <NeedsBarChart
              data={destinations}
              dataKeys={['Resident workers']}
              colors={[CHART_COLORS[0]]}
              layout="vertical"
              xAxisLabel="Workers"
              height={Math.max(160, destinations.length * 34)}
            />
          </div>
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-2">Where people working in {areaName} live</h4>
            <NeedsBarChart
              data={origins}
              dataKeys={['Local jobs']}
              colors={[CHART_COLORS[2]]}
              layout="vertical"
              xAxisLabel="Workers"
              height={Math.max(160, origins.length * 34)}
            />
          </div>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Counts exclude workers with no stated or fixed place of work. ABS randomly adjusts small cells to protect
          confidentiality, so small flows are approximate.
        </p>
      </div>
    </ChartWrapper>
  );
}
