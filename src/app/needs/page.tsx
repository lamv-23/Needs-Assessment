'use client';

import dynamic from 'next/dynamic';
import { Suspense, useCallback, useMemo } from 'react';
import { AlertTriangle, Target } from 'lucide-react';
import Header from '@/components/layout/Header';
import ChartWrapper from '@/components/charts/ChartWrapper';
import LgaMultiSelect from '@/components/needs/LgaMultiSelect';
import ExportDocxButton from '@/components/needs/ExportDocxButton';
import { FigureRegistryProvider } from '@/components/needs/FigureRegistry';
import NarrativeBlock, { sourceAnchor } from '@/components/needs/NarrativeBlock';
import IndicatorTable from '@/components/needs/IndicatorTable';
import NeedsHeatmap from '@/components/needs/NeedsHeatmap';
import DomainScoreChart from '@/components/needs/DomainScoreChart';
import NeedsRadar from '@/components/needs/NeedsRadar';
import IndicatorStripPlot from '@/components/needs/IndicatorStripPlot';
import MismatchScatter from '@/components/needs/MismatchScatter';
import QuadrantScatter from '@/components/needs/QuadrantScatter';
import TrendSmallMultiples from '@/components/needs/TrendSmallMultiples';
import GrowthServiceChart from '@/components/needs/GrowthServiceChart';
import JobsHousingChart from '@/components/needs/JobsHousingChart';
import { useNeedsSelection } from '@/hooks/useNeedsSelection';
import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { runAssessment } from '@/lib/needs/assess';
import { INDICATOR_BY_ID, NEED_DOMAINS } from '@/lib/needs/indicators';
import { TREND_FIGURE_SUBTITLE } from '@/lib/needs/insight-chart-data';
import { buildNarrative } from '@/lib/needs/narrative';
import {
  comparisonLabel, figureCaption, formatNeedsDate, GROWTH_SERVICE_CAPTION, indicatorExcelRows, indicatorTable,
  JOBS_HOUSING_CAPTION, mismatchCaption, NEEDS_SOURCES, stripIndicatorIds, TRENDS_CAPTION,
} from '@/lib/needs/page-data';
import { PEER_GROUP_LABELS } from '@/lib/needs/peer-groups';
import { QUADRANT_SCATTERS, RADAR_AXES, type QuadrantSpec } from '@/lib/needs/project-need';
import type { NeedsMode, Universe } from '@/lib/needs/types';

const NeedsMap = dynamic(() => import('@/components/needs/NeedsMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full rounded-lg bg-gray-100 flex items-center justify-center" style={{ height: 500 }}>
      <p className="text-gray-500 text-sm">Loading map…</p>
    </div>
  ),
});

const MODES: { value: NeedsMode; label: string }[] = [
  { value: 'separate', label: 'Separate' },
  { value: 'combined', label: 'Combined' },
];

const UNIVERSES: { value: Universe; label: string }[] = [
  { value: 'nsw', label: 'NSW' },
  { value: 'gsyd', label: 'Greater Sydney' },
  { value: 'region', label: 'Region' },
  { value: 'peer', label: 'Similar LGAs' },
];

/** Under each quadrant scatter's title; the figure ids are the specs' (`growth-service`, `disadvantage-service`). */
const QUADRANT_SUBTITLES: Record<QuadrantSpec['id'], string> = {
  'growth-service':
    'Projected population growth 2021–41 against weekday AM-peak departures per 1,000 residents, one panel for each '
    + 'comparison group of the selected areas. Shaded: above-median growth with below-median service.',
  'disadvantage-service':
    'SEIFA disadvantage against weekday AM-peak departures per 1,000 residents, one panel for each comparison group '
    + 'of the selected areas. Shaded: more disadvantage than the median with below-median service.',
};

const EMPTY_STATE = 'Select one or more LGAs, a region, or click the map to start an assessment.';

const snapshotDate = formatNeedsDate(NEEDS_SNAPSHOT.generatedAt);

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

function NeedsContent() {
  // The one selection hook for the page: its optimistic state is per instance, so everything below gets props.
  const { areaIds, invalidIds, mode, universe, setAreaIds, setMode, setUniverse } = useNeedsSelection();

  const assessment = useMemo(
    () => runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds, mode, universe }),
    [areaIds, mode, universe],
  );
  const sections = useMemo(() => buildNarrative(assessment), [assessment]);
  const table = useMemo(() => indicatorTable(assessment), [assessment]);
  const tableRows = useMemo(() => indicatorExcelRows(table), [table]);
  const tableHeaders = useMemo(
    () => ({ indicator: 'Indicator', source: 'Source', ...Object.fromEntries(table.columns.map(c => [c, c])) }),
    [table],
  );
  const stripIds = useMemo(() => stripIndicatorIds(assessment.areas), [assessment.areas]);

  const toggleArea = useCallback(
    (id: string) => setAreaIds(areaIds.includes(id) ? areaIds.filter(a => a !== id) : [...areaIds, id]),
    [areaIds, setAreaIds],
  );

  const { areas } = assessment;
  const hasAreas = areas.length > 0;
  const keyFindings = sections.find(s => s.id === 'key_findings');
  const summary = sections.find(s => s.id === 'summary');
  const furtherFindings = sections.find(s => s.id === 'insights');
  const notes = sections.find(s => s.id === 'notes');
  const domainSections = sections.filter(s => NEED_DOMAINS.some(domain => domain === s.id));
  const comparison = comparisonLabel(areas);
  // Every figure shows all the indicators, except a strip plot, which shows one.
  const allSources = figureCaption();
  const radarSources = figureCaption(RADAR_AXES.map(axis => axis.id));
  const mismatchSources = useMemo(() => mismatchCaption(assessment), [assessment]);

  return (
    <FigureRegistryProvider>
      <div className="p-6 space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
          <LgaMultiSelect selected={areaIds} onChange={setAreaIds} />

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span id="needs-mode-label" className="font-medium">Show areas</span>
              <div role="group" aria-labelledby="needs-mode-label" className="inline-flex overflow-hidden rounded-lg border border-gray-300">
                {MODES.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
                    aria-pressed={mode === m.value}
                    className={`px-3 py-1.5 text-sm transition-colors ${
                      mode === m.value ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-600">
              <span className="font-medium">Compare against</span>
              <select
                value={universe}
                onChange={e => setUniverse(e.target.value as Universe)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {UNIVERSES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </label>

            {universe === 'peer' && hasAreas && (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600" aria-label="Peer groups">
                {areas.map(area => (
                  <li key={area.areaId}>
                    <span className="font-medium text-gray-800">{area.name}</span>
                    {': '}
                    {area.peerGroup ? PEER_GROUP_LABELS[area.peerGroup] : 'spans several peer groups'}
                  </li>
                ))}
              </ul>
            )}

            <ExportDocxButton assessment={assessment} sections={sections} />
          </div>
        </div>

        {invalidIds.length > 0 && (
          <Notice>
            Not recognised as an NSW LGA and left out: {invalidIds.join(', ')}. This page assesses LGAs only.
          </Notice>
        )}
        {assessment.universeFallback && (
          <Notice>
            The selected LGAs span more than one {assessment.requestedUniverse === 'region' ? 'region' : 'peer group'},
            so the combined area is compared with NSW LGAs instead.
          </Notice>
        )}

        {!hasAreas && (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-white px-6 py-8 text-gray-600">
            <Target className="h-6 w-6 shrink-0 text-gray-400" aria-hidden="true" />
            <p className="text-base">{EMPTY_STATE}</p>
          </div>
        )}

        {keyFindings && <NarrativeBlock section={keyFindings} />}
        {summary && <NarrativeBlock section={summary} />}

        {/* Figures in a fixed order, all mounted together once an area is selected, so the registry's
            numbering is the on-screen order. The map alone also shows with no selection (to click LGAs). */}
        <ChartWrapper
          figureId={hasAreas ? 'need-map' : undefined}
          title="Need map"
          subtitle="Overall need score of every NSW LGA. Click an LGA to add it to, or remove it from, the selection."
          caption={allSources}
        >
          <NeedsMap assessment={assessment} onToggle={toggleArea} />
        </ChartWrapper>

        {hasAreas && (
          <>
            <ChartWrapper
              figureId="domain-scores"
              title="Domain scores"
              subtitle="Score out of 100 for each need domain: the equally weighted mean of its indicator percentiles."
              caption={allSources}
            >
              <DomainScoreChart assessment={assessment} />
            </ChartWrapper>

            <ChartWrapper
              figureId="need-heatmap"
              title="Need heatmap"
              subtitle="Need percentile of every indicator within the comparison group; darker means more need."
              caption={allSources}
            >
              <NeedsHeatmap assessment={assessment} />
            </ChartWrapper>

            <ChartWrapper
              figureId="domain-profile"
              title="Need profile"
              subtitle="Need percentile of each area on five measures of the case for transport projects, against a typical LGA of the comparison group."
              caption={radarSources}
            >
              <NeedsRadar assessment={assessment} />
            </ChartWrapper>

            {QUADRANT_SCATTERS.map(spec => (
              <ChartWrapper
                key={spec.id}
                figureId={spec.id}
                title={spec.title}
                subtitle={QUADRANT_SUBTITLES[spec.id]}
                caption={figureCaption([spec.x, spec.y])}
              >
                <QuadrantScatter assessment={assessment} spec={spec} />
              </ChartWrapper>
            ))}

            {/* Slots, not indicators, are the figure ids: the plots change with the selection but keep their numbers. */}
            {stripIds.map((id, slot) => (
              <ChartWrapper
                key={`strip-${slot}`}
                figureId={`strip-${slot + 1}`}
                title={`${INDICATOR_BY_ID[id].label}: selected areas against NSW LGAs`}
                subtitle="One of the six indicators on which the selection ranks highest for need."
                caption={figureCaption([id])}
              >
                <IndicatorStripPlot assessment={assessment} indicatorId={id} />
              </ChartWrapper>
            ))}

            <ChartWrapper
              figureId="car-dependency-mismatch"
              title="Car dependency against expected"
              subtitle="Actual car dependency against the level expected for the LGA's setting, with the model's R² and number of LGAs."
              caption={mismatchSources}
            >
              <MismatchScatter assessment={assessment} />
            </ChartWrapper>

            <ChartWrapper
              figureId="trends"
              title="Trends in car dependency, road crashes and population"
              subtitle={TREND_FIGURE_SUBTITLE}
              caption={TRENDS_CAPTION}
            >
              <TrendSmallMultiples assessment={assessment} />
            </ChartWrapper>

            <ChartWrapper
              figureId="service-in-2041"
              title="AM-peak service per resident, today and in 2041"
              subtitle="Weekday 7-9am departures per 1,000 residents, if service stays at today's level while the population grows as projected."
              caption={GROWTH_SERVICE_CAPTION}
            >
              <GrowthServiceChart assessment={assessment} />
            </ChartWrapper>

            <ChartWrapper
              figureId="jobs-housing"
              title="Local jobs per resident, 2021 and 2041"
              subtitle="TfNSW TZP24 jobs divided by residents: ABS ERP in 2021 and the NSW DPE projection in 2041."
              caption={JOBS_HOUSING_CAPTION}
            >
              <JobsHousingChart assessment={assessment} />
            </ChartWrapper>
          </>
        )}

        {domainSections.map(section => <NarrativeBlock key={section.id} section={section} />)}

        {furtherFindings && <NarrativeBlock section={furtherFindings} />}

        {hasAreas && (
          <ChartWrapper
            title="Indicator values"
            subtitle="Each indicator for the selected areas, Greater Sydney and NSW."
            data={tableRows}
            headerLabels={tableHeaders}
          >
            <IndicatorTable table={table} comparison={comparison} />
          </ChartWrapper>
        )}

        {notes && <NarrativeBlock section={notes} />}

        {hasAreas && (
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Sources</h2>
            <ol className="space-y-2 text-sm text-gray-700">
              {NEEDS_SOURCES.map((source, i) => (
                <li key={source.full} id={sourceAnchor(i + 1)} className="flex gap-2 scroll-mt-6">
                  <span className="w-6 shrink-0 text-right tabular-nums text-gray-500">{i + 1}.</span>
                  <span>
                    {source.full}
                    {source.url && (
                      <>
                        {'. '}
                        <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-all text-primary-700 hover:underline">
                          {source.url}
                        </a>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-gray-500">Indicator snapshot built {snapshotDate}.</p>
          </section>
        )}
      </div>
    </FigureRegistryProvider>
  );
}

export default function NeedsPage() {
  return (
    <div>
      <Header title="Needs Assessment" subtitle="Compare LGAs on transport, socio-economic and growth need" />
      {/* useSearchParams (the selection lives in the URL) needs a Suspense boundary for `next build`. */}
      <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading needs assessment…</div>}>
        <NeedsContent />
      </Suspense>
    </div>
  );
}
