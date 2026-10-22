'use client';

import { useEffect, useRef, useMemo, useCallback } from 'react';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import L from 'leaflet';
import MapLegend from './MapLegend';
import 'leaflet/dist/leaflet.css';

interface ChoroplethMapDirectProps {
  geoJsonData: FeatureCollection;
  valueField: string;
  colorScale?: string[];
  onAreaClick?: (feature: Feature) => void;
  selectedAreaId?: string | number;
  /** Several selected areas, outlined like `selectedAreaId`; both may be given. */
  selectedAreaIds?: (string | number)[];
  center?: [number, number];
  zoom?: number;
  /** Map height in pixels. */
  height?: number;
  legendTitle?: string;
  /** Fill for a value, replacing the quantile classes of `colorScale` (e.g. fixed breaks). */
  colorForValue?: (value: number | undefined) => string;
  /** HTML for a sticky tooltip that follows the pointer, shown instead of the popup. */
  getTooltip?: (feature: Feature) => string;
  /** Outline of a selected area. */
  selectedColor?: string;
  fillOpacity?: number;
  /** Draw the Esri grey tile basemap. Off for a figure that must export without tainting the canvas. */
  basemap?: boolean;
  /** Draw the built-in quantile legend. Off when the caller draws its own. */
  showLegend?: boolean;
  /** Zoom with the mouse wheel. Off where the map sits in a scrolling page. Read once, when the map is created. */
  scrollWheelZoom?: boolean;
  /**
   * Fit the view to these areas (by `id` or `SA2_CODE`) whenever the set changes, or to every area when it is
   * empty. Without it the view is fitted to every area once, and left where the user puts it.
   */
  focusAreaIds?: (string | number)[];
  /**
   * Boundaries drawn over the areas as plain outlines, with no fill and no pointer events, so the areas beneath keep
   * their tooltips (e.g. the selected LGAs over their SA2s).
   */
  outlines?: FeatureCollection;
  /** Colour of `outlines`. */
  outlineColor?: string;
}

/** The pane `outlines` are drawn in: above the areas (the overlay pane is at z-index 400), below tooltips (650). */
const OUTLINE_PANE = 'outlinePane';
const OUTLINE_WEIGHT = 2.5;

function getQuantileBreaks(values: number[], numClasses: number): number[] {
  const sorted = [...values].filter((v) => v != null).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const breaks: number[] = [];
  for (let i = 1; i <= numClasses; i++) {
    const index = Math.floor((i / numClasses) * (sorted.length - 1));
    breaks.push(sorted[index]);
  }
  return breaks;
}

function getColor(
  value: number | undefined,
  breaks: number[],
  colors: string[]
): string {
  if (value == null) return '#d1d5db';
  for (let i = 0; i < breaks.length; i++) {
    if (value <= breaks[i]) return colors[i];
  }
  return colors[colors.length - 1];
}

/** The look of an area under the pointer: a heavier outline and a slightly stronger fill. */
function hoverStyle(base: L.PathOptions): L.PathOptions {
  return {
    weight: (base.weight ?? 1) + 1,
    fillOpacity: Math.min(1, (base.fillOpacity ?? 0.7) + 0.15),
  };
}

/** True when `feature` is one of `selected`, by its `id` or `SA2_CODE` property. */
function isSelected(feature: Feature, selected: Set<string | number>): boolean {
  const { id, SA2_CODE: sa2 } = feature.properties ?? {};
  return selected.has(id) || selected.has(sa2);
}

/** Closest zoom when fitting to focused areas: a single small LGA keeps its neighbours in view. */
const FOCUS_MAX_ZOOM = 11;

/** Bounds of the focused areas, or of every area when none is focused (or none of them is drawn). */
function viewBounds(layer: L.GeoJSON, focus: Set<string | number>): L.LatLngBounds {
  const focused = L.latLngBounds([]);
  if (focus.size > 0) {
    layer.eachLayer((featureLayer) => {
      const feature = (featureLayer as L.Layer & { feature?: Feature }).feature;
      if (feature && isSelected(feature, focus)) focused.extend((featureLayer as L.Polygon).getBounds());
    });
  }
  return focused.isValid() ? focused : layer.getBounds();
}

export default function ChoroplethMapDirect({
  geoJsonData,
  valueField,
  colorScale = ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'],
  onAreaClick,
  selectedAreaId,
  selectedAreaIds,
  center = [-33.8688, 151.2093],
  zoom = 10,
  height = 500,
  legendTitle,
  colorForValue,
  getTooltip,
  selectedColor = '#1d4ed8',
  fillOpacity = 0.7,
  basemap = true,
  showLegend = true,
  scrollWheelZoom = true,
  focusAreaIds,
  outlines,
  outlineColor = '#111827',
}: ChoroplethMapDirectProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const geoJsonLayer = useRef<L.GeoJSON | null>(null);
  const outlineLayer = useRef<L.GeoJSON | null>(null);
  // The `areaKey` (and focus) the view was last fitted to.
  const fittedFor = useRef<string | null>(null);
  // Where the map starts; later changes to these props do not move it.
  const initial = useRef({ center, zoom, basemap, scrollWheelZoom });

  const { breaks, minValue, maxValue } = useMemo(() => {
    const values = geoJsonData.features
      .map((f) => f.properties?.[valueField] as number)
      .filter((v) => v != null && !isNaN(v));

    if (values.length === 0) {
      console.warn(`No valid values found for field: ${valueField}`);
      return {
        breaks: [],
        minValue: 0,
        maxValue: 100,
      };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    return {
      breaks: getQuantileBreaks(values, colorScale.length),
      minValue: min,
      maxValue: max,
    };
  }, [geoJsonData, valueField, colorScale.length]);

  const selected = useMemo(() => {
    const ids = new Set<string | number>(selectedAreaIds);
    if (selectedAreaId != null) ids.add(selectedAreaId);
    return ids;
  }, [selectedAreaId, selectedAreaIds]);

  const style = useCallback(
    (feature: Feature<Geometry> | undefined): L.PathOptions => {
      if (!feature) return {};
      const value = feature.properties?.[valueField] as number | undefined;
      const isSel = isSelected(feature, selected);

      return {
        fillColor: colorForValue ? colorForValue(value) : getColor(value, breaks, colorScale),
        weight: isSel ? 3 : 1,
        opacity: 1,
        color: isSel ? selectedColor : '#6b7280',
        fillOpacity,
      };
    },
    [valueField, breaks, colorScale, colorForValue, selected, selectedColor, fillOpacity]
  );

  // The areas drawn: the map is only re-fitted when these or the focus change, not when a value or selection does.
  const areaKey = useMemo(
    () => geoJsonData.features.map((f) => f.properties?.id ?? f.properties?.SA2_CODE ?? '').join('|'),
    [geoJsonData]
  );
  const viewKey = `${areaKey}#${(focusAreaIds ?? []).join('|')}`;

  // The layer's handlers read the latest props through this, so they never need the layer rebuilt.
  const latest = useRef({ style, selected, onAreaClick, getTooltip, valueField, focusAreaIds, viewKey });
  useEffect(() => {
    latest.current = { style, selected, onAreaClick, getTooltip, valueField, focusAreaIds, viewKey };
  });

  // Fits the view to the focused areas (every area when none), unless it already is for this `viewKey`.
  const fitView = useCallback(() => {
    const leafletMap = map.current;
    const layer = geoJsonLayer.current;
    const { focusAreaIds: focus, viewKey: key } = latest.current;
    if (!leafletMap || !layer || fittedFor.current === key) return;
    const bounds = viewBounds(layer, new Set(focus));
    if (!bounds.isValid()) return;
    leafletMap.fitBounds(bounds, { padding: [50, 50], maxZoom: focus?.length ? FOCUS_MAX_ZOOM : undefined });
    fittedFor.current = key;
  }, []);

  // Initialize map once on mount
  useEffect(() => {
    const container = mapContainer.current;
    if (!container) return;
    const start = initial.current;
    // A drag swallows the mouseout that would close a tooltip, leaving it stuck on the map.
    const closeTooltips = () => geoJsonLayer.current?.eachLayer((featureLayer) => featureLayer.closeTooltip());

    try {
      const leafletMap = L.map(container, {
        // Only the tiles need an attribution; without them the control would just print "Leaflet" on an exported figure.
        attributionControl: start.basemap,
        zoomControl: true,
        scrollWheelZoom: start.scrollWheelZoom,
        // Fits the bounds to the map instead of to the next whole zoom level, which can leave half of it empty.
        zoomSnap: 0.25,
      }).setView(start.center, start.zoom);
      map.current = leafletMap;

      // Zoom buttons and hover tooltips do not belong in an exported figure; html2canvas skips this attribute.
      [leafletMap.zoomControl.getContainer(), leafletMap.getPane('tooltipPane'), leafletMap.getPane('popupPane')].forEach(
        (el) => el?.setAttribute('data-html2canvas-ignore', 'true')
      );

      // Outlines stay on top of the areas however often the area layer is rebuilt, and let the pointer through.
      const outlinePane = leafletMap.createPane(OUTLINE_PANE);
      outlinePane.style.zIndex = '450';
      outlinePane.style.pointerEvents = 'none';

      if (start.basemap) {
        L.tileLayer(
          'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
          {
            attribution:
              'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community',
            maxZoom: 16,
          }
        ).addTo(leafletMap);
        L.tileLayer(
          'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
          { maxZoom: 16 }
        ).addTo(leafletMap);
      }

      leafletMap.on('movestart', closeTooltips);
      container.addEventListener('mouseleave', closeTooltips);

      // Force size calculation
      setTimeout(() => {
        if (map.current === leafletMap) leafletMap.invalidateSize();
      }, 100);
    } catch (error) {
      console.error('Error initializing map:', error);
    }

    return () => {
      container.removeEventListener('mouseleave', closeTooltips);
      map.current?.remove();
      map.current = null;
      geoJsonLayer.current = null;
      outlineLayer.current = null;
      fittedFor.current = null;
    };
  }, []);

  // Redraw the outlines when they change
  useEffect(() => {
    const leafletMap = map.current;
    if (!leafletMap) return;
    outlineLayer.current?.remove();
    outlineLayer.current = outlines
      ? L.geoJSON(outlines, {
          pane: OUTLINE_PANE,
          interactive: false,
          style: { fill: false, color: outlineColor, weight: OUTLINE_WEIGHT, opacity: 1 },
        }).addTo(leafletMap)
      : null;
  }, [outlines, outlineColor]);

  const hasTooltip = getTooltip !== undefined;

  // Rebuild the GeoJSON layer when the data changes
  useEffect(() => {
    const leafletMap = map.current;
    if (!leafletMap || !mapContainer.current) {
      console.warn('Map not ready');
      return;
    }

    try {
      if (geoJsonLayer.current) {
        leafletMap.removeLayer(geoJsonLayer.current);
      }

      const layer = L.geoJSON(geoJsonData, {
        style: (feature) => latest.current.style(feature as Feature<Geometry>),
        onEachFeature: (feature, featureLayer) => {
          if (hasTooltip) {
            featureLayer.bindTooltip(() => latest.current.getTooltip?.(feature) ?? '', { sticky: true });
          } else {
            const name =
              feature.properties?.name ||
              feature.properties?.SA2_NAME ||
              'Unknown';
            const value = feature.properties?.[valueField];
            const displayValue =
              value != null ? Number(value).toLocaleString() : 'N/A';

            featureLayer.bindPopup(
              `<div class="text-sm"><strong>${name}</strong><br/>${valueField}: ${displayValue}</div>`
            );
          }

          featureLayer.on({
            mouseover: (e) => {
              const target = e.target as L.Path;
              target.setStyle(hoverStyle(latest.current.style(feature)));
              if (!hasTooltip) target.openPopup();
            },
            mouseout: (e) => {
              const target = e.target as L.Path;
              target.setStyle(latest.current.style(feature));
              if (!hasTooltip) target.closePopup();
            },
            click: () => {
              latest.current.onAreaClick?.(feature);
            },
          });
        },
      }).addTo(leafletMap);
      geoJsonLayer.current = layer;

      fitView();
    } catch (error) {
      console.error('Error updating GeoJSON:', error);
    }
  }, [geoJsonData, valueField, areaKey, hasTooltip, fitView]);

  // Re-fit when only the focus changes; the layer is not rebuilt for that.
  useEffect(() => {
    fitView();
  }, [viewKey, fitView]);

  // Restyle in place when only the colours or the selection change, keeping the view where the user left it
  useEffect(() => {
    const layer = geoJsonLayer.current;
    if (!layer) return;
    layer.setStyle((feature) => style(feature as Feature<Geometry>));
    // Selected outlines on top, or a neighbour's border would cover part of them.
    layer.eachLayer((featureLayer) => {
      const feature = (featureLayer as L.Layer & { feature?: Feature }).feature;
      if (feature && isSelected(feature, selected)) (featureLayer as L.Path).bringToFront();
      // A tooltip left open under the pointer (e.g. after a click) shows the new selection.
      if (featureLayer.isTooltipOpen()) featureLayer.getTooltip()?.update();
    });
  }, [style, selected]);

  return (
    <div className="relative">
      <div
        ref={mapContainer}
        // A clicked area takes focus, and Chrome would ring its whole bounding box.
        className="w-full rounded-lg z-0 [&_.leaflet-interactive:focus]:outline-none"
        // Inline: the global `.leaflet-container { height: 100% }` would override a height class.
        style={{ background: '#f3f4f6', height }}
      />
      {showLegend && (
        <div className="absolute bottom-4 left-4 z-[1000]">
          <MapLegend
            title={legendTitle || valueField}
            colors={colorScale}
            min={minValue}
            max={maxValue}
          />
        </div>
      )}
    </div>
  );
}
