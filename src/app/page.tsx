'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import FAQOverlay from '@/components/ui/FAQOverlay';
import { useAppStore } from '@/store';
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
  Layers,
  ClipboardList,
  HelpCircle,
  ChevronRight,
  Database,
  MousePointerClick,
  Download,
} from 'lucide-react';

const modules = [
  {
    href: '/demographics',
    icon: Users,
    title: 'Demographics',
    subtitle: 'Who lives here?',
    description: 'Population size, age structure, cultural diversity, SEIFA disadvantage indices',
    color: 'bg-blue-500',
    lightColor: 'bg-blue-50',
    textColor: 'text-blue-600',
    stats: '35 LGAs',
  },
  {
    href: '/housing',
    icon: Home,
    title: 'Housing & Land Use',
    subtitle: 'Who owns or rents?',
    description: 'Dwelling types, tenure, rental costs, housing affordability indicators',
    color: 'bg-rose-500',
    lightColor: 'bg-rose-50',
    textColor: 'text-rose-600',
    stats: 'Dwelling data',
  },
  {
    href: '/economy',
    icon: TrendingUp,
    title: 'Economy & Employment',
    subtitle: 'What industries employ locals?',
    description: 'Employment by industry, unemployment, workforce participation, median income',
    color: 'bg-amber-500',
    lightColor: 'bg-amber-50',
    textColor: 'text-amber-600',
    stats: 'ANZSIC sectors',
  },
  {
    href: '/transport',
    icon: Train,
    title: 'Transport & Commuting',
    subtitle: 'How do people get to work?',
    description: 'Journey to work, mode share, vehicle ownership, public transport patronage',
    color: 'bg-emerald-500',
    lightColor: 'bg-emerald-50',
    textColor: 'text-emerald-600',
    stats: 'Mode share data',
  },
  {
    href: '/education',
    icon: GraduationCap,
    title: 'Education',
    subtitle: 'What qualifications do residents hold?',
    description: 'Educational attainment, school enrolment, tertiary qualifications',
    color: 'bg-purple-500',
    lightColor: 'bg-purple-50',
    textColor: 'text-purple-600',
    stats: 'Qualification levels',
  },
  {
    href: '/growth',
    icon: BarChart3,
    title: 'Growth & Projections',
    subtitle: 'How fast is the population growing?',
    description: 'Historical growth, DPE population projections, employment forecasts to 2041',
    color: 'bg-cyan-500',
    lightColor: 'bg-cyan-50',
    textColor: 'text-cyan-600',
    stats: '2011–2041',
  },
  {
    href: '/problem-definition',
    icon: ClipboardList,
    title: 'Problem Definition',
    subtitle: 'Where are the service gaps?',
    description: 'Mode share trends, service level gaps, demand forecasts, evidence availability matrix',
    color: 'bg-orange-500',
    lightColor: 'bg-orange-50',
    textColor: 'text-orange-600',
    stats: 'Business case',
  },
  {
    href: '/strategic-alignment',
    icon: Layers,
    title: 'Strategic Alignment',
    subtitle: 'How does it align with FTS 2056?',
    description: 'FTS 2056 outcomes, strategy hierarchy, SEIFA distributional analysis, population & employment projections',
    color: 'bg-violet-500',
    lightColor: 'bg-violet-50',
    textColor: 'text-violet-600',
    stats: 'FTS + ATAP',
  },
];

const workflowSteps = [
  {
    number: '01',
    icon: MousePointerClick,
    title: 'Select your area',
    description: 'Pick any NSW LGA using the area selector in the top bar',
  },
  {
    number: '02',
    icon: Database,
    title: 'Explore the data',
    description: 'Browse demographics, transport, housing, economy and growth modules',
  },
  {
    number: '03',
    icon: Download,
    title: 'Export your report',
    description: 'Generate a professional PDF summary for your business case',
  },
];

export default function DashboardPage() {
  const { selectedArea } = useAppStore();
  const [faqOpen, setFaqOpen] = useState(false);

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

      <div className="p-6 space-y-7">

        {/* Hero Section */}
        <div className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-blue-500 rounded-2xl p-8 text-white shadow-lg">
          {/* Dot grid pattern */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />
          {/* Decorative rings */}
          <div className="absolute -top-16 -right-16 w-64 h-64 border border-white/10 rounded-full" />
          <div className="absolute -top-8 -right-8 w-40 h-40 border border-white/10 rounded-full" />
          <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-white/5 rounded-full" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full mb-5 tracking-wide">
              <MapPin className="w-3 h-3" />
              NSW Transport Planning Tool
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-3 leading-tight tracking-tight">
              Understand transport needs<br className="hidden md:block" /> across NSW
            </h1>
            <p className="text-blue-100/90 text-sm md:text-[15px] max-w-lg leading-relaxed mb-6">
              Explore population, employment, transport and housing data for any NSW local government area — purpose-built for transport planning and business cases.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setFaqOpen(true)}
                className="flex items-center gap-2 bg-white text-primary-700 hover:bg-blue-50 font-semibold text-sm px-5 py-2.5 rounded-xl shadow-md transition-all hover:shadow-lg hover:-translate-y-px"
              >
                <HelpCircle className="w-4 h-4" />
                Getting Started
              </button>
              <Link
                href="#modules"
                className="flex items-center gap-2 bg-white/15 hover:bg-white/25 border border-white/20 text-white font-medium text-sm px-5 py-2.5 rounded-xl transition-all"
              >
                Explore modules
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="flex items-center gap-4 mt-5 pt-5 border-t border-white/15">
              {['ABS Census', 'TfNSW', 'NSW DPE'].map(src => (
                <span key={src} className="text-[11px] font-medium text-blue-200 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-blue-300 inline-block" />
                  {src}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

        {/* Context strip: workflow guide (no area) OR selected area (has area) */}
        {!selectedArea ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold text-gray-700">How it works</h2>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {workflowSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                    <step.icon className="w-4 h-4 text-primary-600" />
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] font-bold text-primary-400 tracking-wider">{step.number}</span>
                      <p className="text-sm font-semibold text-gray-800">{step.title}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-primary-50 border border-primary-100 rounded-xl px-5 py-3.5">
            <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-primary-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary-900">
                Viewing data for <strong>{selectedArea.name}</strong>
              </p>
              <p className="text-xs text-primary-600 mt-0.5">
                Select a module below to explore {selectedArea.name} data in detail
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-primary-400 ml-auto" />
          </div>
        )}

        {/* Data Modules Grid */}
        <div id="modules">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900 tracking-tight">Data Modules</h2>
              <p className="text-xs text-gray-500 mt-0.5">Choose a topic to explore data for your selected area</p>
            </div>
            <span className="text-xs text-gray-400 font-medium">{modules.length} modules</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {modules.map((module) => (
              <Link
                key={module.href}
                href={module.href}
                className="group relative bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-200"
              >
                {/* Subtle top accent line */}
                <div className={`absolute top-0 left-4 right-4 h-[2px] ${module.color} rounded-b-full opacity-0 group-hover:opacity-100 transition-opacity duration-200`} />

                <div className="flex items-start gap-3">
                  <div className={`${module.lightColor} p-2.5 rounded-lg flex-shrink-0`}>
                    <module.icon className={`w-[18px] h-[18px] ${module.textColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-semibold text-gray-900 leading-snug group-hover:text-primary-700 transition-colors">
                      {module.title}
                    </h3>
                    <p className={`text-[11px] font-medium mt-0.5 ${module.textColor}`}>{module.subtitle}</p>
                  </div>
                </div>

                <p className="text-xs text-gray-400 mt-2.5 leading-relaxed line-clamp-2">{module.description}</p>

                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-50">
                  <span className="text-[11px] font-medium text-gray-400">{module.stats}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Analysis Tools */}
        <div>
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900 tracking-tight">Analysis Tools</h2>
              <p className="text-xs text-gray-500 mt-0.5">Compare areas or build a business case report</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Link
              href="/compare"
              className="group flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="bg-indigo-500 p-3 rounded-xl flex-shrink-0 shadow-sm group-hover:shadow transition-shadow">
                <GitCompare className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-[13px] font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">Compare Areas</h3>
                <p className="text-xs text-gray-500 mt-0.5">Benchmark this area against others side by side</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </Link>
            <Link
              href="/report"
              className="group flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="bg-teal-500 p-3 rounded-xl flex-shrink-0 shadow-sm group-hover:shadow transition-shadow">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-[13px] font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">Report Builder</h3>
                <p className="text-xs text-gray-500 mt-0.5">Export a professional PDF for presentations or business cases</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </Link>
          </div>
        </div>

        {/* Data Sources */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Data Sources</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            {[
              {
                name: 'ABS Census',
                color: 'bg-blue-500',
                description: 'Population, demographics, journey to work, employment, education, housing (2011, 2016, 2021)',
              },
              {
                name: 'TfNSW Open Data',
                color: 'bg-emerald-500',
                description: 'Public transport patronage, traffic volumes, crash data, mode share and commute patterns',
              },
              {
                name: 'NSW DPE',
                color: 'bg-violet-500',
                description: 'Population and employment projections by LGA through to 2041',
              },
            ].map((src) => (
              <div key={src.name} className="px-5 py-4 flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full ${src.color} flex-shrink-0 mt-1.5`} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">{src.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{src.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {faqOpen && <FAQOverlay onClose={() => setFaqOpen(false)} />}
    </div>
  );
}
