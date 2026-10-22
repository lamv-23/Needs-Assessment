'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import ChoroplethMapDirect from '@/components/maps/ChoroplethMapDirect';
import { NEED_SCALE, NO_DATA_COLOR, needColor } from '@/lib/needs/colors';
import { describeMapScore, mapScores, mapUniverseNote } from '@/lib/needs/map-data';
import type { NeedsAssessment } from '@/lib/needs/types';

const BOUNDARIES_URL = '/geo/lga-nsw-simple.json';
const NSW_CENTRE: [number, number] = [-32.8, 147];
const NSW_ZOOM = 6;
const SELECTED_OUTLINE = '#111827';
const SWATCH_STROKE = '#cbd5e1';
const MAP_HEIGHT = 500;

let boundariesRequest: Promise<FeatureCollection> | null = null;

/** The simplified LGA boundaries, fetched once per page load. A failed request is retried by the next caller. */
function loadBoundaries(): Promise<FeatureCollection> {
  if (!boundariesRequest) {
    boundariesRequest = fetch(BOUNDARIES_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${BOUNDARIES_URL}`);
        return res.json() as Promise<FeatureCollection>;
      })
      .catch((error) => {
        boundariesRequest = null;
        throw error;
      });
  }
  return boundariesRequest;
}

// A stable function, so the map restyles only when the scores or the selection change.
const colorForNeed = (score: number | undefined) => needColor(score ?? null);

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

function Legend({ universeNote }: { universeNote: string }) {
  const steps = [
    ...NEED_SCALE.map((fill, i) => ({ fill, label: `${i * 20}–${(i + 1) * 20}` })),
    { fill: NO_DATA_COLOR, label: 'No score' },
  ];
  return (
    <div className="mt-2 text-xs text-gray-600">
      <p>
        Shading shows each LGA&apos;s overall need score (0–100); darker means more need. {universeNote}
      </p>
      <ul className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-900">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3.5 w-[18px]"
              style={{ backgroundColor: step.fill, border: `1px solid ${SWATCH_STROKE}` }}
            />
            {step.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span
            className="inline-block h-3.5 w-[18px] bg-white"
            style={{ border: `3px solid ${SELECTED_OUTLINE}` }}
          />
          Selected LGA
        </li>
      </ul>
    </div>
  );
}

/**
 * Every NSW LGA shaded by its overall need score against the assessment's comparison universe;
 * the selected LGAs are outlined. Clicking an LGA calls `onToggle` with its area id. Load it with
 * `dynamic(() => import(...), { ssr: false })`: Leaflet needs the DOM.
 */
export default function NeedsMap({
  assessment,
  onToggle,
}: {
  assessment: NeedsAssessment;
  onToggle: (areaId: string) => void;
}) {
  const [boundaries, setBoundaries] = useState<FeatureCollection | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    loadBoundaries()
      .then((collection) => {
        if (current) setBoundaries(collection);
      })
      .catch((error) => {
        console.error('Failed to load LGA boundaries:', error);
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, []);

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
      <Legend universeNote={mapUniverseNote(universe)} />
    </div>
  );
}
