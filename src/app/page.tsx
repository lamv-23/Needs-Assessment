'use client';

import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import { useAppStore } from '@/store';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import { getProjectionsForArea, PROJECTION_LGAS } from '@/lib/data/nsw-projections-data';
import Link from 'next/link';
import {
  Users,
  Train,
  TrendingUp,
  GraduationCap,
  Home,
  BarChart3,
  ArrowRight,
  MapPin,
  FileText,
  GitCompare,
} from 'lucide-react';

const modules = [
  {
    href: '/demographics',
    icon: Users,
    title: 'Population & Demographics',
    description: 'Population size, age structure, cultural diversity, SEIFA disadvantage indices',
    color: 'bg-blue-500',
    stats: '35 LGAs',
  },
  {
    href: '/transport',
    icon: Train,
    title: 'Transport & Commuting',
    description: 'Journey to work, mode share, vehicle ownership, public transport patronage',
    color: 'bg-emerald-500',
    stats: 'Mode share data',
  },
  {
    href: '/economy',
    icon: TrendingUp,
    title: 'Economy & Employment',
    description: 'Employment by industry, unemployment, workforce participation, median income',
    color: 'bg-amber-500',
    stats: 'ANZSIC sectors',
  },
  {
    href: '/education',
    icon: GraduationCap,
    title: 'Education',
    description: 'Educational attainment, school enrolment, tertiary qualifications',
    color: 'bg-purple-500',
    stats: 'Qualification levels',
  },
  {
    href: '/housing',
    icon: Home,
    title: 'Housing & Land Use',
    description: 'Dwelling types, tenure, rental costs, housing affordability indicators',
    color: 'bg-rose-500',
    stats: 'Dwelling data',
  },
  {
    href: '/growth',
    icon: BarChart3,
    title: 'Growth & Projections',
    description: 'Historical growth, DPE population projections, employment forecasts to 2041',
    color: 'bg-cyan-500',
    stats: '2011-2041',
  },
];

export default function DashboardPage() {
  const { selectedArea } = useAppStore();

  // NSW projection data for the selected area (if available)
  const areaProjections = selectedArea
    ? (getProjectionsForArea(selectedArea.id).length > 0
        ? getProjectionsForArea(selectedArea.id)
        : getProjectionsForArea(selectedArea.name))
    : [];
  const areaHasProjections = areaProjections.length > 0;
  const areaPop2021 = areaProjections.find(d => d.year === 2021)?.totalPopulation;
  const areaPop2041 = areaProjections.find(d => d.year === 2041)?.totalPopulation;

  return (
    <div>
      <Header
        title="Transport Needs Assessment"
        subtitle="Greater Sydney, Newcastle & Wollongong — Data-driven transport planning support"
      />

      <div className="p-6 space-y-8">
        {/* Key Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={MapPin}
            label="Coverage Areas"
            value={PROJECTION_LGAS.length.toString()}
            subtitle="NSW LGAs with DPE projections"
          />
          <StatCard
            icon={Users}
            label={areaHasProjections && areaPop2021 ? `${selectedArea!.name} (2021)` : 'Population (2021)'}
            value={areaHasProjections && areaPop2021 ? areaPop2021.toLocaleString() : '5.3M'}
            subtitle={areaHasProjections ? 'NSW DPE Projection base year' : 'Greater Sydney estimated population'}
          />
          <StatCard
            icon={Train}
            label="Census Years"
            value="3"
            subtitle="2011, 2016, 2021 data available"
          />
          <StatCard
            icon={BarChart3}
            label={areaHasProjections && areaPop2041 ? `${selectedArea!.name} (2041)` : 'Projections'}
            value={areaHasProjections && areaPop2041 ? areaPop2041.toLocaleString() : '2041'}
            subtitle={areaHasProjections ? 'NSW DPE projected population' : 'DPE population projections'}
          />
        </div>

        {/* Selected area banner */}
        {selectedArea && (
          <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-primary-600" />
              <div>
                <p className="text-sm font-medium text-primary-900">
                  Viewing data for: <strong>{selectedArea.name}</strong>
                </p>
                <p className="text-xs text-primary-600">
                  Select a module below to explore {selectedArea.name} data
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Data Modules Grid */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Data Modules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map((module) => (
              <Link
                key={module.href}
                href={module.href}
                className="group bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md hover:border-primary-300 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className={`${module.color} p-2.5 rounded-lg`}>
                    <module.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">
                      {module.title}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">{module.description}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-xs font-medium text-gray-400">{module.stats}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-primary-600 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Tools Row */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Analysis Tools</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              href="/compare"
              className="group flex items-center gap-4 bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md hover:border-primary-300 transition-all"
            >
              <div className="bg-indigo-500 p-3 rounded-lg">
                <GitCompare className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Compare Areas</h3>
                <p className="text-sm text-gray-500">Side-by-side comparison of 2+ areas with benchmarking</p>
              </div>
            </Link>
            <Link
              href="/report"
              className="group flex items-center gap-4 bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md hover:border-primary-300 transition-all"
            >
              <div className="bg-teal-500 p-3 rounded-lg">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Report Builder</h3>
                <p className="text-sm text-gray-500">Generate PDF reports with charts and data for business cases</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Data Source Info */}
        <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Data Sources</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-500">
            <div>
              <p className="font-medium text-gray-600">ABS Census</p>
              <p>Population, demographics, journey to work, employment, education, housing (2011, 2016, 2021)</p>
            </div>
            <div>
              <p className="font-medium text-gray-600">TfNSW Open Data</p>
              <p>Public transport patronage, traffic volumes, crash data, cycling counts</p>
            </div>
            <div>
              <p className="font-medium text-gray-600">NSW DPE</p>
              <p>Population and employment projections by LGA to 2041</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
