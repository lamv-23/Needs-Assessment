'use client';

import { useState, useRef } from 'react';
import Header from '@/components/layout/Header';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsBarChart from '@/components/charts/BarChart';
import NeedsPieChart from '@/components/charts/PieChart';
import NeedsLineChart from '@/components/charts/LineChart';
import PopulationPyramid from '@/components/charts/PopulationPyramid';
import { useAppStore } from '@/store';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import { useLiveData } from '@/hooks/useLiveData';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';
import { getProjectionsForArea } from '@/lib/data/nsw-projections-data';
import { getCarModeShare, getPTModeShare } from '@/lib/data/transport-helpers';
import { formatNumber, formatPercent, formatCurrency, CHART_COLORS } from '@/lib/utils';
import {
  FileText,
  Download,
  Plus,
  X,
  GripVertical,
  Eye,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
} from 'lucide-react';
import type { Area } from '@/types';

type SectionType =
  | 'demographics'
  | 'transport'
  | 'economy'
  | 'education'
  | 'housing'
  | 'growth'
  | 'custom';

interface ReportSection {
  id: string;
  type: SectionType;
  title: string;
  included: boolean;
  customText?: string;
}

const DEFAULT_SECTIONS: ReportSection[] = [
  { id: 's1', type: 'demographics', title: 'Population & Demographics', included: true },
  { id: 's2', type: 'transport', title: 'Transport & Commuting', included: true },
  { id: 's3', type: 'economy', title: 'Economy & Employment', included: true },
  { id: 's4', type: 'education', title: 'Education', included: false },
  { id: 's5', type: 'housing', title: 'Housing & Land Use', included: false },
  { id: 's6', type: 'growth', title: 'Growth & Projections', included: true },
];

export default function ReportPage() {
  const { selectedArea, selectedYear } = useAppStore();
  const [sections, setSections] = useState<ReportSection[]>(DEFAULT_SECTIONS);
  const [reportTitle, setReportTitle] = useState('Transport Needs Assessment Report');
  const [previewMode, setPreviewMode] = useState(false);
  const [customSections, setCustomSections] = useState<ReportSection[]>([]);
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiError, setAiError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const area = selectedArea || SAMPLE_AREAS.find(a => a.id === 'lga_sydney')!;

  // Live data with sample fallback
  const liveData = useLiveData(area.id, selectedYear);
  const demographics = liveData.demographics.data;
  const transport = liveData.transport.data;
  const economy = liveData.economy.data;
  const education = liveData.education.data;
  const housing = liveData.housing.data;
  const growth = liveData.growth.data;

  // NSW DPE projections (richer than sample projections)
  const nswProjections = (() => {
    const byId = getProjectionsForArea(area.id);
    return byId.length > 0 ? byId : getProjectionsForArea(area.name);
  })();

  // Build unified growth chart data: ERP historical + NSW DPE projection
  const growthChartData = nswProjections.length > 0
    ? nswProjections.map(p => ({ year: p.year, population: p.totalPopulation }))
    : [...growth.populationHistory, ...growth.populationProjections];

  const toggleSection = (id: string) => {
    setSections(sections.map(s => s.id === id ? { ...s, included: !s.included } : s));
  };

  const moveSection = (id: string, direction: 'up' | 'down') => {
    const idx = sections.findIndex(s => s.id === id);
    if (direction === 'up' && idx > 0) {
      const newSections = [...sections];
      [newSections[idx - 1], newSections[idx]] = [newSections[idx], newSections[idx - 1]];
      setSections(newSections);
    } else if (direction === 'down' && idx < sections.length - 1) {
      const newSections = [...sections];
      [newSections[idx], newSections[idx + 1]] = [newSections[idx + 1], newSections[idx]];
      setSections(newSections);
    }
  };

  const addCustomSection = () => {
    const newSection: ReportSection = {
      id: `custom_${Date.now()}`,
      type: 'custom',
      title: 'Custom Section',
      included: true,
      customText: '',
    };
    setSections([...sections, newSection]);
  };

  const updateCustomText = (id: string, text: string) => {
    setSections(sections.map(s => s.id === id ? { ...s, customText: text } : s));
  };

  const updateSectionTitle = (id: string, title: string) => {
    setSections(sections.map(s => s.id === id ? { ...s, title } : s));
  };

  const generateNarrative = async (section: ReportSection) => {
    setAiLoading(prev => ({ ...prev, [section.id]: true }));
    setAiError(null);

    const prompts: Record<SectionType, string> = {
      demographics: `Write the Population & Demographics section for ${area.name}. Population: ${formatNumber(demographics.totalPopulation)}, Median Age: ${demographics.medianAge}, SEIFA score: ${demographics.seifaScore}, car mode share: ${formatPercent(getCarModeShare(transport.journeyToWork))}, PT mode share: ${formatPercent(getPTModeShare(transport.journeyToWork))}.`,
      transport: `Write the Transport & Commuting section for ${area.name}. Car driver mode share: ${formatPercent(getCarModeShare(transport.journeyToWork))}, public transport mode share: ${formatPercent(getPTModeShare(transport.journeyToWork))}, average commute time: ${transport.avgCommute !== null ? `${transport.avgCommute} minutes` : 'not available'}.`,
      economy: `Write the Economy & Employment section for ${area.name}. Unemployment rate: ${formatPercent(economy.unemploymentRate)}, median weekly income: ${formatCurrency(economy.medianWeeklyIncome)}, job density: ${economy.jobDensity !== null ? economy.jobDensity : 'not available'}.`,
      education: `Write the Education section for ${area.name}. Describe educational attainment levels based on available data.`,
      housing: `Write the Housing & Land Use section for ${area.name}. Median weekly rent: ${formatCurrency(housing.medianWeeklyRent)}.`,
      growth: `Write the Growth & Projections section for ${area.name}. Annual growth rate: ${formatPercent(growth.annualGrowthRate)}, projected 2041 population: ${formatNumber(nswProjections.find(p => p.year === 2041)?.totalPopulation ?? growth.populationProjections[3]?.population ?? 0)}.`,
      custom: `Write a brief planning narrative for ${area.name}.`,
    };

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompts[section.type] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error ?? 'AI generation failed');
      } else {
        // For built-in sections, create a custom section with the narrative
        if (section.type === 'custom') {
          updateCustomText(section.id, data.text);
        } else {
          const newSection: ReportSection = {
            id: `ai_${section.id}_${Date.now()}`,
            type: 'custom',
            title: `${section.title} — Analysis`,
            included: true,
            customText: data.text,
          };
          setSections(prev => {
            const idx = prev.findIndex(s => s.id === section.id);
            const next = [...prev];
            next.splice(idx + 1, 0, newSection);
            return next;
          });
        }
      }
    } catch {
      setAiError('Ollama is not running. Start it with: ollama serve');
    } finally {
      setAiLoading(prev => ({ ...prev, [section.id]: false }));
    }
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

      pdf.save(`${reportTitle.replace(/\s+/g, '_')}_${area.name}.pdf`);
    } catch (error) {
      console.error('PDF export failed:', error);
    }
  };

  const includedSections = sections.filter(s => s.included);

  const renderSection = (section: ReportSection) => {
    switch (section.type) {
      case 'demographics':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">Population</div>
                <div className="text-lg font-bold">{formatNumber(demographics.totalPopulation)}</div>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">Median Age</div>
                <div className="text-lg font-bold">{demographics.medianAge}</div>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">SEIFA Score</div>
                <div className="text-lg font-bold">{demographics.seifaScore}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-gray-600 mb-2">Age-Sex Structure</h4>
                <PopulationPyramid data={demographics.ageDistribution} height={250} />
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-600 mb-2">Country of Birth</h4>
                <NeedsPieChart data={demographics.countriesOfBirth} colors={CHART_COLORS} height={250} />
              </div>
            </div>
          </div>
        );
      case 'transport':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">Car Mode Share</div>
                <div className="text-lg font-bold">{formatPercent(getCarModeShare(transport.journeyToWork))}</div>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">PT Mode Share</div>
                <div className="text-lg font-bold">{formatPercent(getPTModeShare(transport.journeyToWork))}</div>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">Avg Commute</div>
                <div className="text-lg font-bold">{transport.avgCommute !== null ? `${transport.avgCommute} min` : 'N/A'}</div>
              </div>
            </div>
            <NeedsBarChart data={transport.journeyToWork} dataKeys={['value']} layout="horizontal" height={280} colors={CHART_COLORS} />
          </div>
        );
      case 'economy':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">Unemployment</div>
                <div className="text-lg font-bold">{formatPercent(economy.unemploymentRate)}</div>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">Median Income</div>
                <div className="text-lg font-bold">{formatCurrency(economy.medianWeeklyIncome)}/wk</div>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">Employment Density</div>
                <div className="text-lg font-bold">{economy.jobDensity !== null ? economy.jobDensity : 'N/A'}</div>
              </div>
            </div>
            <NeedsBarChart data={economy.employmentByIndustry} dataKeys={['value']} layout="horizontal" height={300} colors={CHART_COLORS} />
          </div>
        );
      case 'education':
        return (
          <div className="space-y-4">
            <NeedsBarChart data={education.attainment} dataKeys={['value']} layout="horizontal" height={250} colors={CHART_COLORS} />
          </div>
        );
      case 'housing':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 text-sm">
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">Median Rent</div>
                <div className="text-lg font-bold">{formatCurrency(housing.medianWeeklyRent)}/wk</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <NeedsPieChart data={housing.dwellingTypes} colors={CHART_COLORS} height={220} labelMode="value" valueSuffix="%" />
              <NeedsPieChart data={housing.tenure} colors={CHART_COLORS.slice(4)} height={220} labelMode="value" valueSuffix="%" />
            </div>
          </div>
        );
      case 'growth':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">Annual Growth Rate</div>
                <div className="text-lg font-bold">{formatPercent(growth.annualGrowthRate)}</div>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">2041 Projection</div>
                <div className="text-lg font-bold">
                  {formatNumber(nswProjections.find(p => p.year === 2041)?.totalPopulation ?? growth.populationProjections[3]?.population ?? 0)}
                </div>
              </div>
            </div>
            <NeedsLineChart
              data={growthChartData}
              dataKeys={['population']}
              xAxisKey="year"
              colors={[CHART_COLORS[0]]}
              height={250}
            />
          </div>
        );
      case 'custom':
        return previewMode ? (
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-700 whitespace-pre-wrap">{section.customText || 'No content added.'}</p>
          </div>
        ) : (
          <textarea
            value={section.customText || ''}
            onChange={(e) => updateCustomText(section.id, e.target.value)}
            placeholder="Enter your analysis, narrative, or commentary here..."
            className="w-full h-32 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <Header title="Report Builder" subtitle={`Generate reports for ${area.name}`} />

      <div className="p-6">
        {/* Data source */}
        <div className="mb-4">
          <DataSourceBadge meta={liveData.demographics.meta} isLoading={liveData.isLoading} />
        </div>
        <div className="grid grid-cols-12 gap-6">
          {/* Left: Section controls */}
          <div className="col-span-4 space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Report Settings</h3>
              <input
                type="text"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Report title"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setPreviewMode(!previewMode)}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Eye className="w-4 h-4" /> {previewMode ? 'Edit' : 'Preview'}
                </button>
                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Download className="w-4 h-4" /> Export PDF
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Sections</h3>
              {aiError && (
                <div className="mb-3 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {aiError}
                </div>
              )}
              <div className="space-y-2">
                {sections.map((section, i) => (
                  <div
                    key={section.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                      section.included ? 'bg-primary-50 text-primary-700' : 'bg-gray-50 text-gray-500'
                    }`}
                  >
                    <GripVertical className="w-3.5 h-3.5 text-gray-400 cursor-grab" />
                    <label className="flex items-center gap-2 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={section.included}
                        onChange={() => toggleSection(section.id)}
                        className="rounded"
                      />
                      <span className="flex-1">{section.title}</span>
                    </label>
                    <div className="flex gap-1">
                      <button
                        onClick={() => generateNarrative(section)}
                        disabled={aiLoading[section.id]}
                        title="AI Draft"
                        className="p-0.5 text-violet-400 hover:text-violet-600 disabled:opacity-40"
                      >
                        {aiLoading[section.id]
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Sparkles className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => moveSection(section.id, 'up')} className="p-0.5 hover:text-primary-600" disabled={i === 0}>
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => moveSection(section.id, 'down')} className="p-0.5 hover:text-primary-600" disabled={i === sections.length - 1}>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {section.type === 'custom' && (
                      <button
                        onClick={() => setSections(sections.filter(s => s.id !== section.id))}
                        className="p-0.5 text-red-400 hover:text-red-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={addCustomSection}
                className="flex items-center gap-2 w-full mt-3 px-3 py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary-400 hover:text-primary-600"
              >
                <Plus className="w-4 h-4" /> Add custom section
              </button>
            </div>
          </div>

          {/* Right: Report Preview */}
          <div className="col-span-8">
            <div ref={reportRef} className="bg-white rounded-lg border border-gray-200 p-8 space-y-8">
              {/* Cover */}
              <div className="text-center border-b border-gray-200 pb-8">
                <h1 className="text-2xl font-bold text-gray-900">{reportTitle}</h1>
                <p className="text-lg text-primary-600 mt-2">{area.name}</p>
                <p className="text-sm text-gray-400 mt-1">Census {selectedYear} Data | Generated {new Date().toLocaleDateString('en-AU')}</p>
              </div>

              {/* Sections */}
              {includedSections.map(section => (
                <div key={section.id} className="border-b border-gray-100 pb-6 last:border-0">
                  {section.type === 'custom' && !previewMode ? (
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) => updateSectionTitle(section.id, e.target.value)}
                      className="text-lg font-semibold text-gray-900 mb-4 border-b border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none w-full"
                    />
                  ) : (
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">{section.title}</h2>
                  )}
                  {renderSection(section)}
                </div>
              ))}

              {includedSections.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Select sections from the left panel to build your report</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
