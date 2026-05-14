'use client';

import { useMemo, useState } from 'react';
import Header from '@/components/layout/Header';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsBarChart from '@/components/charts/BarChart';
import { useAppStore } from '@/store';
import { SAMPLE_AREAS, GREATER_SYDNEY_BENCHMARK } from '@/lib/data/sample-areas';
import {
  getDemographicsData,
  getTransportData,
  getEconomyData,
} from '@/lib/data/sample-data';
import { getProjectionsForArea } from '@/lib/data/nsw-projections-data';
import { formatNumber, formatPercent, formatCurrency, CHART_COLORS } from '@/lib/utils';
import { getCarModeShare, getPTModeShare, getModeValue } from '@/lib/data/transport-helpers';
import { TRANSPORT_DATA_NOTE } from '@/lib/data/tfnsw-transport';
import { Plus, X, ArrowUpRight, ArrowDownRight, Minus, Search } from 'lucide-react';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';
import { useMultiAreaData } from '@/hooks/useMultiAreaData';
import type { Area } from '@/types';

function ChangeIndicator({ value, benchmark }: { value: number; benchmark: number }) {
  const diff = value - benchmark;
  const pctDiff = benchmark !== 0 ? (diff / benchmark) * 100 : 0;
  if (Math.abs(pctDiff) < 1) return <Minus className="w-4 h-4 text-gray-400" />;
  return pctDiff > 0 ? (
    <span className="flex items-center text-emerald-600 text-xs font-medium">
      <ArrowUpRight className="w-3 h-3" />+{pctDiff.toFixed(1)}%
    </span>
  ) : (
    <span className="flex items-center text-red-600 text-xs font-medium">
      <ArrowDownRight className="w-3 h-3" />{pctDiff.toFixed(1)}%
    </span>
  );
}

export default function ComparePage() {
  const { selectedYear } = useAppStore();
  const [selectedAreas, setSelectedAreas] = useState<Area[]>([
    SAMPLE_AREAS.find(a => a.id === 'lga_sydney')!,
    SAMPLE_AREAS.find(a => a.id === 'lga_parramatta')!,
  ]);
  const [showSelector, setShowSelector] = useState(false);

  const addArea = (area: Area) => {
    if (!selectedAreas.find(a => a.id === area.id) && selectedAreas.length < 4) {
      setSelectedAreas([...selectedAreas, area]);
    }
    setShowSelector(false);
    setAreaSearch('');
  };

  const removeArea = (areaId: string) => {
    if (selectedAreas.length > 1) {
      setSelectedAreas(selectedAreas.filter(a => a.id !== areaId));
    }
  };

  // Live data for all selected areas (always 4 hook calls internally)
  const multiData = useMultiAreaData(selectedAreas, selectedYear);

  const areasData = useMemo(() => {
    return selectedAreas.map((area, i) => {
      const liveSlot = multiData[i];
      const projectionsById = getProjectionsForArea(area.id);
      const projections = projectionsById.length > 0 ? projectionsById : getProjectionsForArea(area.name);
      const pop2021 = projections.find(d => d.year === 2021)?.totalPopulation;
      const pop2041 = projections.find(d => d.year === 2041)?.totalPopulation;
      const nswGrowthRate = pop2021 && pop2041 && pop2021 > 0
        ? Math.round(((pop2041 / pop2021) ** (1 / 20) - 1) * 1000) / 10
        : null;
      const sampleGrowth = liveSlot?.growth.data ?? { projectedGrowthRate: 0 };

      return {
        area,
        projections,
        demographics: liveSlot?.demographics.data,
        transport: liveSlot?.transport.data,
        economy: liveSlot?.economy.data,
        housing: liveSlot?.housing.data,
        hasLiveData: liveSlot?.hasLiveData ?? false,
        growth: {
          ...sampleGrowth,
          projectedGrowthRate: nswGrowthRate ?? sampleGrowth.projectedGrowthRate,
          pop2021: pop2021 ?? null,
          pop2041: pop2041 ?? null,
          hasNSWData: projections.length > 0,
        },
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAreas, selectedYear, multiData]);

  const benchmarkData = useMemo(() => ({
    demographics: getDemographicsData(GREATER_SYDNEY_BENCHMARK.id, selectedYear),
    transport: getTransportData(GREATER_SYDNEY_BENCHMARK.id, selectedYear),
    economy: getEconomyData(GREATER_SYDNEY_BENCHMARK.id, selectedYear),
  }), [selectedYear]);

  const indicators = [
    { label: 'Total Population (2021)', getValue: (d: typeof areasData[0]) => d.growth.pop2021 ?? d.demographics?.totalPopulation ?? 0, format: formatNumber, benchmark: benchmarkData.demographics.totalPopulation },
    { label: 'Projected Population (2041)', getValue: (d: typeof areasData[0]) => d.growth.pop2041 ?? 0, format: formatNumber, benchmark: 0 },
    { label: 'Median Age', getValue: (d: typeof areasData[0]) => d.demographics?.medianAge ?? 0, format: (v: number) => v.toFixed(1), benchmark: benchmarkData.demographics.medianAge },
    { label: 'SEIFA Score', getValue: (d: typeof areasData[0]) => d.demographics?.seifaScore ?? 0, format: (v: number) => v.toString(), benchmark: benchmarkData.demographics.seifaScore },
    { label: 'Car Mode Share (%)', getValue: (d: typeof areasData[0]) => getCarModeShare(d.transport?.journeyToWork ?? []), format: (v: number) => formatPercent(v), benchmark: getCarModeShare(benchmarkData.transport.journeyToWork) },
    { label: 'PT Mode Share (%)', getValue: (d: typeof areasData[0]) => getPTModeShare(d.transport?.journeyToWork ?? []), format: (v: number) => formatPercent(v), benchmark: getPTModeShare(benchmarkData.transport.journeyToWork) },
    { label: 'Unemployment (%)', getValue: (d: typeof areasData[0]) => d.economy?.unemploymentRate ?? 0, format: (v: number) => formatPercent(v), benchmark: benchmarkData.economy.unemploymentRate },
    { label: 'Median Income ($/wk)', getValue: (d: typeof areasData[0]) => d.economy?.medianWeeklyIncome ?? 0, format: (v: number) => formatCurrency(v), benchmark: benchmarkData.economy.medianWeeklyIncome },
    { label: 'Median Rent ($/wk)', getValue: (d: typeof areasData[0]) => d.housing?.medianWeeklyRent ?? 0, format: (v: number) => formatCurrency(v), benchmark: 0 },
    { label: 'Projected Growth Rate (%/yr)', getValue: (d: typeof areasData[0]) => d.growth.projectedGrowthRate, format: (v: number) => formatPercent(v), benchmark: 0 },
  ];

  const modeShareComparison = useMemo(() => {
    return areasData.map(({ area, transport }) => {
      const jtw = transport?.journeyToWork ?? [];
      return {
        name: area.name.length > 15 ? area.name.substring(0, 15) + '...' : area.name,
        'Car': getCarModeShare(jtw),
        'Train': getModeValue(jtw, ['Train']),
        'Bus': getModeValue(jtw, ['Bus']),
        'Active': getModeValue(jtw, ['Cycling', 'Walking']),
        'WFH': getModeValue(jtw, ['Work from home']),
      };
    });
  }, [areasData]);

  const projectionComparisonData = useMemo(() => {
    return [2021, 2026, 2031, 2036, 2041].map(year => {
      const row: Record<string, number | string> = { name: String(year) };
      areasData.forEach(({ area, projections }) => {
        const projection = projections.find(entry => entry.year === year);
        const shortName = area.name.length > 15 ? area.name.substring(0, 15) + '…' : area.name;
        row[shortName] = projection?.totalPopulation ?? 0;
      });
      return row;
    });
  }, [areasData]);

  const REGION_ORDER = [
    'Greater Sydney',
    'Hunter',
    'Central Coast',
    'Illawarra-Shoalhaven',
    'South East & Tablelands',
    'New England & North West',
    'North Coast',
    'Central West & Orana',
    'Riverina-Murray',
    'Far West',
  ];

  const [areaSearch, setAreaSearch] = useState('');

  const availableLGAs = SAMPLE_AREAS.filter(a => a.type === 'lga' && !selectedAreas.find(s => s.id === a.id));

  const filteredLGAs = useMemo(() =>
    areaSearch
      ? availableLGAs.filter(a => a.name.toLowerCase().includes(areaSearch.toLowerCase()))
      : availableLGAs,
    [availableLGAs, areaSearch]
  );

  const groupedAvailableLGAs = useMemo(() => {
    const groups: Record<string, Area[]> = {};
    for (const area of filteredLGAs) {
      const region = area.region ?? 'Other';
      if (!groups[region]) groups[region] = [];
      groups[region].push(area);
    }
    return REGION_ORDER
      .filter((r) => groups[r]?.length)
      .map((r) => ({ region: r, areas: groups[r] }))
      .concat(
        Object.entries(groups)
          .filter(([r]) => !REGION_ORDER.includes(r))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([region, areas]) => ({ region, areas }))
      );
  }, [filteredLGAs]);

  const anyLive = areasData.some(d => d.hasLiveData);
  const liveAreaNames = areasData.filter(d => d.hasLiveData).map(d => d.area.name);

  const compareMeta = {
    source: anyLive
      ? `ABS Census (${liveAreaNames.join(', ')}); Transport: ${TRANSPORT_DATA_NOTE}`
      : `NSW DPE Population Projections; Transport: ${TRANSPORT_DATA_NOTE}; Demographics/economy: sample data`,
    lastRefreshed: multiData[0]?.demographics.meta.lastRefreshed ?? null,
    liveFields: anyLive ? ['population', 'medianAge', 'SEIFA', 'income', 'unemployment', 'rent'] : [],
    sampleFields: anyLive ? ['transport mode share', 'commute time'] : ['all'],
    hasLiveData: anyLive,
    hasPartialLive: anyLive,
  };

  return (
    <div>
      <Header title="Compare Areas" subtitle="Side-by-side comparison with Greater Sydney benchmark" />

      <div className="p-6 space-y-6">
        <DataSourceBadge meta={compareMeta} />

        {/* Area Selection */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-gray-600">Comparing:</span>
            {selectedAreas.map((area, i) => (
              <div
                key={area.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium"
                style={{ borderColor: CHART_COLORS[i], color: CHART_COLORS[i] }}
              >
                {area.name}
                {selectedAreas.length > 1 && (
                  <button onClick={() => removeArea(area.id)} className="hover:opacity-70">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {selectedAreas.length < 4 && (
              <div className="relative">
                <button
                  onClick={() => setShowSelector(!showSelector)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-gray-300 text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600"
                >
                  <Plus className="w-3.5 h-3.5" /> Add area
                </button>
                {showSelector && (
                  <div className="absolute top-full mt-1 left-0 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50 flex flex-col max-h-[360px]">
                    <div className="p-2 border-b border-gray-100 shrink-0">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={areaSearch}
                          onChange={(e) => setAreaSearch(e.target.value)}
                          placeholder="Search LGAs..."
                          className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {groupedAvailableLGAs.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-gray-500">No areas found</p>
                      ) : (
                        groupedAvailableLGAs.map(({ region, areas }) => (
                          <div key={region}>
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 sticky top-0">
                              {region}
                              <span className="ml-1.5 font-normal normal-case">({areas.length})</span>
                            </div>
                            {areas.map((area) => (
                              <button
                                key={area.id}
                                onClick={() => addArea(area)}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors text-gray-700"
                              >
                                {area.name}
                              </button>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {selectedAreas.length >= 2 && (
          <>
            {/* Comparison Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left text-sm font-semibold text-gray-600 px-4 py-3 w-1/4">Indicator</th>
                    {selectedAreas.map((area, i) => (
                      <th key={area.id} className="text-right text-sm font-semibold px-4 py-3" style={{ color: CHART_COLORS[i] }}>
                        {area.name}
                        {areasData[i]?.hasLiveData && (
                          <span className="ml-1 text-xs font-normal text-emerald-600">● live</span>
                        )}
                      </th>
                    ))}
                    <th className="text-right text-sm font-semibold text-gray-400 px-4 py-3">Benchmark</th>
                  </tr>
                </thead>
                <tbody>
                  {indicators.map(ind => (
                    <tr key={ind.label} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-700">{ind.label}</td>
                      {areasData.map((d, i) => {
                        const val = ind.getValue(d);
                        return (
                          <td key={d.area.id} className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm font-semibold text-gray-900">{ind.format(val)}</span>
                              {ind.benchmark > 0 && <ChangeIndicator value={val} benchmark={ind.benchmark} />}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right text-sm text-gray-400">
                        {ind.benchmark > 0 ? ind.format(ind.benchmark) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mode Share Comparison Chart */}
            <ChartWrapper
              title="Journey to Work Mode Share Comparison"
              subtitle={`Census ${selectedYear}`}
              data={modeShareComparison}
              dataKeys={['Car', 'Train', 'Bus', 'Active', 'WFH']}
            >
              <NeedsBarChart
                data={modeShareComparison}
                dataKeys={['Car', 'Train', 'Bus', 'Active', 'WFH']}
                colors={[CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2], CHART_COLORS[3], CHART_COLORS[4]]}
                height={350}
              />
            </ChartWrapper>

            {/* NSW DPE Population Projection Comparison */}
            {areasData.some(d => d.growth.hasNSWData) && (
              <ChartWrapper
                title="Population Projection Comparison (NSW DPE)"
                subtitle="Annual projections 2021–2041 by LGA"
                data={projectionComparisonData}
                dataKeys={areasData.map(d => d.area.name.length > 15 ? d.area.name.substring(0, 15) + '…' : d.area.name)}
              >
                <NeedsBarChart
                  data={projectionComparisonData}
                  dataKeys={areasData.map(d => d.area.name.length > 15 ? d.area.name.substring(0, 15) + '…' : d.area.name)}
                  colors={CHART_COLORS}
                  height={350}
                />
              </ChartWrapper>
            )}
          </>
        )}

        {selectedAreas.length < 2 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">Select at least 2 areas to compare</p>
          </div>
        )}
      </div>
    </div>
  );
}
