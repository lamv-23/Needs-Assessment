'use client';

import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsBarChart from '@/components/charts/BarChart';
import NeedsPieChart from '@/components/charts/PieChart';
import NeedsLineChart from '@/components/charts/LineChart';
import { useAppStore } from '@/store';
import { formatCurrency, CHART_COLORS } from '@/lib/utils';
import { Home, DollarSign, Building2, Key } from 'lucide-react';
import { useLiveData } from '@/hooks/useLiveData';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';

export default function HousingPage() {
  const { selectedArea, selectedYear } = useAppStore();

  const area = selectedArea ?? { id: 'lga_sydney', name: 'City of Sydney', type: 'lga' as const };
  const areaId = area.id;
  const year = selectedYear;

  const { housing: { data, meta } } = useLiveData(areaId, year);

  // Find the top dwelling type and top tenure type by value
  const topDwelling = data.dwellingTypes.reduce((max, d) => (d.value > max.value ? d : max), data.dwellingTypes[0]);
  const topTenure = data.tenure.reduce((max, t) => (t.value > max.value ? t : max), data.tenure[0]);

  return (
    <div>
      <Header
        title="Housing & Land Use"
        subtitle={`${area.name} — ${year}`}
      />

      <div className="p-6 space-y-6">
        {/* Data source attribution — always visible */}
        <DataSourceBadge meta={meta} />

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={DollarSign}
            label="Median Weekly Rent"
            value={formatCurrency(data.medianWeeklyRent)}
            subtitle={meta.liveFields.includes('medianWeeklyRent') ? 'ABS 2021 Census' : 'Per week (indicative)'}
          />
          <StatCard
            icon={Home}
            label="Median House Price"
            value={formatCurrency(data.medianHousePrice)}
            subtitle="Indicative"
          />
          <StatCard
            icon={Building2}
            label="Top Dwelling Type"
            value={`${topDwelling.name} (${topDwelling.value}%)`}
            subtitle={meta.liveFields.includes('dwellingTypes') ? 'ABS 2021 Census' : 'Most common dwelling structure'}
          />
          <StatCard
            icon={Key}
            label="Top Tenure Type"
            value={`${topTenure.name} (${topTenure.value}%)`}
            subtitle={meta.liveFields.includes('tenure') ? 'ABS 2021 Census' : 'Most common tenure arrangement'}
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Dwelling Types */}
          <ChartWrapper
            title="Dwelling Types"
            subtitle="Distribution of dwelling structures"
            data={data.dwellingTypes}
            dataKeys={['value']}
          >
            <NeedsPieChart
              data={data.dwellingTypes}
              colors={CHART_COLORS}
              showLabels
              height={350}
            />
          </ChartWrapper>

          {/* Tenure */}
          <ChartWrapper
            title="Tenure"
            subtitle="Housing tenure distribution"
            data={data.tenure}
            dataKeys={['value']}
          >
            <NeedsPieChart
              data={data.tenure}
              colors={CHART_COLORS.slice(4)}
              showLabels
              height={350}
            />
          </ChartWrapper>

          {/* Housing Stress — only shown when ABS G43/G44 data is available */}
          {(data.mortgageStressRate !== undefined || data.rentStressRate !== undefined) && (
            <ChartWrapper
              title="Housing Stress"
              subtitle="Households spending 30%+ of income on housing costs (ABS Census 2021)"
              data={[
                ...(data.mortgageStressRate !== undefined ? [{ name: 'Mortgage Stress', value: data.mortgageStressRate }] : []),
                ...(data.rentStressRate !== undefined ? [{ name: 'Rental Stress', value: data.rentStressRate }] : []),
              ]}
              dataKeys={['value']}
            >
              <NeedsBarChart
                data={[
                  ...(data.mortgageStressRate !== undefined ? [{ name: 'Mortgage Stress', value: data.mortgageStressRate }] : []),
                  ...(data.rentStressRate !== undefined ? [{ name: 'Rental Stress', value: data.rentStressRate }] : []),
                ]}
                dataKeys={['value']}
                colors={[CHART_COLORS[5] ?? CHART_COLORS[1]]}
                layout="vertical"
                xAxisLabel="Stress Rate (%)"
                yAxisLabel="Housing Type"
                height={250}
              />
            </ChartWrapper>
          )}

          {/* Housing Stock Trend - full width */}
          <ChartWrapper
            title="Housing Stock Trend"
            subtitle="Change in housing stock over census years"
            className="lg:col-span-2"
            data={data.housingTrend}
            dataKeys={['houses', 'apartments', 'townhouses']}
            xAxisKey="year"
          >
            <NeedsLineChart
              data={data.housingTrend}
              dataKeys={['houses', 'apartments', 'townhouses']}
              colors={[CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2]]}
              xAxisKey="year"
              height={350}
            />
          </ChartWrapper>
        </div>
      </div>
    </div>
  );
}
