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
import Sa2RankingTable from '@/components/needs/Sa2RankingTable';
import CatchmentChart from '@/components/needs/CatchmentChart';
import { useBoundaries } from '@/hooks/useBoundaries';
import { useNeedsSelection } from '@/hooks/useNeedsSelection';
import { useSa2Needs } from '@/hooks/useSa2Needs';
import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { runAssessment } from '@/lib/needs/assess';
import { LGA_BOUNDARIES_URL, SA2_BOUNDARIES_URL } from '@/lib/needs/boundaries';
import { INDICATOR_BY_ID, NEED_DOMAINS } from '@/lib/needs/indicators';
import { TREND_FIGURE_SUBTITLE } from '@/lib/needs/insight-chart-data';
import {
  catchmentExcel, domainScoresExcel, growthServiceExcel, indicatorTableExcel, jobsHousingExcel, mismatchExcel, needMapExcel,
  quadrantExcel, radarExcel, sa2MapExcel, sa2TableExcel, stripExcel, trendsExcel,
} from '@/lib/needs/excel-data';
import { buildNarrative } from '@/lib/needs/narrative';
import {
  CATCHMENT_CAPTION, CATCHMENT_TITLE, comparisonLabel, exportWaitingFor, figureCaption, formatNeedsDate,
  GROWTH_SERVICE_CAPTION, indicatorTable, JOBS_HOUSING_CAPTION, mismatchCaption, NEEDS_SOURCES, SA2_MAP_CAPTION,
  SA2_MAP_TITLE, SA2_TABLE_CAPTION, sa2Table, stripIndicatorIds, trendsCaption,
} from '@/lib/needs/page-data';
import { SA2_RANKED_CRITERIA, SA2_SHARE_THRESHOLD } from '@/lib/needs/sa2';
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

const SA2_MAP_HEIGHT = 460;

const Sa2NeedsMap = dynamic(() => import('@/components/needs/Sa2NeedsMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full rounded-lg bg-gray-100 flex items-center justify-center" style={{ height: SA2_MAP_HEIGHT }}>
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

/** "Blacktown" by area id, for the SA2 map's tooltips. */
const LGA_NAMES = new Map(NEEDS_SNAPSHOT.records.map(r => [r.areaId, r.name]));

const SA2_INTRO =
  `The SA2s (ABS Statistical Areas Level 2) with at least ${Math.round(SA2_SHARE_THRESHOLD * 100)}% of their residents in a `
  + `selected LGA, each scored against the NSW SA2s ${SA2_RANKED_CRITERIA}, whatever the comparison group above. `
  + 'SA2 scores use the indicators available for SA2s, so they cover the transport and socio-economic domains only: '
  + 'there are no growth indicators for SA2s.';
const SA2_ERROR = 'The SA2 data could not be loaded. Reload the page to try again.';
// Why a map figure is left out of the Word export (P2-R19, R22)
const SA2_DATA_FAILED = 'the SA2 data could not be loaded';
const BOUNDARIES_FAILED = 'the map boundaries could not be loaded';

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

/** Inside a drill-down figure until the SA2 file is in: a skeleton while it loads, a message if it failed. */
function Sa2Pending({ failed, height }: { failed: boolean; height: number }) {
  if (failed) return <p className="text-sm text-gray-600">{SA2_ERROR}</p>;
  return (
    <div role="status" aria-busy="true" className="w-full animate-pulse rounded-lg bg-gray-100 flex items-center justify-center" style={{ height }}>
      <p className="text-gray-500 text-sm">Loading SA2 data…</p>
    </div>
  );
}

/** The pockets of need's place on the page until the SA2 file is in. */
function PocketsPending({ failed }: { failed: boolean }) {
  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Pockets of need</h2>
      {failed ? (
        <p className="text-sm text-gray-600">{SA2_ERROR}</p>
      ) : (
        <div role="status" aria-busy="true" className="space-y-2">
          <span className="sr-only">Loading SA2 data…</span>
          <div className="h-3 w-11/12 animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-gray-100" />
        </div>
      )}
    </section>
  );
}

function NeedsContent() {
  // The one selection hook for the page: its optimistic state is per instance, so everything below gets props.
  const { areaIds, invalidIds, mode, universe, setAreaIds, setMode, setUniverse } = useNeedsSelection();

  const assessment = useMemo(
    () => runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds, mode, universe }),
    [areaIds, mode, universe],
  );
  // The SA2 drill-down (P2-R5): its figures are mounted with the others and fill in when the file arrives
  const sa2 = useSa2Needs();
  const sa2File = sa2.file;
  const sa2Failed = sa2.error !== null && sa2File === null;
  // The maps' boundaries load here, not in the maps, so the Word export waits for them and leaves out a map whose
  // boundaries could not be loaded (P2-R19). The SA2 boundaries (1.2 MB) are fetched only once an area is selected.
  const hasAreas = assessment.areas.length > 0;
  const lgaBoundaries = useBoundaries(LGA_BOUNDARIES_URL);
  const sa2Boundaries = useBoundaries(hasAreas ? SA2_BOUNDARIES_URL : null);
  const sa2MapBoundaries = useMemo(
    () => (sa2Boundaries.boundaries && lgaBoundaries.boundaries
      ? { sa2: sa2Boundaries.boundaries, lga: lgaBoundaries.boundaries }
      : null),
    [sa2Boundaries.boundaries, lgaBoundaries.boundaries],
  );
  const sa2BoundariesFailed = sa2Boundaries.error !== null || lgaBoundaries.error !== null;
  let sa2MapUnavailable: string | null = null;
  if (sa2Failed) sa2MapUnavailable = SA2_DATA_FAILED;
  else if (sa2BoundariesFailed) sa2MapUnavailable = BOUNDARIES_FAILED;
  const sections = useMemo(
    () => buildNarrative(assessment, sa2File ? { file: sa2File } : undefined),
    [assessment, sa2File],
  );
  const table = useMemo(() => indicatorTable(assessment), [assessment]);
  const sa2Rows = useMemo(() => (sa2File ? sa2Table(sa2File, assessment) : null), [sa2File, assessment]);
  const stripIds = useMemo(() => stripIndicatorIds(assessment.areas), [assessment.areas]);
  // Every figure's Excel data, as numbers (R64); the heatmap's cells are the indicator table's
  const excel = useMemo(() => ({
    map: needMapExcel(assessment),
    domains: domainScoresExcel(assessment),
    indicators: indicatorTableExcel(assessment),
    radar: radarExcel(assessment),
    quadrants: Object.fromEntries(QUADRANT_SCATTERS.map(spec => [spec.id, quadrantExcel(assessment, spec)])),
    strips: stripIds.map(id => stripExcel(assessment, id)),
    mismatch: mismatchExcel(assessment),
    trends: trendsExcel(assessment),
    growth: growthServiceExcel(assessment),
    jobs: jobsHousingExcel(assessment),
    sa2Map: sa2File ? sa2MapExcel(sa2File, assessment) : {},
    sa2Table: sa2File ? sa2TableExcel(sa2File, assessment) : {},
    catchments: catchmentExcel(assessment),
  }), [assessment, stripIds, sa2File]);

  const toggleArea = useCallback(
    (id: string) => setAreaIds(areaIds.includes(id) ? areaIds.filter(a => a !== id) : [...areaIds, id]),
    [areaIds, setAreaIds],
  );

  const { areas } = assessment;
  const keyFindings = sections.find(s => s.id === 'key_findings');
  const summary = sections.find(s => s.id === 'summary');
  const furtherFindings = sections.find(s => s.id === 'insights');
  const pockets = sections.find(s => s.id === 'pockets');
  const notes = sections.find(s => s.id === 'notes');
  const domainSections = sections.filter(s => NEED_DOMAINS.some(domain => domain === s.id));
  const comparison = comparisonLabel(areas);
  // Every figure shows all the indicators, except a strip plot, which shows one.
  const allSources = figureCaption();
  const radarSources = figureCaption(RADAR_AXES.map(axis => axis.id));
  const mismatchSources = useMemo(() => mismatchCaption(assessment), [assessment]);
  const trendSources = useMemo(() => trendsCaption(assessment), [assessment]);

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

            <ExportDocxButton
              assessment={assessment}
              sections={sections}
              sa2Table={sa2Rows}
              // The document waits for the SA2 file and the map boundaries; a map whose data or boundaries failed is
              // left out and named (P2-R5, P2-R19, R22)
              waitingFor={exportWaitingFor({
                sa2Data: sa2.isLoading,
                boundaries: lgaBoundaries.isLoading || sa2Boundaries.isLoading,
              })}
            />
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
          unavailable={lgaBoundaries.error ? BOUNDARIES_FAILED : null}
          {...excel.map}
        >
          <NeedsMap
            assessment={assessment}
            onToggle={toggleArea}
            boundaries={lgaBoundaries.boundaries}
            failed={lgaBoundaries.error !== null}
          />
        </ChartWrapper>

        {hasAreas && (
          <>
            <ChartWrapper
              figureId="domain-scores"
              title="Domain scores"
              subtitle="Score out of 100 for each need domain: the equally weighted mean of its indicator percentiles."
              caption={allSources}
              {...excel.domains}
            >
              <DomainScoreChart assessment={assessment} />
            </ChartWrapper>

            <ChartWrapper
              figureId="need-heatmap"
              title="Need heatmap"
              subtitle="Need percentile of every indicator within the comparison group; darker means more need."
              caption={allSources}
              {...excel.indicators}
            >
              <NeedsHeatmap assessment={assessment} />
            </ChartWrapper>

            <ChartWrapper
              figureId="domain-profile"
              title="Need profile"
              subtitle="Need percentile of each area on five measures of the case for transport projects, against a typical LGA of the comparison group."
              caption={radarSources}
              {...excel.radar}
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
                {...excel.quadrants[spec.id]}
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
                {...excel.strips[slot]}
              >
                <IndicatorStripPlot assessment={assessment} indicatorId={id} />
              </ChartWrapper>
            ))}

            <ChartWrapper
              figureId="car-dependency-mismatch"
              title="Car dependency against expected"
              subtitle="Actual car dependency against the level expected for the LGA's setting, with the model's R² and number of LGAs."
              caption={mismatchSources}
              {...excel.mismatch}
            >
              <MismatchScatter assessment={assessment} />
            </ChartWrapper>

            <ChartWrapper
              figureId="trends"
              title="Trends in car dependency, road crashes and population"
              subtitle={TREND_FIGURE_SUBTITLE}
              caption={trendSources}
              {...excel.trends}
            >
              <TrendSmallMultiples assessment={assessment} />
            </ChartWrapper>

            <ChartWrapper
              figureId="service-in-2041"
              title="AM-peak service per resident, today and in 2041"
              subtitle="Weekday 7-9am departures per 1,000 residents, if service stays at today's level while the population grows as projected."
              caption={GROWTH_SERVICE_CAPTION}
              {...excel.growth}
            >
              <GrowthServiceChart assessment={assessment} />
            </ChartWrapper>

            <ChartWrapper
              figureId="jobs-housing"
              title="Local jobs per resident, 2021 and 2041"
              subtitle="TfNSW TZP24 jobs divided by residents: ABS ERP in 2021 and the NSW DPE projection in 2041."
              caption={JOBS_HOUSING_CAPTION}
              {...excel.jobs}
            >
              <JobsHousingChart assessment={assessment} />
            </ChartWrapper>
          </>
        )}

        {domainSections.map(section => <NarrativeBlock key={section.id} section={section} />)}

        {/* The SA2 drill-down: its two figures follow the jobs-housing figure in the fixed order (P2-R5). */}
        {hasAreas && (
          <>
            <section aria-labelledby="sa2-drill-down" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 id="sa2-drill-down" className="text-lg font-semibold text-gray-900">Areas within the selection</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-700">{SA2_INTRO}</p>
            </section>

            {sa2Failed && (
              <Notice>
                The SA2 data could not be loaded, so the SA2 map, table and pockets of need are not shown and are left
                out of the Word export. The rest of the assessment is unaffected. Reload the page to try again.
              </Notice>
            )}

            <ChartWrapper
              figureId="sa2-need-map"
              title={SA2_MAP_TITLE}
              subtitle="Overall need of each SA2 in the selected LGAs as a percentile among NSW SA2s, with the selected LGAs outlined."
              caption={SA2_MAP_CAPTION}
              unavailable={sa2MapUnavailable}
              {...excel.sa2Map}
            >
              {sa2File ? (
                <Sa2NeedsMap
                  file={sa2File}
                  lgaIds={assessment.memberIds}
                  lgaNames={LGA_NAMES}
                  boundaries={sa2MapBoundaries}
                  failed={sa2BoundariesFailed}
                />
              ) : <Sa2Pending failed={sa2Failed} height={SA2_MAP_HEIGHT} />}
            </ChartWrapper>

            <ChartWrapper
              title="Highest-need SA2s"
              subtitle="The SA2s in the selected LGAs with the highest overall SA2 need score."
              caption={SA2_TABLE_CAPTION}
              {...excel.sa2Table}
            >
              {sa2Rows ? <Sa2RankingTable table={sa2Rows} /> : <Sa2Pending failed={sa2Failed} height={240} />}
            </ChartWrapper>

            <ChartWrapper
              figureId="catchments"
              title={CATCHMENT_TITLE}
              subtitle="Share of residents within a straight-line walk of a stop with frequent, or any, weekday AM-peak service, against Greater Sydney and NSW."
              caption={CATCHMENT_CAPTION}
              {...excel.catchments}
            >
              <CatchmentChart assessment={assessment} />
            </ChartWrapper>

            {pockets ? <NarrativeBlock section={pockets} /> : <PocketsPending failed={sa2Failed} />}
          </>
        )}

        {furtherFindings && <NarrativeBlock section={furtherFindings} />}

        {hasAreas && (
          <ChartWrapper
            title="Indicator values"
            subtitle="Each indicator for the selected areas, Greater Sydney and NSW."
            {...excel.indicators}
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
