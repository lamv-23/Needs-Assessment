'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsBarChart from '@/components/charts/BarChart';
import NeedsPieChart from '@/components/charts/PieChart';
import PopulationPyramid from '@/components/charts/PopulationPyramid';
import MapRenderer from '@/components/maps/MapRenderer';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';
import { useAppStore } from '@/store';
import { useLiveData } from '@/hooks/useLiveData';
import { METRICS, enrichGeoJSONWithMetric, getMetricColorScheme, type MetricKey } from '@/lib/data/demographic-indicators';
import { formatNumber, CHART_COLORS } from '@/lib/utils';
import { Users, Calendar, ShieldCheck, MapPin } from 'lucide-react';
import type { FeatureCollection } from 'geojson';


export default function DemographicsPage() {
  const { selectedArea, selectedYear } = useAppStore();
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('population2021');
  const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);

  const area = selectedArea ?? { id: 'lga_sydney', name: 'City of Sydney' };
  const areaId = area.id;
  const year = selectedYear;

  // Live data — reads from SQLite cache, falls back to sample data per field
  const { demographics: { data, meta } } = useLiveData(areaId, year);

  // Load and enrich GeoJSON on metric change
  useEffect(() => {
    const loadGeoJson = async () => {
      try {
        const response = await fetch('/geo/lga-greater-sydney.json');
        const baseGeoJson = await response.json();
        const enriched = enrichGeoJSONWithMetric(baseGeoJson, selectedMetric);
        setGeoJsonData(enriched);
      } catch (error) {
        console.error('Error loading GeoJSON:', error);
      }
    };
    loadGeoJson();
  }, [selectedMetric]);

  return (
    <div>
      <Header
        title="Population & Demographics"
        subtitle={`${area.name} — ${year}`}
      />

      <div className="p-6 space-y-6">
        {/* Data source attribution — always visible */}
        <DataSourceBadge meta={meta} />

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Total Population"
            value={formatNumber(data.totalPopulation)}
            subtitle={meta.liveFields.includes('totalPopulation') ? 'ABS Census 2021' : `${year} (indicative)`}
          />
          <StatCard
            icon={Calendar}
            label="Median Age"
            value={data.medianAge.toFixed(1)}
            subtitle={meta.liveFields.includes('medianAge') ? 'ABS Census 2021' : 'Indicative'}
          />
          <StatCard
            icon={ShieldCheck}
            label="SEIFA Score"
            value={formatNumber(data.seifaScore)}
            subtitle={meta.liveFields.includes('seifaScore') ? 'IRSD — ABS 2021' : 'Indicative'}
          />
          <StatCard
            icon={MapPin}
            label="Population Density"
            value={formatNumber(data.populationDensity)}
            subtitle="Persons per km² (indicative)"
          />
        </div>

        {/* Interactive Demographic Hotspot Map */}
        <ChartWrapper
          title="Greater Sydney Demographic Hotspot Map"
          subtitle="Click on LGAs to select, use dropdown to change metric"
          className="lg:col-span-2"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <label htmlFor="metric-select" className="text-sm font-medium text-gray-700">
                Metric:
              </label>
              <select
                id="metric-select"
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value as MetricKey)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Object.entries(METRICS).map(([key, metric]) => (
                  <option key={key} value={key}>{metric.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-600 ml-auto">{METRICS[selectedMetric].description}</p>
            </div>
            <div className="rounded-lg overflow-hidden border border-gray-200">
              {geoJsonData ? (
                <MapRenderer
                  geoJsonData={geoJsonData}
                  valueField={selectedMetric}
                  colorScale={getMetricColorScheme(selectedMetric)}
                  legendTitle={`${METRICS[selectedMetric].label} (${METRICS[selectedMetric].unit})`}
                />
              ) : (
                <div className="h-[500px] w-full rounded-lg bg-gray-100 flex items-center justify-center">
                  <p className="text-gray-400 text-sm">Loading map...</p>
                </div>
              )}
            </div>
          </div>
        </ChartWrapper>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartWrapper
            title="Population Pyramid"
            subtitle="Age and sex distribution"
            className="lg:col-span-2"
          >
            <PopulationPyramid data={data.ageDistribution} height={400} />
          </ChartWrapper>

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
