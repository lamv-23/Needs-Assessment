'use client';

import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsPieChart from '@/components/charts/PieChart';
import NeedsLineChart from '@/components/charts/LineChart';
import { useAppStore } from '@/store';
import { getHousingData } from '@/lib/data/sample-data';
import { formatNumber, formatCurrency, CHART_COLORS } from '@/lib/utils';
import { Home, DollarSign, Building2, Key } from 'lucide-react';

const DEFAULT_AREA = { id: 'lga_sydney', name: 'City of Sydney', type: 'lga' as const };

export default function HousingPage() {
  const { selectedArea, selectedYear } = useAppStore();

  const area = selectedArea ?? DEFAULT_AREA;
  const areaId = area.id;
  const year = selectedYear;

  const data = getHousingData(areaId, year);

  // Find the top dwelling type and top tenure type by value
  const topDwelling = data.dwellingTypes.reduce((max, d) => (d.value > max.value ? d : max), data.dwellingTypes[0]);
  const topTenure = data.tenure.reduce((max, t) => (t.value > max.value ? t : max), data.tenure[0]);

  return (
    <div>
      <Header
        title="Housing & Land Use"
        subtitle={`${area.name} — ${year} Census Data`}
      />

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={DollarSign}
            label="Median Weekly Rent"
            value={formatCurrency(data.medianWeeklyRent)}
            subtitle="Per week"
          />
          <StatCard
            icon={Home}
            label="Median House Price"
            value={formatCurrency(data.medianHousePrice)}
          />
          <StatCard
            icon={Building2}
            label="Top Dwelling Type"
            value={`${topDwelling.name} (${topDwelling.value}%)`}
            subtitle="Most common dwelling structure"
          />
          <StatCard
            icon={Key}
            label="Top Tenure Type"
            value={`${topTenure.name} (${topTenure.value}%)`}
            subtitle="Most common tenure arrangement"
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Dwelling Types */}
          <ChartWrapper
            title="Dwelling Types"
            subtitle="Distribution of dwelling structures"
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
          >
            <NeedsPieChart
              data={data.tenure}
              colors={CHART_COLORS.slice(4)}
              showLabels
              height={350}
            />
          </ChartWrapper>

          {/* Housing Stock Trend - full width */}
          <ChartWrapper
            title="Housing Stock Trend"
            subtitle="Change in housing stock over census years"
            className="lg:col-span-2"
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
