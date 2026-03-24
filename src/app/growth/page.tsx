'use client';

import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsLineChart from '@/components/charts/LineChart';
import NeedsBarChart from '@/components/charts/BarChart';
import { useAppStore } from '@/store';
import { getGrowthData } from '@/lib/data/sample-data';
import { formatNumber, CHART_COLORS } from '@/lib/utils';
import { Users, TrendingUp, Target, BarChart3 } from 'lucide-react';

const DEFAULT_AREA = { id: 'lga_sydney', name: 'City of Sydney', type: 'lga' as const };

export default function GrowthPage() {
  const { selectedArea } = useAppStore();

  const area = selectedArea ?? DEFAULT_AREA;
  const areaId = area.id;

  const data = getGrowthData(areaId);

  // Current population is the 2021 figure from history
  const currentPop = data.populationHistory.find((d) => d.year === 2021)?.population ?? 0;

  // Projected 2041 population
  const projected2041 = data.populationProjections.find((d) => d.year === 2041)?.population ?? 0;

  // Combined population timeline for the chart
  const populationTimeline = [...data.populationHistory, ...data.populationProjections];

  return (
    <div>
      <Header
        title="Growth & Projections"
        subtitle={`${area.name} — Historical & Projected Data`}
      />

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Current Population (2021)"
            value={formatNumber(currentPop)}
          />
          <StatCard
            icon={TrendingUp}
            label="Annual Growth Rate"
            value={`${data.annualGrowthRate}%`}
            subtitle="Historical average"
          />
          <StatCard
            icon={Target}
            label="Projected Growth Rate"
            value={`${data.projectedGrowthRate}%`}
            subtitle="Future annual average"
          />
          <StatCard
            icon={BarChart3}
            label="Projected 2041 Population"
            value={formatNumber(projected2041)}
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Population Growth & Projections - full width */}
          <ChartWrapper
            title="Population Growth & Projections"
            subtitle="Historical census data and future projections (dashed line marks 2021 boundary)"
            className="lg:col-span-2"
          >
            <div className="relative">
              <NeedsLineChart
                data={populationTimeline}
                dataKeys={['population']}
                colors={[CHART_COLORS[0]]}
                xAxisKey="year"
                height={400}
              />
              {/* Annotation for historical vs projected boundary */}
              <div className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none">
                <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-6 h-0.5 bg-blue-500" />
                    Historical
                  </span>
                  <span className="border-l border-dashed border-gray-400 h-4" />
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-6 h-0.5 bg-blue-500 border-dashed" style={{ borderTop: '2px dashed #3b82f6', height: 0 }} />
                    Projected
                  </span>
                </div>
              </div>
            </div>
          </ChartWrapper>

          {/* Employment Growth - full width */}
          <ChartWrapper
            title="Employment Growth"
            subtitle="Historical and projected employment (number of jobs)"
            className="lg:col-span-2"
          >
            <NeedsLineChart
              data={data.employmentGrowth}
              dataKeys={['jobs']}
              colors={[CHART_COLORS[2]]}
              xAxisKey="year"
              height={350}
            />
          </ChartWrapper>
        </div>
      </div>
    </div>
  );
}
