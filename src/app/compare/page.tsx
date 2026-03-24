'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsBarChart from '@/components/charts/BarChart';
import { useAppStore } from '@/store';
import { SAMPLE_AREAS, GREATER_SYDNEY_BENCHMARK } from '@/lib/data/sample-areas';
import {
  getDemographicsData,
  getTransportData,
  getEconomyData,
  getHousingData,
  getGrowthData,
} from '@/lib/data/sample-data';
import { formatNumber, formatPercent, formatCurrency, CHART_COLORS } from '@/lib/utils';
import { Plus, X, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
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
  };

  const removeArea = (areaId: string) => {
    setSelectedAreas(selectedAreas.filter(a => a.id !== areaId));
  };

  const areasData = selectedAreas.map(area => ({
    area,
    demographics: getDemographicsData(area.id, selectedYear),
    transport: getTransportData(area.id, selectedYear),
    economy: getEconomyData(area.id, selectedYear),
    housing: getHousingData(area.id, selectedYear),
    growth: getGrowthData(area.id),
  }));

  const benchmarkDemo = getDemographicsData(GREATER_SYDNEY_BENCHMARK.id, selectedYear);
  const benchmarkTransport = getTransportData(GREATER_SYDNEY_BENCHMARK.id, selectedYear);
  const benchmarkEconomy = getEconomyData(GREATER_SYDNEY_BENCHMARK.id, selectedYear);

  // Comparison indicators
  const indicators = [
    { label: 'Total Population', getValue: (d: typeof areasData[0]) => d.demographics.totalPopulation, format: formatNumber, benchmark: benchmarkDemo.totalPopulation },
    { label: 'Median Age', getValue: (d: typeof areasData[0]) => d.demographics.medianAge, format: (v: number) => v.toFixed(1), benchmark: benchmarkDemo.medianAge },
    { label: 'SEIFA Score', getValue: (d: typeof areasData[0]) => d.demographics.seifaScore, format: (v: number) => v.toString(), benchmark: benchmarkDemo.seifaScore },
    { label: 'Car Mode Share (%)', getValue: (d: typeof areasData[0]) => d.transport.journeyToWork[0].value, format: (v: number) => formatPercent(v), benchmark: benchmarkTransport.journeyToWork[0].value },
    { label: 'PT Mode Share (%)', getValue: (d: typeof areasData[0]) => d.transport.journeyToWork[2].value + d.transport.journeyToWork[3].value, format: (v: number) => formatPercent(v), benchmark: benchmarkTransport.journeyToWork[2].value + benchmarkTransport.journeyToWork[3].value },
    { label: 'Avg Commute (min)', getValue: (d: typeof areasData[0]) => d.transport.avgCommute, format: (v: number) => v.toString(), benchmark: benchmarkTransport.avgCommute },
    { label: 'Unemployment (%)', getValue: (d: typeof areasData[0]) => d.economy.unemploymentRate, format: (v: number) => formatPercent(v), benchmark: benchmarkEconomy.unemploymentRate },
    { label: 'Median Income ($/wk)', getValue: (d: typeof areasData[0]) => d.economy.medianWeeklyIncome, format: (v: number) => formatCurrency(v), benchmark: benchmarkEconomy.medianWeeklyIncome },
    { label: 'Median Rent ($/wk)', getValue: (d: typeof areasData[0]) => d.housing.medianWeeklyRent, format: (v: number) => formatCurrency(v), benchmark: 0 },
    { label: 'Growth Rate (%/yr)', getValue: (d: typeof areasData[0]) => d.growth.annualGrowthRate, format: (v: number) => formatPercent(v), benchmark: 0 },
  ];

  // Chart data for mode share comparison
  const modeShareComparison = selectedAreas.map(area => {
    const t = getTransportData(area.id, selectedYear);
    return {
      name: area.name.length > 15 ? area.name.substring(0, 15) + '...' : area.name,
      'Car': t.journeyToWork[0].value,
      'Train': t.journeyToWork[2].value,
      'Bus': t.journeyToWork[3].value,
      'Active': t.journeyToWork[5].value + t.journeyToWork[6].value,
      'WFH': t.journeyToWork[7].value,
    };
  });

  const availableLGAs = SAMPLE_AREAS.filter(a => a.type === 'lga' && !selectedAreas.find(s => s.id === a.id));

  return (
    <div>
      <Header title="Compare Areas" subtitle="Side-by-side comparison with Greater Sydney benchmark" />

      <div className="p-6 space-y-6">
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
                <button onClick={() => removeArea(area.id)} className="hover:opacity-70">
                  <X className="w-3.5 h-3.5" />
                </button>
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
                  <div className="absolute top-full mt-1 left-0 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-[300px] overflow-y-auto">
                    {availableLGAs.map(area => (
                      <button
                        key={area.id}
                        onClick={() => addArea(area)}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                      >
                        {area.name}
                      </button>
                    ))}
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
            <ChartWrapper title="Journey to Work Mode Share Comparison" subtitle={`Census ${selectedYear}`}>
              <NeedsBarChart
                data={modeShareComparison}
                dataKeys={['Car', 'Train', 'Bus', 'Active', 'WFH']}
                colors={[CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2], CHART_COLORS[3], CHART_COLORS[4]]}
                height={350}
              />
            </ChartWrapper>
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
