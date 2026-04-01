'use client';

import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import { useAppStore } from '@/store';
import { formatPercent, formatCurrency, CHART_COLORS } from '@/lib/utils';
import NeedsBarChart from '@/components/charts/BarChart';
import NeedsLineChart from '@/components/charts/LineChart';
import { useLiveData } from '@/hooks/useLiveData';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';
import { getEmployed2021 } from '@/lib/data/economy-helpers';

export default function EconomyPage() {
  const { selectedArea, selectedYear } = useAppStore();

  const areaId = selectedArea?.id ?? 'lga_sydney';
  const year = selectedYear;

  const { economy: { data, meta } } = useLiveData(areaId, year);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Economy & Employment" />

      <main className="p-6 space-y-6">
        {/* Data source attribution — always visible */}
        <DataSourceBadge meta={meta} />

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Unemployment Rate"
            value={formatPercent(data.unemploymentRate)}
            subtitle={meta.liveFields.includes('unemploymentRate') ? 'ABS Data by Region' : 'Indicative'}
          />
          <StatCard
            label="Participation Rate"
            value={formatPercent(data.participationRate)}
            subtitle={meta.liveFields.includes('participationRate') ? 'ABS Data by Region' : 'Indicative'}
          />
          <StatCard
            label="Median Weekly Income"
            value={formatCurrency(data.medianWeeklyIncome)}
            subtitle={meta.liveFields.includes('medianWeeklyIncome') ? 'ABS 2021 Census' : 'Indicative'}
          />
          <StatCard
            label="Job Density"
            value={data.jobDensity.toFixed(2)}
            subtitle="Jobs per resident worker (indicative)"
          />
          {data.employmentTrend.length > 0 && (
            <StatCard
              label="Employed (2021)"
              value={getEmployed2021(data.employmentTrend)?.toLocaleString() ?? '—'}
              subtitle={meta.liveFields.includes('employmentTrend') ? 'TfNSW TZP24 baseline' : 'Indicative'}
            />
          )}
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
            title={meta.liveFields.includes('employmentTrend') ? 'Employment Projections (TZP24)' : 'Employment Trend'}
            subtitle={meta.liveFields.includes('employmentTrend')
              ? 'Employed persons by place of work — TfNSW TZP24 (2021–2041)'
              : 'Employed and unemployed persons over time (indicative)'}
          >
            <NeedsLineChart
              data={data.employmentTrend}
              dataKeys={meta.liveFields.includes('employmentTrend') ? ['employed'] : ['employed', 'unemployed']}
              colors={[CHART_COLORS[2], CHART_COLORS[1]]}
              xAxisKey="year"
              xAxisLabel="Year"
              yAxisLabel="Employed Persons"
              height={400}
            />
          </ChartWrapper>

          {/* Occupation by Group — only shown when ABS G60 data is available */}
          {(data.occupationByGroup?.length ?? 0) > 0 && (
            <ChartWrapper
              title="Occupation by Group"
              subtitle="Employed persons by occupation group (ABS Census 2021)"
              className="lg:col-span-2"
            >
              <NeedsBarChart
                data={data.occupationByGroup!.map(o => ({ name: o.name, value: o.employed }))}
                dataKeys={['value']}
                colors={[CHART_COLORS[4]]}
                layout="horizontal"
                xAxisLabel="Employed Persons"
                yAxisLabel="Occupation Group"
                height={400}
              />
            </ChartWrapper>
          )}

          {/* Household Income Distribution — only shown when ABS G33_INCOME data is available */}
          {(data.householdIncomeDistribution?.length ?? 0) > 0 && (
            <ChartWrapper
              title="Household Income Distribution"
              subtitle="Number of households by weekly income range (ABS Census 2021)"
              className="lg:col-span-2"
            >
              <NeedsBarChart
                data={data.householdIncomeDistribution!.map(h => ({ name: h.label, value: h.count }))}
                dataKeys={['value']}
                colors={[CHART_COLORS[1]]}
                layout="vertical"
                xAxisLabel="Weekly Income Range"
                yAxisLabel="Number of Households"
                height={400}
              />
            </ChartWrapper>
          )}
        </div>
      </main>
    </div>
  );
}
