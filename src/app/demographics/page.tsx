'use client';

import dynamic from 'next/dynamic';
import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsBarChart from '@/components/charts/BarChart';
import NeedsPieChart from '@/components/charts/PieChart';
import PopulationPyramid from '@/components/charts/PopulationPyramid';
import { useAppStore } from '@/store';
import { getDemographicsData } from '@/lib/data/sample-data';
import { formatNumber, formatPercent, CHART_COLORS } from '@/lib/utils';
import { Users, Calendar, ShieldCheck, MapPin } from 'lucide-react';

const ChoroplethMap = dynamic(() => import('@/components/maps/ChoroplethMap'), {
  ssr: false,
});

const DEFAULT_AREA = { id: 'lga_sydney', name: 'City of Sydney' };

export default function DemographicsPage() {
  const { selectedArea, selectedYear } = useAppStore();

  const area = selectedArea ?? DEFAULT_AREA;
  const areaId = area.id;
  const year = selectedYear;

  const data = getDemographicsData(areaId, year);

  return (
    <div>
      <Header
        title="Population & Demographics"
        subtitle={`${area.name} — ${year} Census Data`}
      />

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Total Population"
            value={formatNumber(data.totalPopulation)}
            subtitle={`${formatNumber(data.malePopulation)} male / ${formatNumber(data.femalePopulation)} female`}
          />
          <StatCard
            icon={Calendar}
            label="Median Age"
            value={data.medianAge.toFixed(1)}
            subtitle="Years"
          />
          <StatCard
            icon={ShieldCheck}
            label="SEIFA Score"
            value={formatNumber(data.seifaScore)}
            subtitle="Index of Relative Socio-economic Disadvantage"
          />
          <StatCard
            icon={MapPin}
            label="Population Density"
            value={formatNumber(data.populationDensity)}
            subtitle="Persons per km²"
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Population Pyramid - full width */}
          <ChartWrapper
            title="Population Pyramid"
            subtitle="Age and sex distribution"
            className="lg:col-span-2"
          >
            <PopulationPyramid data={data.ageDistribution} height={400} />
          </ChartWrapper>

          {/* Country of Birth */}
          <ChartWrapper
            title="Country of Birth"
            subtitle="Top countries of birth for residents"
          >
            <NeedsPieChart
              data={data.countriesOfBirth}
              colors={CHART_COLORS}
              showLabels
              height={350}
            />
          </ChartWrapper>

          {/* Household Composition */}
          <ChartWrapper
            title="Household Composition"
            subtitle="Percentage of households by type"
          >
            <NeedsBarChart
              data={data.householdComposition}
              dataKeys={['value']}
              colors={[CHART_COLORS[0]]}
              layout="horizontal"
              xAxisLabel="Household Type"
              yAxisLabel="Percentage (%)"
              height={350}
            />
          </ChartWrapper>
        </div>
      </div>
    </div>
  );
}
