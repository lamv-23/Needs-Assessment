'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import ChoroplethMapDirect from '@/components/maps/ChoroplethMapDirect';
import { NEED_SCALE, NO_DATA_COLOR, needColor } from '@/lib/needs/colors';
import { LOW_POPULATION_REASON, SA2_MAP_NOTE, sa2MapEntries, type Sa2MapEntry } from '@/lib/needs/map-data';
import { SA2_LOW_POPULATION } from '@/lib/needs/sa2';
import type { Sa2NeedsFile } from '@/lib/needs/types';

const SA2_BOUNDARIES_URL = '/geo/sa2-nsw-simple.json';
const LGA_BOUNDARIES_URL = '/geo/lga-nsw-simple.json';
const NSW_CENTRE: [number, number] = [-32.8, 147];
const NSW_ZOOM = 6;
const LGA_OUTLINE = '#111827';
const SWATCH_STROKE = '#cbd5e1';
/** A low-population SA2: a mid grey, darker than "No data" and off the need scale. */
const LOW_POPULATION_COLOR = '#9ca3af';
/** The `need` value that marks a low-population SA2, which has no percentile (percentiles run 0-100). */
const LOW_POPULATION_VALUE = -1;
const MAP_HEIGHT = 460;

const requests = new Map<string, Promise<FeatureCollection>>();

/** A boundary file, fetched once per page load (the need map shares the LGA file). A failed request is retried by the next caller. */
function loadBoundaries(url: string): Promise<FeatureCollection> {
  let request = requests.get(url);
  if (!request) {
    request = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return res.json() as Promise<FeatureCollection>;
      })
      .catch((error) => {
        requests.delete(url);
        throw error;
      });
    requests.set(url, request);
  }
  return request;
}

// A stable function, so the map restyles only when the shading changes.
const colorForNeed = (value: number | undefined) =>
  value === LOW_POPULATION_VALUE ? LOW_POPULATION_COLOR : needColor(value ?? null);

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

function Swatch({ fill, border = `1px solid ${SWATCH_STROKE}` }: { fill: string; border?: string }) {
  return <span className="inline-block h-3.5 w-[18px]" style={{ backgroundColor: fill, border }} />;
}

function Legend() {
  const steps = [
    ...NEED_SCALE.map((fill, i) => ({ fill, label: `${i * 20}–${(i + 1) * 20}` })),
    { fill: LOW_POPULATION_COLOR, label: `${LOW_POPULATION_REASON} (under ${SA2_LOW_POPULATION} residents)` },
    { fill: NO_DATA_COLOR, label: 'No data' },
  ];
  return (
    <div data-figure-legend className="mt-2 text-xs text-gray-600">
      <p>{SA2_MAP_NOTE}</p>
      <ul className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-900">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-1.5">
            <Swatch fill={step.fill} />
            {step.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <Swatch fill="#ffffff" border={`3px solid ${LGA_OUTLINE}`} />
          Selected LGA
        </li>
      </ul>
    </div>
  );
}

/**
 * The SA2s in the drill-down of the selected LGAs (`sa2MapEntries`), each shaded by the need percentile of its overall
 * SA2 score among NSW SA2s, low-population SA2s in grey, with the selected LGAs outlined and the view fitted to the
 * SA2s. Load it with `dynamic(() => import(...), { ssr: false })`: Leaflet needs the DOM.
 */
export default function Sa2NeedsMap({
  file,
  lgaIds,
  lgaNames,
}: {
  file: Sa2NeedsFile;
  lgaIds: string[];
  /** LGA names by area id, for the tooltips. */
  lgaNames: Map<string, string>;
}) {
  const [boundaries, setBoundaries] = useState<{ sa2: FeatureCollection; lga: FeatureCollection } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all([loadBoundaries(SA2_BOUNDARIES_URL), loadBoundaries(LGA_BOUNDARIES_URL)])
      .then(([sa2, lga]) => {
        if (current) setBoundaries({ sa2, lga });
      })
      .catch((error) => {
        console.error('Failed to load SA2 or LGA boundaries:', error);
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, []);

  // Keyed on the LGAs, not the array: a new assessment of the same selection must not rebuild the map layer.
  const lgaKey = lgaIds.join('|');
  const selectedIds = useMemo(() => (lgaKey === '' ? [] : lgaKey.split('|')), [lgaKey]);
  const entries = useMemo(() => sa2MapEntries(file, selectedIds, lgaNames), [file, selectedIds, lgaNames]);
  const byCode = useMemo(() => new Map(entries.map((e) => [e.code, e])), [entries]);

  // The drill-down's SA2s (the two with no geometry are never in one), keyed by `id` so the map can fit to them.
  const shaded = useMemo<FeatureCollection | null>(() => {
    if (!boundaries) return null;
    const need = (entry: Sa2MapEntry) => (entry.lowPopulation ? LOW_POPULATION_VALUE : entry.percentile);
    return {
      ...boundaries.sa2,
      features: boundaries.sa2.features.flatMap((feature) => {
        const entry = byCode.get(feature.properties?.code);
        return entry && feature.geometry ? [{ ...feature, properties: { ...feature.properties, id: entry.code, need: need(entry) } }] : [];
      }),
    };
  }, [boundaries, byCode]);

  const outlines = useMemo<FeatureCollection | null>(() => {
    if (!boundaries) return null;
    const selected = new Set(selectedIds);
    return { ...boundaries.lga, features: boundaries.lga.features.filter((f) => selected.has(f.properties?.id)) };
  }, [boundaries, selectedIds]);

  const tooltip = (feature: Feature) => {
    const entry = byCode.get(feature.properties?.id as string);
    if (!entry) return '';
    const [name, ...rest] = entry.lines;
    return `<strong>${escapeHtml(name)}</strong>${rest.map((line) => `<br/>${escapeHtml(line)}`).join('')}`;
  };

  if (!shaded || !outlines) {
    return (
      <div className="w-full rounded-lg bg-gray-100 flex items-center justify-center" style={{ height: MAP_HEIGHT }}>
        <p className="text-gray-500 text-sm">{failed ? 'The SA2 boundaries could not be loaded.' : 'Loading map…'}</p>
      </div>
    );
  }

  return (
    <div>
      <ChoroplethMapDirect
        geoJsonData={shaded}
        valueField="need"
        colorForValue={colorForNeed}
        outlines={outlines}
        outlineColor={LGA_OUTLINE}
        scrollWheelZoom={false}
        fillOpacity={1}
        getTooltip={tooltip}
        height={MAP_HEIGHT}
        center={NSW_CENTRE}
        zoom={NSW_ZOOM}
        // No basemap: the choropleth alone exports cleanly, with no cross-origin tiles to taint the canvas.
        basemap={false}
        showLegend={false}
      />
      <Legend />
    </div>
  );
}
