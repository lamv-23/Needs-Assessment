'use client';

import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import { useAppStore } from '@/store';
import { getEducationData } from '@/lib/data/sample-data';
import { formatNumber, formatPercent, CHART_COLORS } from '@/lib/utils';
import NeedsBarChart from '@/components/charts/BarChart';
import NeedsLineChart from '@/components/charts/LineChart';

export default function EducationPage() {
  const { selectedArea, selectedYear } = useAppStore();

  const areaId = selectedArea?.id ?? 'lga_sydney';
  const data = getEducationData(areaId, selectedYear);

  // Find the top attainment level
  const topAttainment = data.attainment.reduce((max, item) =>
    item.value > max.value ? item : max
  , data.attainment[0]);

  // Total school enrolment
  const totalEnrolment = data.schoolEnrolment.reduce(
    (sum, item) => sum + item.value,
    0
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Education" />

      <main className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard
            label={`Top Attainment: ${topAttainment.name}`}
            value={formatPercent(topAttainment.value)}
            subtitle="Highest share of population"
          />
          <StatCard
            label="Total School Enrolment"
            value={formatNumber(totalEnrolment)}
            subtitle="Across all education levels"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartWrapper
            title="Educational Attainment"
            subtitle="Population share by qualification level (%)"
          >
            <NeedsBarChart
              data={data.attainment}
              dataKeys={['value']}
              colors={[CHART_COLORS[4]]}
              layout="horizontal"
              xAxisLabel="Percentage (%)"
              yAxisLabel="Qualification"
              height={350}
            />
          </ChartWrapper>

          <ChartWrapper
            title="School Enrolment"
            subtitle="Number of students by education level"
          >
            <NeedsBarChart
              data={data.schoolEnrolment}
              dataKeys={['value']}
              colors={[CHART_COLORS[0]]}
              xAxisLabel="Level"
              yAxisLabel="Students"
              height={350}
            />
          </ChartWrapper>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <ChartWrapper
            title="Qualification Trends"
            subtitle="Percentage of population with qualifications over time"
          >
            <NeedsLineChart
              data={data.qualificationTrend}
              dataKeys={['bachelor', 'diploma', 'certificate']}
              colors={[CHART_COLORS[0], CHART_COLORS[3], CHART_COLORS[2]]}
              xAxisKey="year"
              xAxisLabel="Year"
              yAxisLabel="Percentage (%)"
              height={400}
            />
          </ChartWrapper>
        </div>
      </main>
    </div>
  );
}
