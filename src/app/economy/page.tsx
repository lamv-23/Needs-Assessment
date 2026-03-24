'use client';

import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import { useAppStore } from '@/store';
import { getEconomyData } from '@/lib/data/sample-data';
import { formatNumber, formatPercent, formatCurrency, CHART_COLORS } from '@/lib/utils';
import NeedsBarChart from '@/components/charts/BarChart';
import NeedsLineChart from '@/components/charts/LineChart';

export default function EconomyPage() {
  const { selectedArea, selectedYear } = useAppStore();

  const areaId = selectedArea?.id ?? 'lga_sydney';
  const data = getEconomyData(areaId, selectedYear);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Economy & Employment" />

      <main className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Unemployment Rate"
            value={formatPercent(data.unemploymentRate)}
          />
          <StatCard
            label="Participation Rate"
            value={formatPercent(data.participationRate)}
          />
          <StatCard
            label="Median Weekly Income"
            value={formatCurrency(data.medianWeeklyIncome)}
          />
          <StatCard
            label="Job Density"
            value={data.jobDensity.toFixed(2)}
            subtitle="Jobs per resident worker"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartWrapper
            title="Employment by Industry"
            subtitle="Share of employed persons (%)"
          >
            <NeedsBarChart
              data={data.employmentByIndustry}
              dataKeys={['value']}
              colors={[CHART_COLORS[0]]}
              layout="horizontal"
              xAxisLabel="Percentage (%)"
              yAxisLabel="Industry"
              height={400}
            />
          </ChartWrapper>

          <ChartWrapper
            title="Employment Trend"
            subtitle="Employed and unemployed persons over time"
          >
            <NeedsLineChart
              data={data.employmentTrend}
              dataKeys={['employed', 'unemployed']}
              colors={[CHART_COLORS[2], CHART_COLORS[1]]}
              xAxisKey="year"
              xAxisLabel="Year"
              yAxisLabel="Persons"
              height={400}
            />
          </ChartWrapper>
        </div>
      </main>
    </div>
  );
}
