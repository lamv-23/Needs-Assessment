'use client';

import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsBarChart from '@/components/charts/BarChart';
import NeedsPieChart from '@/components/charts/PieChart';
import NeedsLineChart from '@/components/charts/LineChart';
import { useAppStore } from '@/store';
import { getTransportMetricsForArea, getLatestTransportMetrics, TRANSPORT_DATA_NOTE } from '@/lib/data/tfnsw-transport';
import { formatNumber, formatPercent, CHART_COLORS } from '@/lib/utils';
import { Clock, Train, Car, Bus, TrendingDown } from 'lucide-react';
import { useLiveData } from '@/hooks/useLiveData';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';

export default function TransportPage() {
  const { selectedArea, selectedYear } = useAppStore();

  const area = selectedArea ?? { id: 'lga_sydney', name: 'City of Sydney' };
  const areaId = area.id;
  const year = selectedYear;

  const { transport: { data, meta } } = useLiveData(areaId, year);

  // Static TfNSW transport metrics (from bundled data until TfNSW API key is set)
  const tfnswMetrics = getTransportMetricsForArea(areaId);
  const hasTfnswData = tfnswMetrics.length > 0;
  const latestTfnswMetrics = getLatestTransportMetrics(areaId);

  // Calculate car and PT mode shares from journey to work data
  const carModeShare = data.journeyToWork
    .filter((m: { name: string; value: number }) => m.name.startsWith('Car'))
    .reduce((sum: number, m: { name: string; value: number }) => sum + m.value, 0);

  const ptModeShare = data.journeyToWork
    .filter((m: { name: string; value: number }) => ['Train', 'Bus', 'Ferry'].includes(m.name))
    .reduce((sum: number, m: { name: string; value: number }) => sum + m.value, 0);

  return (
    <div>
      <Header
        title="Transport & Commuting"
        subtitle={`${area.name} — ${year}`}
      />

      <div className="p-6 space-y-6">
        {/* Data source attribution — always visible */}
        <DataSourceBadge meta={meta} />

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Clock}
            label="Average Commute Time"
            value={latestTfnswMetrics ? `${latestTfnswMetrics.averageCommuteTime} min` : `${data.avgCommute}`}
            subtitle={hasTfnswData ? `Modelled estimate (${tfnswMetrics[tfnswMetrics.length - 1]?.year})` : "Minutes (one way)"}
          />
          <StatCard
            icon={Train}
            label="PT Patronage"
            value={latestTfnswMetrics ? `${(latestTfnswMetrics.ptPatronagePerCapita).toFixed(1)}` : formatNumber(data.ptPatronage)}
            subtitle={hasTfnswData ? "Trips per capita per day (modelled)" : "Estimated annual trips"}
          />
          <StatCard
            icon={Car}
            label="Car Mode Share"
            value={latestTfnswMetrics ? `${latestTfnswMetrics.modeShareCar.toFixed(1)}%` : formatPercent(carModeShare)}
            subtitle={hasTfnswData ? `Modelled estimate (${tfnswMetrics[tfnswMetrics.length - 1]?.year})` : "Driver + passenger"}
          />
          <StatCard
            icon={Bus}
            label="Public Transport Mode Share"
            value={latestTfnswMetrics ? `${latestTfnswMetrics.modeSharePT.toFixed(1)}%` : formatPercent(ptModeShare)}
            subtitle={hasTfnswData ? `Modelled estimate (${tfnswMetrics[tfnswMetrics.length - 1]?.year})` : "Train + bus + ferry"}
          />
          {hasTfnswData && (
            <StatCard
              icon={TrendingDown}
              label="Active Transport"
              value={`${latestTfnswMetrics?.modeShareActive.toFixed(1)}%`}
              subtitle={`Modelled estimate (${tfnswMetrics[tfnswMetrics.length - 1]?.year})`}
            />
          )}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Journey to Work - full width */}
          <ChartWrapper
            title="Journey to Work — Mode Share"
            subtitle="Percentage of workers by transport mode"
            className="lg:col-span-2"
            data={data.journeyToWork}
            dataKeys={['value']}
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

          {/* TfNSW data disclaimer */}
          {hasTfnswData && (
            <div className="lg:col-span-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="mt-0.5 shrink-0">⚠</span>
              <span>{TRANSPORT_DATA_NOTE}</span>
            </div>
          )}

          {/* TfNSW Mode Share Trends - if available */}
          {hasTfnswData && (
            <ChartWrapper
              title="Mode Share Trends (2019-2026)"
              subtitle="TfNSW Transport Metrics — Modelled trend estimates"
              className="lg:col-span-2"
              data={tfnswMetrics.map(m => ({
                year: m.year,
                'Car': m.modeShareCar,
                'PT': m.modeSharePT,
                'Active': m.modeShareActive,
              }))}
              dataKeys={['Car', 'PT', 'Active']}
              xAxisKey="year"
            >
              <NeedsLineChart
                data={tfnswMetrics.map(m => ({
                  year: m.year,
                  'Car': m.modeShareCar,
                  'PT': m.modeSharePT,
                  'Active': m.modeShareActive,
                }))}
                dataKeys={['Car', 'PT', 'Active']}
                colors={[CHART_COLORS[0], CHART_COLORS[2], CHART_COLORS[5]]}
                xAxisKey="year"
                height={350}
              />
            </ChartWrapper>
          )}

          {/* PT Patronage Trend - if available */}
          {hasTfnswData && (
            <ChartWrapper
              title="PT Patronage Trend (2019-2026)"
              subtitle="Trips per capita per day — historical"
              className="lg:col-span-2"
              data={tfnswMetrics.map(m => ({
                year: m.year,
                'PT Patronage': m.ptPatronagePerCapita,
              }))}
              dataKeys={['PT Patronage']}
              xAxisKey="year"
            >
              <NeedsLineChart
                data={tfnswMetrics.map(m => ({
                  year: m.year,
                  'PT Patronage': m.ptPatronagePerCapita,
                }))}
                dataKeys={['PT Patronage']}
                colors={[CHART_COLORS[2]]}
                xAxisKey="year"
                height={350}
              />
            </ChartWrapper>
          )}

          {/* Commute Time Trend - if available */}
          {hasTfnswData && (
            <ChartWrapper
              title="Average Commute Time (2019-2026)"
              subtitle="TfNSW data — minutes one way"
              className="lg:col-span-2"
              data={tfnswMetrics.map(m => ({
                year: m.year,
                'Commute Time': m.averageCommuteTime,
              }))}
              dataKeys={['Commute Time']}
              xAxisKey="year"
            >
              <NeedsLineChart
                data={tfnswMetrics.map(m => ({
                  year: m.year,
                  'Commute Time': m.averageCommuteTime,
                }))}
                dataKeys={['Commute Time']}
                colors={[CHART_COLORS[1]]}
                xAxisKey="year"
                height={300}
              />
            </ChartWrapper>
          )}

          {/* Mode Share Trend */}
          <ChartWrapper
            title="Mode Share Trend"
            subtitle="Change in transport modes across census years"
            data={data.modeShareTrend.map((d: { year: number; car: number; train: number; bus: number; active: number; wfh: number }) => ({ ...d, name: String(d.year) }))}
            dataKeys={['car', 'train', 'bus', 'active', 'wfh']}
            xAxisKey="year"
          >
            <NeedsLineChart
              data={data.modeShareTrend.map((d: { year: number; car: number; train: number; bus: number; active: number; wfh: number }) => ({ ...d, name: String(d.year) }))}
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
            data={data.vehicleOwnership}
            dataKeys={['value']}
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
