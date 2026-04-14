'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
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
  CheckCircle2,
  Briefcase,
  Building2,
  Map,
  Sparkles,
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
    borderColor: 'border-blue-200',
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
    borderColor: 'border-rose-200',
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
    borderColor: 'border-amber-200',
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
    borderColor: 'border-emerald-200',
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
    borderColor: 'border-purple-200',
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
    borderColor: 'border-cyan-200',
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
    borderColor: 'border-orange-200',
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
    borderColor: 'border-violet-200',
    stats: 'FTS + ATAP',
  },
];

const workflowSteps = [
  {
    number: '01',
    icon: MousePointerClick,
    title: 'Select your area',
    description: 'Pick any NSW LGA from the area selector in the top bar. The entire tool updates to show data for that location.',
    color: 'bg-primary-500',
  },
  {
    number: '02',
    icon: Database,
    title: 'Explore the data',
    description: 'Browse eight themed modules — demographics, transport, housing, economy, education, growth, problem definition, and strategic alignment.',
    color: 'bg-emerald-500',
  },
  {
    number: '03',
    icon: Download,
    title: 'Export your report',
    description: 'Use the Report Builder to generate a professional PDF summary ready for a business case, briefing note, or stakeholder presentation.',
    color: 'bg-violet-500',
  },
];

const audiences = [
  {
    icon: Briefcase,
    title: 'Transport Consultants',
    description: 'Build robust evidence for NSW business cases with structured, citation-ready data across all ATAP requirements.',
    color: 'bg-blue-50',
    iconColor: 'text-blue-600',
    accentColor: 'bg-blue-500',
  },
  {
    icon: Building2,
    title: 'Government Planners',
    description: "Understand how your LGA's transport needs compare across the region, and align investment with FTS 2056 outcomes.",
    color: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    accentColor: 'bg-emerald-500',
  },
  {
    icon: Map,
    title: 'Local Councils',
    description: 'Access census, growth, and mode share data for your area to support grant applications and local transport strategies.',
    color: 'bg-violet-50',
    iconColor: 'text-violet-600',
    accentColor: 'bg-violet-500',
  },
];

const capabilities = [
  'ABS Census data for 2011, 2016 & 2021',
  'Population projections to 2041 (NSW DPE)',
  'Mode share & commute data from TfNSW',
  'Side-by-side area comparison',
  'FTS 2056 & ATAP alignment mapping',
  'One-click PDF report export',
];

export default function DashboardPage() {
  const { selectedArea } = useAppStore();
  const [faqOpen, setFaqOpen] = useState(false);
  const selectedAreaName = selectedArea?.name ?? 'Selected area';

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

        {/* ── Hero ── */}
        <div className="relative overflow-hidden bg-gradient-to-br from-primary-800 via-primary-700 to-blue-600 rounded-2xl text-white shadow-xl">
          {/* Background texture */}
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
          {/* Decorative blobs */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full blur-2xl" />
          <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-blue-400/10 rounded-full blur-xl" />

          <div className="relative px-8 py-10 md:py-12">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/15 border border-white/20 text-white/90 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 tracking-wide">
              <MapPin className="w-3 h-3" />
              NSW Transport Planning Tool
            </div>

            <div className="max-w-2xl">
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight tracking-tight">
                Build the evidence for<br className="hidden md:block" /> transport investment
              </h1>
              <p className="text-blue-100/90 text-sm md:text-base max-w-xl leading-relaxed mb-3">
                The Transport Needs Assessment Tool brings together ABS Census data, NSW population projections, and TfNSW transport statistics for every NSW local government area — giving planners and consultants a single place to understand and articulate transport needs.
              </p>
              <p className="text-blue-200/70 text-xs md:text-sm max-w-lg leading-relaxed mb-8">
                Designed to support the strategic case in NSW and ATAP business cases.
              </p>

              {/* Capability pills */}
              <div className="flex flex-wrap gap-2 mb-8">
                {capabilities.map(cap => (
                  <span
                    key={cap}
                    className="inline-flex items-center gap-1.5 bg-white/10 border border-white/15 text-white/80 text-xs px-3 py-1 rounded-full"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-300 flex-shrink-0" />
                    {cap}
                  </span>
                ))}
              </div>

              {/* CTAs */}
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
                  Browse modules
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Stats strip */}
            <div className="mt-8 pt-6 border-t border-white/15 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'NSW LGAs covered', value: PROJECTION_LGAS.length.toString() },
                {
                  label: areaHasProjections && areaPop2021 ? `${selectedAreaName} pop. (2021)` : 'Greater Sydney (2021)',
                  value: areaHasProjections && areaPop2021 ? areaPop2021.toLocaleString() : '5.3M',
                },
                { label: 'Census years', value: '3' },
                {
                  label: areaHasProjections && areaPop2041 ? `${selectedAreaName} pop. (2041)` : 'Projections to',
                  value: areaHasProjections && areaPop2041 ? areaPop2041.toLocaleString() : '2041',
                },
              ].map(stat => (
                <div key={stat.label}>
                  <p className="text-xl font-bold text-white">{stat.value}</p>
                  <p className="text-xs text-blue-200/80 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Who it's for ── */}
        <div>
          <div className="mb-5">
            <h2 className="text-base font-bold text-gray-900 tracking-tight">Who uses this tool?</h2>
            <p className="text-xs text-gray-500 mt-1">Built for professionals who need to understand transport needs across NSW</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {audiences.map((audience) => (
              <div
                key={audience.title}
                className={`${audience.color} rounded-xl p-5 border border-white`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 bg-white rounded-lg flex items-center justify-center shadow-sm flex-shrink-0`}>
                    <audience.icon className={`w-4.5 h-4.5 ${audience.iconColor}`} />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-800">{audience.title}</h3>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{audience.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── How it works ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary-500" />
            <h2 className="text-sm font-bold text-gray-800">How it works</h2>
            <p className="text-xs text-gray-400 ml-1">— three steps to a complete needs assessment</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            {workflowSteps.map((step, i) => (
              <div key={i} className="p-6 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className={`${step.color} w-9 h-9 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0`}>
                    <step.icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-3xl font-black text-gray-100 leading-none select-none">{step.number}</span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">{step.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Selected area banner (when area is chosen) ── */}
        {selectedArea && (
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

        {/* ── Data Modules ── */}
        <div id="modules">
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-gray-900 tracking-tight">Data Modules</h2>
              <p className="text-xs text-gray-500 mt-1">
                Eight themed modules covering the full evidence base for a transport needs assessment
              </p>
            </div>
            <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2.5 py-1 rounded-full">
              {modules.length} modules
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {modules.map((module) => (
              <Link
                key={module.href}
                href={module.href}
                className="group relative bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-200"
              >
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

        {/* ── Analysis Tools ── */}
        <div>
          <div className="mb-5">
            <h2 className="text-base font-bold text-gray-900 tracking-tight">Analysis Tools</h2>
            <p className="text-xs text-gray-500 mt-1">Compare multiple areas or package your findings into a report</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              href="/compare"
              className="group flex gap-5 bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="bg-indigo-500 p-3.5 rounded-xl flex-shrink-0 shadow-sm self-start group-hover:shadow transition-shadow">
                <GitCompare className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-primary-700 transition-colors mb-1">Compare Areas</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Place two or more LGAs side by side to identify differences in demographics, transport, or economic conditions. Useful for project corridor analysis or benchmarking.
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 self-center" />
            </Link>
            <Link
              href="/report"
              className="group flex gap-5 bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="bg-teal-500 p-3.5 rounded-xl flex-shrink-0 shadow-sm self-start group-hover:shadow transition-shadow">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-primary-700 transition-colors mb-1">Report Builder</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Export a structured PDF that covers demographics, transport, housing, economy and growth for your selected area. Ready to include in a business case or planning submission.
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 self-center" />
            </Link>
          </div>
        </div>

        {/* ── Data Sources ── */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Data Sources</h3>
            <p className="text-xs text-gray-400 mt-0.5">All data is sourced from authoritative government agencies</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            {[
              {
                name: 'ABS Census',
                color: 'bg-blue-500',
                lightColor: 'bg-blue-50',
                iconColor: 'text-blue-600',
                icon: Database,
                description: 'Population, demographics, journey to work, employment, education, housing',
                detail: '2011, 2016, 2021',
              },
              {
                name: 'TfNSW Open Data',
                color: 'bg-emerald-500',
                lightColor: 'bg-emerald-50',
                iconColor: 'text-emerald-600',
                icon: Train,
                description: 'Mode share, commute times, public transport patronage and traffic data',
                detail: 'TZP24 dataset',
              },
              {
                name: 'NSW DPE',
                color: 'bg-violet-500',
                lightColor: 'bg-violet-50',
                iconColor: 'text-violet-600',
                icon: BarChart3,
                description: 'Population and employment projections by LGA through to 2041',
                detail: 'Projections 2021–2041',
              },
            ].map((src) => (
              <div key={src.name} className="px-5 py-4 flex items-start gap-3">
                <div className={`${src.lightColor} p-2 rounded-lg flex-shrink-0`}>
                  <src.icon className={`w-4 h-4 ${src.iconColor}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-gray-700">{src.name}</p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${src.lightColor} ${src.iconColor}`}>
                      {src.detail}
                    </span>
                  </div>
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
