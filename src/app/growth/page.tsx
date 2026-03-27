'use client';

import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsLineChart from '@/components/charts/LineChart';
import NeedsBarChart from '@/components/charts/BarChart';
import { useAppStore } from '@/store';
import { formatNumber, CHART_COLORS } from '@/lib/utils';
import { Users, TrendingUp, Target, BarChart3, Briefcase } from 'lucide-react';
import { useLiveData } from '@/hooks/useLiveData';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';

export default function GrowthPage() {
  const { selectedArea } = useAppStore();

  const area = selectedArea ?? { id: 'lga_sydney', name: 'City of Sydney', type: 'lga' as const };
  const areaId = area.id;

  // Use current year (irrelevant for growth — projections are 2021–2041)
  const { growth: { data, meta } } = useLiveData(areaId, 2021);

  // Population timeline: historical before 2021 + projections 2021–2041
  const historicalBefore2021 = data.populationHistory.filter((d: { year: number; population: number }) => d.year < 2021);
  const populationTimeline = [...historicalBefore2021, ...data.populationProjections];

  // Current population
  const currentPop = data.populationHistory.length > 0
    ? data.populationHistory[data.populationHistory.length - 1].population
    : data.populationProjections.find((d: { year: number; population: number }) => d.year === 2021)?.population ?? 0;

  const projected2041 = data.populationProjections.find((d: { year: number; population: number }) => d.year === 2041)?.population ?? 0;

  // Employment projections
  const employmentBase2021 = data.employmentGrowth.find((d: { year: number; jobs: number }) => d.year === 2021)?.jobs ?? 0;
  const employmentProjected2041 = data.employmentGrowth.find((d: { year: number; jobs: number }) => d.year === 2041)?.jobs ?? 0;

  const employmentGrowthRate = employmentBase2021 > 0 && employmentProjected2041 > 0
    ? Math.round(((employmentProjected2041 / employmentBase2021) ** (1 / 20) - 1) * 1000) / 10
    : 0;

  return (
    <div>
      <Header
        title="Growth & Projections"
        subtitle={`${area.name} — Historical & Projected Data`}
      />

      <div className="p-6 space-y-6">
        {/* Data source attribution — always visible */}
        <DataSourceBadge meta={meta} />

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Population (2021)"
            value={formatNumber(currentPop)}
            subtitle={meta.liveFields.includes('populationProjections') ? 'NSW DPE Projection base' : '2021 (indicative)'}
          />
          <StatCard
            icon={TrendingUp}
            label="Annual Growth Rate"
            value={`${data.annualGrowthRate}%`}
            subtitle="Historical average"
          />
          <StatCard
            icon={Target}
            label="Projected Growth Rate (p.a.)"
            value={`${data.projectedGrowthRate}%`}
            subtitle={meta.liveFields.includes('populationProjections') ? 'NSW DPE 2021–2041' : 'Indicative'}
          />
          <StatCard
            icon={BarChart3}
            label="Projected 2041 Population"
            value={formatNumber(projected2041)}
            subtitle={meta.liveFields.includes('populationProjections') ? 'NSW DPE' : 'Indicative'}
          />
          <StatCard
            icon={Briefcase}
            label="Employment (2021)"
            value={formatNumber(employmentBase2021)}
            subtitle={meta.liveFields.includes('employmentGrowth') ? 'TfNSW TZP24' : 'Indicative'}
          />
          <StatCard
            icon={TrendingUp}
            label="Employment Growth Rate (p.a.)"
            value={`${employmentGrowthRate}%`}
            subtitle={meta.liveFields.includes('employmentGrowth') ? 'TfNSW 2021–2041' : 'N/A'}
          />
          <StatCard
            icon={Briefcase}
            label="Projected 2041 Employment"
            value={formatNumber(employmentProjected2041)}
            subtitle={meta.liveFields.includes('employmentGrowth') ? 'TfNSW Projection' : 'N/A'}
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Population Growth & Projections - full width */}
          <ChartWrapper
            title="Population Growth & Projections"
            subtitle={meta.liveFields.includes('populationProjections')
              ? 'NSW DPE projections 2021–2041 (annual) with historical data'
              : 'Historical census data and future projections (indicative)'}
            className="lg:col-span-2"
          >
            <NeedsLineChart
              data={populationTimeline}
              dataKeys={['population']}
              colors={[CHART_COLORS[0]]}
              xAxisKey="year"
              height={400}
            />
          </ChartWrapper>

          {/* Employment Growth - full width */}
          <ChartWrapper
            title="Employment Growth & Projections"
            subtitle={meta.liveFields.includes('employmentGrowth')
              ? 'TfNSW employment projections 2021–2041 (annual)'
              : 'Historical and projected employment (indicative)'}
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

          {/* Growth Rate Comparison */}
          <ChartWrapper
            title="Population vs Employment Growth"
            subtitle="Annual growth rate comparison (2021–2041)"
            className="lg:col-span-2"
          >
            <NeedsBarChart
              data={[
                { category: 'Population', growth: data.projectedGrowthRate },
                { category: 'Employment', growth: employmentGrowthRate },
              ]}
              dataKeys={['growth']}
              colors={[CHART_COLORS[3]]}
              height={300}
            />
          </ChartWrapper>
        </div>
      </div>
    </div>
  );
}

