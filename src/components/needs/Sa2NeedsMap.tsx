'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import ChoroplethMapDirect from '@/components/maps/ChoroplethMapDirect';
import { escapeHtml, NEED_STEPS, NeedMapLegend, NSW_CENTRE, NSW_ZOOM, SELECTED_OUTLINE } from '@/components/needs/mapParts';
import { LGA_BOUNDARIES_URL, loadBoundaries, SA2_BOUNDARIES_URL } from '@/lib/needs/boundaries';
import { NO_DATA_COLOR, needColor } from '@/lib/needs/colors';
import { LOW_POPULATION_REASON, SA2_MAP_NOTE, sa2MapEntries, type Sa2MapEntry } from '@/lib/needs/map-data';
import { SA2_LOW_POPULATION } from '@/lib/needs/sa2';
import type { Sa2NeedsFile } from '@/lib/needs/types';

/** A low-population SA2: a mid grey, darker than "No data" and off the need scale. */
const LOW_POPULATION_COLOR = '#9ca3af';
/** The `need` value that marks a low-population SA2, which has no percentile (percentiles run 0-100). */
const LOW_POPULATION_VALUE = -1;
const MAP_HEIGHT = 460;
const LEGEND_STEPS = [
  ...NEED_STEPS,
  { fill: LOW_POPULATION_COLOR, label: `${LOW_POPULATION_REASON} (under ${SA2_LOW_POPULATION} residents)` },
  { fill: NO_DATA_COLOR, label: 'No data' },
];

// A stable function, so the map restyles only when the shading changes.
const colorForNeed = (value: number | undefined) =>
  value === LOW_POPULATION_VALUE ? LOW_POPULATION_COLOR : needColor(value ?? null);

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
        outlineColor={SELECTED_OUTLINE}
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
      <NeedMapLegend note={SA2_MAP_NOTE} steps={LEGEND_STEPS} />
    </div>
  );
}
