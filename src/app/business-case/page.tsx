// src/app/business-case/page.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import Header from '@/components/layout/Header';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsBarChart from '@/components/charts/BarChart';
import NeedsLineChart from '@/components/charts/LineChart';
import { StrategicAlignmentSection } from '@/components/business-case/StrategicAlignmentSection';
import { ProjectSyncPanel } from '@/components/business-case/ProjectSyncPanel';
import { useProjectSessionStore } from '@/store/projectSessionStore';
import { useProjectionStore } from '@/store/projectionStore';
import { useStrategicAlignmentStore } from '@/store/strategicAlignmentStore';
import WizardModal from '@/components/business-case/WizardModal';
import { CALLOUTS } from '@/components/business-case/callouts';
import {
  useBusinessCaseStore,
  THEMES,
  SECTION_IDS,
  type ThemeKey,
  type SectionId,
} from '@/store/businessCaseStore';
import { useAppStore } from '@/store';
import { useHasHydrated } from '@/store/useHasHydrated';
import { useLiveData } from '@/hooks/useLiveData';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import { getProjectionsForArea } from '@/lib/data/nsw-projections-data';
import { getCarModeShare, getPTModeShare } from '@/lib/data/transport-helpers';
import { formatNumber, formatPercent, CHART_COLORS } from '@/lib/utils';
import { Wand2, Download, RotateCcw } from 'lucide-react';

// Which themes activate which sections
const THEME_TO_SECTIONS: Record<ThemeKey, SectionId[]> = {
  growth: ['growth'],
  congestion: ['car-dependency', 'congestion'],
  'car-dependency': ['car-dependency'],
  economy: ['economy'],
  freight: [],
};

const ALWAYS_ON: SectionId[] = ['scene', 'gap', 'evidence'];

const SECTION_HEADINGS: Record<SectionId, string> = {
  scene: 'Setting the Scene',
  growth: 'Growth Pressure',
  'car-dependency': 'Car Dependency',
  congestion: 'Congestion & Commute',
  economy: 'Economic Activity',
  'strategic-alignment': 'Strategic Alignment',
  gap: 'Infrastructure Gap',
  evidence: 'Evidence Summary',
};

export default function BusinessCasePage() {
  const { selectedYear } = useAppStore();
  const {
    projectName,
    projectType,
    areaIds,
    themes,
    sectionToggles,
    setProject,
    toggleSection,
    clearProject,
  } = useBusinessCaseStore();
  const clearStrategicAlignment = useStrategicAlignmentStore((state) => state.clearAll);
  const clearProjections = useProjectionStore((state) => state.clearProjections);
  const clearProjectSession = useProjectSessionStore((state) => state.clearProjectSession);

  // businessCaseStore uses skipHydration (see store for why); wizardOpen must
  // start true to match the store's un-hydrated default (projectName === '')
  // on both server and the client's first paint, then correct itself once
  // hydration confirms a saved project exists — see useHasHydrated.
  const hasHydrated = useHasHydrated(useBusinessCaseStore);
  const [wizardOpen, setWizardOpen] = useState(true);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasHydrated && projectName) {
      setWizardOpen(false);
    }
  }, [hasHydrated, projectName]);

  const primaryAreaId = areaIds[0] ?? 'lga_sydney';
  const primaryArea = SAMPLE_AREAS.find(a => a.id === primaryAreaId);
  const { demographics, transport, economy, growth } = useLiveData(primaryAreaId, selectedYear);

  const projectionsByid = getProjectionsForArea(primaryAreaId);
  const nswProjections = projectionsByid.length > 0
    ? projectionsByid
    : getProjectionsForArea(primaryArea?.name ?? '');

  const handleGenerate = (config: { projectName: string; areaIds: string[]; themes: ThemeKey[] }) => {
    const themeActivated = new Set<SectionId>();
    config.themes.forEach(theme => {
      THEME_TO_SECTIONS[theme]?.forEach(s => themeActivated.add(s));
    });
    const toggles = Object.fromEntries(
      SECTION_IDS.map(id => [id, ALWAYS_ON.includes(id) || themeActivated.has(id)])
    ) as Record<SectionId, boolean>;

    setProject({
      projectName: config.projectName,
      projectType: 'road',
      areaIds: config.areaIds,
      themes: config.themes,
      sectionToggles: toggles,
    });
    setWizardOpen(false);
  };

  const handleNewProject = () => {
    clearProject();
    clearStrategicAlignment();
    clearProjections();
    clearProjectSession();
    setWizardOpen(true);
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= 297;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= 297;
      }
      const safeName = projectName.replace(/\s+/g, '_');
      const safeArea = (primaryArea?.name ?? 'area').replace(/\s+/g, '_');
      pdf.save(`${safeName}_${safeArea}_business_case.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    }
  };

  const visibleSections = SECTION_IDS.filter(id => sectionToggles[id]);

  const d = demographics.data;
  const t = transport.data;
  const e = economy.data;
  const g = growth.data;

  // Derive mode share values from journeyToWork array
  const carModeShare = getCarModeShare(t.journeyToWork);
  const ptModeShare = getPTModeShare(t.journeyToWork);

  const modeShareData = t.journeyToWork.filter(item => item.value > 0);

  const modeShareTrendData = t.modeShareTrend.map(row => ({
    year: String(row.year),
    Car: row.car,
    'Public Transport': row.train + row.bus,
    Active: row.active,
  }));

  const industryData = e.employmentByIndustry.slice(0, 10);

  const employmentProjectionData = g.employmentGrowth.map(row => ({
    year: String(row.year),
    Employment: row.jobs,
  }));

  const popHistoryData = g.populationHistory.map(row => ({
    year: String(row.year),
    Population: row.population,
  }));

  const popProjectionData = [
    ...popHistoryData,
    ...nswProjections.map(row => ({
      year: String(row.year),
      Population: row.totalPopulation,
    })),
  ];

  const callouts = CALLOUTS[projectType ?? 'road'];

  const renderSection = (id: SectionId) => {
    const callout = callouts[id];
    return (
      <div key={id} className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{SECTION_HEADINGS[id]}</h2>
          {callout && <p className="text-sm text-gray-500 mt-1 italic">{callout}</p>}
        </div>

        {id === 'scene' && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Population', value: formatNumber(d.totalPopulation) },
              { label: 'Median Age', value: `${d.medianAge} yrs` },
              { label: 'SEIFA Score', value: d.seifaScore ? String(d.seifaScore) : 'N/A' },
              { label: 'Car Mode Share', value: formatPercent(carModeShare) },
              { label: 'Median Income', value: `$${e.medianWeeklyIncome}/wk` },
              { label: 'Primary LGA', value: primaryArea?.name ?? primaryAreaId },
            ].map(stat => (
              <div key={stat.label} className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">{stat.label}</div>
                <div className="text-lg font-bold text-gray-900 mt-0.5">{stat.value}</div>
              </div>
            ))}
          </div>
        )}

        {id === 'growth' && (
          <div className="grid grid-cols-1 gap-4">
            <ChartWrapper
              title="Population Growth & Projections"
              data={popProjectionData}
              dataKeys={['Population']}
              xAxisKey="year"
            >
              <NeedsLineChart
                data={popProjectionData}
                dataKeys={['Population']}
                xAxisKey="year"
                height={260}
              />
            </ChartWrapper>
            {employmentProjectionData.length > 0 && (
              <ChartWrapper
                title="Employment Growth & Projections"
                data={employmentProjectionData}
                dataKeys={['Employment']}
                xAxisKey="year"
              >
                <NeedsLineChart
                  data={employmentProjectionData}
                  dataKeys={['Employment']}
                  colors={[CHART_COLORS[1]]}
                  xAxisKey="year"
                  height={260}
                />
              </ChartWrapper>
            )}
          </div>
        )}

        {id === 'car-dependency' && (
          <div className="grid grid-cols-1 gap-4">
            <ChartWrapper
              title="Journey to Work Mode Share (2021)"
              data={modeShareData}
              dataKeys={['value']}
              xAxisKey="name"
            >
              <NeedsBarChart
                data={modeShareData}
                dataKeys={['value']}
                layout="horizontal"
                height={220}
              />
            </ChartWrapper>
            {modeShareTrendData.length > 0 && (
              <ChartWrapper
                title="Mode Share Trend (2011–2021)"
                data={modeShareTrendData}
                dataKeys={['Car', 'Public Transport', 'Active']}
                xAxisKey="year"
              >
                <NeedsLineChart
                  data={modeShareTrendData}
                  dataKeys={['Car', 'Public Transport', 'Active']}
                  xAxisKey="year"
                  height={240}
                />
              </ChartWrapper>
            )}
          </div>
        )}

        {id === 'congestion' && (
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <p>Average commute time: <span className="font-semibold text-gray-900">{t.avgCommute !== null ? `${t.avgCommute} minutes` : 'N/A'}</span></p>
            <p className="mt-1">PT mode share: <span className="font-semibold text-gray-900">{formatPercent(ptModeShare)}</span></p>
            <p className="mt-2 text-gray-400 italic">Official commute-time data is not currently integrated at LGA level in this app.</p>
          </div>
        )}

        {id === 'economy' && industryData.length > 0 && (
          <ChartWrapper
            title="Employment by Industry"
            data={industryData}
            dataKeys={['value']}
            xAxisKey="name"
          >
            <NeedsBarChart
              data={industryData}
              dataKeys={['value']}
              colors={[CHART_COLORS[2]]}
              layout="horizontal"
              height={300}
            />
          </ChartWrapper>
        )}

        {id === 'strategic-alignment' && (
          <StrategicAlignmentSection
            areaId={primaryAreaId}
            areaName={primaryArea?.name ?? primaryAreaId}
            year={selectedYear}
          />
        )}

        {id === 'gap' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-gray-700">
            <p className="font-medium text-amber-900 mb-1">Level of Service Gap</p>
            <p>Car mode share of <span className="font-semibold">{formatPercent(carModeShare)}</span> against TfNSW outer metro target of ~60%. PT mode share of <span className="font-semibold">{formatPercent(ptModeShare)}</span> against target of ~20–25%.</p>
            <p className="mt-2 text-gray-500 italic">For detailed gap analysis see the <a href="/problem-definition" className="text-indigo-600 hover:underline">Problem Definition</a> page.</p>
          </div>
        )}

        {id === 'evidence' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium text-gray-700 border border-gray-200">Category</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700 border border-gray-200">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700 border border-gray-200">Source</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { category: 'Demand & Population', status: 'Available', source: 'ABS Census 2021, NSW DPE Projections' },
                  { category: 'Transport Performance', status: demographics.meta.hasLiveData ? 'Available' : 'Partial', source: 'TfNSW TZP24, ABS Census' },
                  { category: 'Infrastructure Condition', status: 'Not Available', source: 'Requires supplementary data collection' },
                  { category: 'Safety', status: 'Not Available', source: 'Requires ROADS data / crash statistics' },
                  { category: 'Economic Cost', status: 'Partial', source: 'ABS income data; full BCA requires modelling' },
                ].map(row => (
                  <tr key={row.category}>
                    <td className="px-3 py-2 border border-gray-200 text-gray-800">{row.category}</td>
                    <td className="px-3 py-2 border border-gray-200">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        row.status === 'Available' ? 'bg-emerald-50 text-emerald-700' :
                        row.status === 'Partial' ? 'bg-amber-50 text-amber-700' :
                        'bg-red-50 text-red-700'
                      }`}>{row.status}</span>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 text-gray-500">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Business Case Wizard"
        subtitle={projectName || 'Generate evidence for your infrastructure business case'}
      />

      {wizardOpen && (
        <WizardModal
          onGenerate={handleGenerate}
          onClose={projectName ? () => setWizardOpen(false) : undefined}
        />
      )}

      {projectName && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel */}
          <div className="w-72 border-r border-gray-100 bg-gray-50 flex flex-col overflow-y-auto p-4 gap-4 flex-shrink-0">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Project</label>
              <p className="text-sm font-semibold text-gray-900">{projectName}</p>
              <p className="text-xs text-gray-500">{SAMPLE_AREAS.find(a => a.id === primaryAreaId)?.name ?? primaryAreaId}{areaIds.length > 1 ? ` +${areaIds.length - 1} more` : ''}</p>
            </div>

            <ProjectSyncPanel onProjectLoaded={() => setWizardOpen(false)} />

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Sections</label>
              <div className="space-y-1">
                {SECTION_IDS.map(id => {
                  const alwaysOn = ALWAYS_ON.includes(id);
                  return (
                    <label key={id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-gray-100 ${alwaysOn ? 'opacity-60' : ''}`}>
                      <input
                        type="checkbox"
                        checked={sectionToggles[id] ?? false}
                        disabled={alwaysOn}
                        onChange={() => !alwaysOn && toggleSection(id)}
                        className="accent-indigo-600"
                      />
                      <span className="text-gray-700">{SECTION_HEADINGS[id]}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto space-y-2">
              <button
                onClick={handleExportPDF}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Export PDF
              </button>
              <button
                onClick={handleNewProject}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                New Project
              </button>
            </div>
          </div>

          {/* Right panel */}
          <div className="flex-1 overflow-y-auto p-6 bg-white">
            <div ref={reportRef} className="max-w-3xl mx-auto space-y-10">
              {/* Cover */}
              <div className="border-b border-gray-200 pb-6">
                <div className="flex items-center gap-2 text-indigo-600 mb-2">
                  <Wand2 className="w-5 h-5" />
                  <span className="text-sm font-medium uppercase tracking-wide">Business Case Evidence</span>
                </div>
                <h1 className="text-3xl font-bold text-gray-900">{projectName}</h1>
                <p className="text-gray-500 mt-1">{SAMPLE_AREAS.find(a => a.id === primaryAreaId)?.name ?? primaryAreaId} · {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>

              {/* Narrative sections */}
              {visibleSections.map(id => renderSection(id))}
            </div>
          </div>
        </div>
      )}

      {!projectName && !wizardOpen && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <Wand2 className="w-10 h-10 text-indigo-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Business Case Evidence Builder</h2>
            <p className="text-sm text-gray-500 mb-6">Generate a structured evidence package with data, charts, and strategic alignment for your infrastructure project. Select an area, choose your transport themes, and we assemble the relevant demographics, transport mode shares, growth projections, and gap analysis.</p>
            <button
              onClick={() => setWizardOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
            >
              <Wand2 className="w-5 h-5" />
              Start Business Case Wizard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
