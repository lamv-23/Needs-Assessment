'use client';

import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsBarChart from '@/components/charts/BarChart';
import NeedsPieChart from '@/components/charts/PieChart';
import NeedsLineChart from '@/components/charts/LineChart';
import { useAppStore } from '@/store';
import { getTransportData } from '@/lib/data/sample-data';
import { formatNumber, formatPercent, CHART_COLORS } from '@/lib/utils';
import { Clock, Train, Car, Bus } from 'lucide-react';

const DEFAULT_AREA = { id: 'lga_sydney', name: 'City of Sydney' };

export default function TransportPage() {
  const { selectedArea, selectedYear } = useAppStore();

  const area = selectedArea ?? DEFAULT_AREA;
  const areaId = area.id;
  const year = selectedYear;

  const data = getTransportData(areaId, year);

  // Calculate car and PT mode shares from journey to work data
  const carModes = data.journeyToWork.filter(
    (m) => m.name.startsWith('Car')
  );
  const carModeShare = carModes.reduce((sum, m) => sum + m.value, 0);

  const ptModes = data.journeyToWork.filter((m) =>
    ['Train', 'Bus', 'Ferry'].includes(m.name)
  );
  const ptModeShare = ptModes.reduce((sum, m) => sum + m.value, 0);

  return (
    <div>
      <Header
        title="Transport & Commuting"
        subtitle={`${area.name} — ${year} Census Data`}
      />

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Clock}
            label="Average Commute Time"
            value={`${data.avgCommute}`}
            subtitle="Minutes (one way)"
          />
          <StatCard
            icon={Train}
            label="PT Annual Patronage"
            value={formatNumber(data.ptPatronage)}
            subtitle="Estimated annual trips"
          />
          <StatCard
            icon={Car}
            label="Car Mode Share"
            value={formatPercent(carModeShare)}
            subtitle="Driver + passenger combined"
          />
          <StatCard
            icon={Bus}
            label="Public Transport Mode Share"
            value={formatPercent(ptModeShare)}
            subtitle="Train + bus + ferry"
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Journey to Work - full width */}
          <ChartWrapper
            title="Journey to Work — Mode Share"
            subtitle="Percentage of workers by transport mode"
            className="lg:col-span-2"
          >
            <NeedsBarChart
              data={data.journeyToWork}
              dataKeys={['value']}
              colors={CHART_COLORS}
              layout="vertical"
              xAxisLabel="Mode Share (%)"
              yAxisLabel="Transport Mode"
              height={400}
            />
          </ChartWrapper>

          {/* Mode Share Trend */}
          <ChartWrapper
            title="Mode Share Trend"
            subtitle="Change in transport modes across census years"
          >
            <NeedsLineChart
              data={data.modeShareTrend.map((d) => ({ ...d, name: String(d.year) }))}
              dataKeys={['car', 'train', 'bus', 'active', 'wfh']}
              colors={[
                CHART_COLORS[0],
                CHART_COLORS[2],
                CHART_COLORS[3],
                CHART_COLORS[4],
                CHART_COLORS[6],
              ]}
              xAxisLabel="Year"
              yAxisLabel="Mode Share (%)"
              height={350}
            />
          </ChartWrapper>

          {/* Vehicle Ownership */}
          <ChartWrapper
            title="Vehicle Ownership"
            subtitle="Households by number of vehicles"
          >
            <NeedsPieChart
              data={data.vehicleOwnership}
              colors={CHART_COLORS}
              showLabels
              height={350}
            />
          </ChartWrapper>
        </div>
      </div>
    </div>
  );
}
