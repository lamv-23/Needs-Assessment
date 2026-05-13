'use client';

import Header from '@/components/layout/Header';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';
import { useLiveData } from '@/hooks/useLiveData';
import { useAppStore } from '@/store';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';

type CellValue = string | number | null | undefined;

type SimpleTableProps = {
  title: string;
  columns: string[];
  rows: CellValue[][];
};

function formatCellValue(value: CellValue): string {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'number') return formatNumber(value);
  return value;
}

function SimpleTable({ title, columns, rows }: SimpleTableProps) {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${title}-${rowIndex}`} className="border-b border-gray-100 last:border-b-0">
                {row.map((cell, cellIndex) => (
                  <td key={`${title}-${rowIndex}-${cellIndex}`} className="px-3 py-2 text-gray-700 align-top">
                    {formatCellValue(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryTable({ rows }: { rows: Array<[string, CellValue]> }) {
  return (
    <SimpleTable
      title="Summary"
      columns={['Field', 'Value']}
      rows={rows.map(([label, value]) => [label, value])}
    />
  );
}

function Section({
  title,
  defaultOpen = false,
  meta,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  meta: Parameters<typeof DataSourceBadge>[0]['meta'];
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="bg-white border border-gray-200 rounded-lg">
      <summary className="cursor-pointer px-4 py-3 font-semibold text-gray-900">
        {title}
      </summary>
      <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
        <DataSourceBadge meta={meta} className="mt-4" />
        {children}
      </div>
    </details>
  );
}

export default function DataTablesPage() {
  const { selectedArea, selectedYear } = useAppStore();
  const area = selectedArea ?? SAMPLE_AREAS.find((item) => item.id === 'lga_sydney')!;
  const liveData = useLiveData(area.id, selectedYear);

  const demographics = liveData.demographics.data;
  const transport = liveData.transport.data;
  const economy = liveData.economy.data;
  const education = liveData.education.data;
  const housing = liveData.housing.data;
  const growth = liveData.growth.data;

  return (
    <div>
      <Header
        title="Data Tables"
        subtitle={`Simple tabular view of available values for ${area.name}`}
      />

      <div className="p-6 space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
          This page shows the data already available in the app as simple tables, grouped into collapsible sections.
        </div>

        <Section title="Demographics" defaultOpen meta={liveData.demographics.meta}>
          <SummaryTable
            rows={[
              ['Total population', formatNumber(demographics.totalPopulation)],
              ['Male population', formatNumber(demographics.malePopulation)],
              ['Female population', formatNumber(demographics.femalePopulation)],
              ['Median age', demographics.medianAge],
              ['SEIFA score', demographics.seifaScore],
              ['Population density', demographics.populationDensity !== null ? `${formatNumber(demographics.populationDensity, 1)} persons/km²` : 'N/A'],
              ['English only', demographics.englishOnly !== undefined ? formatPercent(demographics.englishOnly) : 'N/A'],
              ['Limited English', demographics.limitedEnglish !== undefined ? formatPercent(demographics.limitedEnglish) : 'N/A'],
              ['Disability rate', demographics.disabilityRate !== undefined ? formatPercent(demographics.disabilityRate) : 'N/A'],
              ['Needs assistance', demographics.needsAssistance !== undefined ? formatPercent(demographics.needsAssistance) : 'N/A'],
            ]}
          />
          <SimpleTable
            title="Age distribution"
            columns={['Age group', 'Male', 'Female']}
            rows={demographics.ageDistribution.map((item) => [item.ageGroup, item.male, item.female])}
          />
          <SimpleTable
            title="Countries of birth"
            columns={['Group', 'Value']}
            rows={demographics.countriesOfBirth.map((item) => [item.name, item.value])}
          />
          <SimpleTable
            title="Household composition"
            columns={['Group', 'Value']}
            rows={demographics.householdComposition.map((item) => [item.name, item.value])}
          />
          <SimpleTable
            title="Birthplace groups"
            columns={['Code', 'Group', 'Count']}
            rows={(demographics.birthplaceGroups ?? []).map((item) => [item.code, item.name, item.count])}
          />
          <SimpleTable
            title="Language groups"
            columns={['Code', 'Group', 'Count']}
            rows={(demographics.languageGroups ?? []).map((item) => [item.code, item.name, item.count])}
          />
          <SimpleTable
            title="Family composition"
            columns={['Group', 'Value']}
            rows={(demographics.familyComposition ?? []).map((item) => [item.name, item.value])}
          />
        </Section>

        <Section title="Transport" meta={liveData.transport.meta}>
          <SummaryTable
            rows={[
              transport.avgCommute !== null && ['Average commute', `${formatNumber(transport.avgCommute, 1)} min`],
              transport.ptPatronage !== null && ['PT patronage', formatNumber(transport.ptPatronage)],
              ['PT stops total', transport.ptStops?.total ?? 'N/A'],
              ['PT routes total', transport.ptRoutes?.total ?? 'N/A'],
            ].filter(Boolean) as [string, string | number][]}
          />
          <SimpleTable
            title="Journey to work"
            columns={['Mode', 'Value']}
            rows={transport.journeyToWork.map((item) => [item.name, item.value])}
          />
          <SimpleTable
            title="Vehicle ownership"
            columns={['Group', 'Value']}
            rows={transport.vehicleOwnership.map((item) => [item.name, item.value])}
          />
          <SimpleTable
            title="Mode share trend"
            columns={['Year', 'Car', 'Train', 'Bus', 'Active', 'WFH']}
            rows={transport.modeShareTrend.map((item) => [
              item.year,
              formatPercent(item.car),
              formatPercent(item.train),
              formatPercent(item.bus),
              formatPercent(item.active),
              formatPercent(item.wfh),
            ])}
          />
          <SimpleTable
            title="PT stops by mode"
            columns={['Train', 'Metro', 'Bus', 'Ferry', 'Light rail', 'Total']}
            rows={transport.ptStops ? [[
              transport.ptStops.train,
              transport.ptStops.metro,
              transport.ptStops.bus,
              transport.ptStops.ferry,
              transport.ptStops.lightRail,
              transport.ptStops.total,
            ]] : []}
          />
          <SimpleTable
            title="PT routes by mode"
            columns={['Train', 'Metro', 'Bus', 'Ferry', 'Light rail', 'Total']}
            rows={transport.ptRoutes ? [[
              transport.ptRoutes.train,
              transport.ptRoutes.metro,
              transport.ptRoutes.bus,
              transport.ptRoutes.ferry,
              transport.ptRoutes.lightRail,
              transport.ptRoutes.total,
            ]] : []}
          />
          <SimpleTable
            title="Traffic volume trend"
            columns={['Year', 'Average daily vehicles', 'Station count']}
            rows={(transport.trafficVolumeTrend ?? []).map((item) => [item.year, item.avgDailyVehicles, item.stationCount])}
          />
          <SimpleTable
            title="Crash trend"
            columns={['Year', 'Total crashes', 'Fatal crashes', 'Injury crashes']}
            rows={(transport.crashTrend ?? []).map((item) => [item.year, item.totalCrashes, item.fatalCrashes, item.injuryCrashes])}
          />
        </Section>

        <Section title="Economy" meta={liveData.economy.meta}>
          <SummaryTable
            rows={[
              ['Unemployment rate', formatPercent(economy.unemploymentRate)],
              ['Participation rate', formatPercent(economy.participationRate)],
              ['Median weekly income', formatCurrency(economy.medianWeeklyIncome)],
              ['Job density', economy.jobDensity !== null ? formatNumber(economy.jobDensity, 1) : 'N/A'],
              ['Low income households', economy.lowIncomeHouseholds !== undefined ? formatPercent(economy.lowIncomeHouseholds) : 'N/A'],
              ['High income households', economy.highIncomeHouseholds !== undefined ? formatPercent(economy.highIncomeHouseholds) : 'N/A'],
            ]}
          />
          <SimpleTable
            title="Employment by industry"
            columns={['Industry', 'Value']}
            rows={economy.employmentByIndustry.map((item) => [item.name, item.value])}
          />
          <SimpleTable
            title="Employment trend"
            columns={['Year', 'Employed', 'Unemployed']}
            rows={economy.employmentTrend.map((item) => [item.year, item.employed, item.unemployed])}
          />
          <SimpleTable
            title="Occupation by group"
            columns={['Code', 'Occupation', 'Employed', 'Male', 'Female']}
            rows={(economy.occupationByGroup ?? []).map((item) => [item.code, item.name, item.employed, item.male, item.female])}
          />
          <SimpleTable
            title="Household income distribution"
            columns={['Band', 'Count']}
            rows={(economy.householdIncomeDistribution ?? []).map((item) => [item.label, item.count])}
          />
        </Section>

        <Section title="Education" meta={liveData.education.meta}>
          <SimpleTable
            title="Educational attainment"
            columns={['Level', 'Value']}
            rows={education.attainment.map((item) => [item.name, item.value])}
          />
          <SimpleTable
            title="School enrolment"
            columns={['Group', 'Value']}
            rows={education.schoolEnrolment.map((item) => [item.name, item.value])}
          />
          <SimpleTable
            title="Qualification trend"
            columns={['Year', 'Bachelor', 'Diploma', 'Certificate']}
            rows={education.qualificationTrend.map((item) => [item.year, item.bachelor, item.diploma, item.certificate])}
          />
        </Section>

        <Section title="Housing" meta={liveData.housing.meta}>
          <SummaryTable
            rows={[
              ['Median weekly rent', formatCurrency(housing.medianWeeklyRent)],
              ['Median house price', housing.medianHousePrice !== null ? formatCurrency(housing.medianHousePrice) : 'N/A'],
              ['Mortgage stress rate', housing.mortgageStressRate !== undefined ? formatPercent(housing.mortgageStressRate) : 'N/A'],
              ['Rent stress rate', housing.rentStressRate !== undefined ? formatPercent(housing.rentStressRate) : 'N/A'],
            ]}
          />
          <SimpleTable
            title="Dwelling types"
            columns={['Type', 'Value']}
            rows={housing.dwellingTypes.map((item) => [item.name, item.value])}
          />
          <SimpleTable
            title="Tenure"
            columns={['Type', 'Value']}
            rows={housing.tenure.map((item) => [item.name, item.value])}
          />
          <SimpleTable
            title="Housing trend"
            columns={['Year', 'Houses', 'Apartments', 'Townhouses']}
            rows={housing.housingTrend.map((item) => [item.year, item.houses, item.apartments, item.townhouses])}
          />
        </Section>

        <Section title="Growth" meta={liveData.growth.meta}>
          <SummaryTable
            rows={[
              ['Annual growth rate', formatPercent(growth.annualGrowthRate)],
              ['Projected growth rate', formatPercent(growth.projectedGrowthRate)],
              ['Rolling annual approvals', growth.rollingAnnualApprovals !== undefined ? formatNumber(growth.rollingAnnualApprovals) : 'N/A'],
            ]}
          />
          <SimpleTable
            title="Population history"
            columns={['Year', 'Population']}
            rows={growth.populationHistory.map((item) => [item.year, item.population])}
          />
          <SimpleTable
            title="Population projections"
            columns={['Year', 'Population']}
            rows={growth.populationProjections.map((item) => [item.year, item.population])}
          />
          <SimpleTable
            title="Employment growth"
            columns={['Year', 'Jobs']}
            rows={growth.employmentGrowth.map((item) => [item.year, item.jobs])}
          />
          <SimpleTable
            title="Building approvals"
            columns={['Year', 'Month', 'Residential count']}
            rows={(growth.buildingApprovals ?? []).map((item) => [item.year, item.month, item.residentialCount])}
          />
        </Section>
      </div>
    </div>
  );
}
