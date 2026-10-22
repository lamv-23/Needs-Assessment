'use client';

import { useMemo } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import ChoroplethMapDirect from '@/components/maps/ChoroplethMapDirect';
import { escapeHtml, NEED_STEPS, NeedMapLegend, NSW_CENTRE, NSW_ZOOM, SELECTED_OUTLINE } from '@/components/needs/mapParts';
import { NO_DATA_COLOR, needColor } from '@/lib/needs/colors';
import { describeMapScore, mapScores, mapUniverseNote } from '@/lib/needs/map-data';
import type { NeedsAssessment } from '@/lib/needs/types';

const MAP_HEIGHT = 500;
const LEGEND_STEPS = [...NEED_STEPS, { fill: NO_DATA_COLOR, label: 'No score' }];

// A stable function, so the map restyles only when the scores or the selection change.
const colorForNeed = (score: number | undefined) => needColor(score ?? null);

/**
 * Every NSW LGA shaded by its overall need score against the assessment's comparison universe;
 * the selected LGAs are outlined and the view is fitted to them (all of NSW when none is selected).
 * Clicking an LGA calls `onToggle` with its area id. The page loads the LGA boundaries (`useBoundaries`, P2-R19), so
 * the Word export can wait for them. Load it with `dynamic(() => import(...), { ssr: false })`: Leaflet needs the DOM.
 */
export default function NeedsMap({
  assessment,
  onToggle,
  boundaries,
  failed,
}: {
  assessment: NeedsAssessment;
  onToggle: (areaId: string) => void;
  /** The LGA boundaries; null while they load or when they could not be loaded (`failed`). */
  boundaries: FeatureCollection | null;
  failed: boolean;
}) {

  // Keyed on the snapshot and universe, not the assessment: toggling the selection must not rebuild the map layer.
  const { records, universe, memberIds } = assessment;
  const scores = useMemo(() => mapScores({ records, universe }), [records, universe]);
  const names = useMemo(() => new Map(records.map((r) => [r.areaId, r.name])), [records]);

  const shaded = useMemo<FeatureCollection | null>(
    () =>
      boundaries && {
        ...boundaries,
        features: boundaries.features.map((feature) => ({
          ...feature,
          properties: { ...feature.properties, need: scores.get(feature.properties?.id)?.score ?? null },
        })),
      },
    [boundaries, scores],
  );

  const selected = useMemo(() => new Set(memberIds), [memberIds]);
  const tooltip = (feature: Feature) => {
    const id = feature.properties?.id as string;
    const name = names.get(id) ?? (feature.properties?.name as string | undefined) ?? id;
    return (
      `<strong>${escapeHtml(name)}</strong><br/>${escapeHtml(describeMapScore(scores.get(id)))}` +
      `<br/><span style="color:#4b5563">${selected.has(id) ? 'Selected · click to remove' : 'Click to select'}</span>`
    );
  };
  const toggle = (feature: Feature) => {
    const id = feature.properties?.id;
    if (typeof id === 'string') onToggle(id);
  };

  if (!shaded) {
    return (
      <div className="w-full rounded-lg bg-gray-100 flex items-center justify-center" style={{ height: MAP_HEIGHT }}>
        <p className="text-gray-500 text-sm">{failed ? 'The LGA boundaries could not be loaded.' : 'Loading map…'}</p>
      </div>
    );
  }

  return (
    <div>
      <ChoroplethMapDirect
        geoJsonData={shaded}
        valueField="need"
        colorForValue={colorForNeed}
        selectedAreaIds={memberIds}
        // Framed on the selection (NSW when empty); the wheel is left to the page scroll.
        focusAreaIds={memberIds}
        scrollWheelZoom={false}
        selectedColor={SELECTED_OUTLINE}
        fillOpacity={1}
        onAreaClick={toggle}
        getTooltip={tooltip}
        height={MAP_HEIGHT}
        center={NSW_CENTRE}
        zoom={NSW_ZOOM}
        // No basemap: the choropleth alone exports cleanly, with no cross-origin tiles to taint the canvas.
        basemap={false}
        showLegend={false}
      />
      <NeedMapLegend
        note={`Shading shows each LGA's overall need score (0–100); darker means more need. ${mapUniverseNote(universe)}`}
        steps={LEGEND_STEPS}
      />
    </div>
  );
}
