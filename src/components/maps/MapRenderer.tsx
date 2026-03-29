'use client';

import { useEffect, useRef } from 'react';
import type { FeatureCollection, Feature, Geometry } from 'geojson';

interface MapRendererProps {
  geoJsonData: FeatureCollection;
  valueField: string;
  colorScale?: string[];
  legendTitle?: string;
}

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

function getColor(value: number | undefined, breaks: number[], colors: string[]): string {
  if (value == null) return '#d1d5db';
  for (let i = 0; i < breaks.length; i++) {
    if (value <= breaks[i]) return colors[i];
  }
  return colors[colors.length - 1];
}

export default function MapRenderer({
  geoJsonData,
  valueField,
  colorScale = ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'],
  legendTitle = 'Value',
}: MapRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const LRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const geoLayerRef = useRef<any>(null);

  // Initialize map once on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;

    // Capture the container synchronously so the async callback can check it
    const container = containerRef.current;

    import('leaflet').then((L) => {
      // Bail out if the component unmounted before the dynamic import resolved
      if (!container || !document.contains(container)) return;
      // Bail out if Leaflet already initialised this container (StrictMode double-invoke)
      if ((container as any)._leaflet_id) return;
      // Bail out if we already have a map instance
      if (mapRef.current) return;

      LRef.current = L;
      const map = L.map(container).setView([-33.8688, 151.2093], 10);
      mapRef.current = map;
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(map);

      // Now that L and map are ready, immediately render the GeoJSON
      setTimeout(() => {
        map.invalidateSize();
        // Trigger GeoJSON render now that map is ready
        if (geoJsonData.features.length > 0) {
          const values = geoJsonData.features
            .map((f) => f.properties?.[valueField] as number)
            .filter((v) => v != null && !isNaN(v));
          if (values.length === 0) return;
          const breaks = getQuantileBreaks(values, colorScale.length);
          const layer = L.geoJSON(geoJsonData, {
            style: (feature: Feature<Geometry> | undefined) => ({
              fillColor: getColor(feature?.properties?.[valueField], breaks, colorScale),
              weight: 1,
              color: '#6b7280',
              fillOpacity: 0.7,
            }),
            onEachFeature: (feature: Feature, lyr: any) => {
              const name = feature.properties?.name || 'Unknown';
              const value = feature.properties?.[valueField];
              lyr.bindTooltip(
                `<strong>${name}</strong><br/>${legendTitle}: ${value != null ? Number(value).toLocaleString() : 'N/A'}`,
                { sticky: true }
              );
            },
          });
          layer.addTo(map);
          geoLayerRef.current = layer;
          const bounds = layer.getBounds();
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
        }
      }, 150);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        geoLayerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update GeoJSON layer whenever data or metric changes
  useEffect(() => {
    // If map isn't ready yet (Leaflet still loading), retry after a delay
    if (!LRef.current || !mapRef.current) {
      const timer = setTimeout(() => {
        const L = LRef.current;
        const map = mapRef.current;
        if (!L || !map) return;
        renderLayer(L, map);
      }, 500);
      return () => clearTimeout(timer);
    }
    renderLayer(LRef.current, mapRef.current);

    function renderLayer(L: any, map: any) {
      if (geoLayerRef.current) {
        map.removeLayer(geoLayerRef.current);
        geoLayerRef.current = null;
      }

      const values = geoJsonData.features
        .map((f) => f.properties?.[valueField] as number)
        .filter((v) => v != null && !isNaN(v));

      if (values.length === 0) return;

      const breaks = getQuantileBreaks(values, colorScale.length);

      const layer = L.geoJSON(geoJsonData, {
        style: (feature: Feature<Geometry> | undefined) => ({
          fillColor: getColor(feature?.properties?.[valueField], breaks, colorScale),
          weight: 1,
          color: '#6b7280',
          fillOpacity: 0.7,
        }),
        onEachFeature: (feature: Feature, layer: any) => {
          const name = feature.properties?.name || 'Unknown';
          const value = feature.properties?.[valueField];
          layer.bindTooltip(
            `<strong>${name}</strong><br/>${legendTitle}: ${value != null ? Number(value).toLocaleString() : 'N/A'}`,
            { sticky: true }
          );
        },
      });

      layer.addTo(map);
      geoLayerRef.current = layer;

      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }
  }, [geoJsonData, valueField, colorScale, legendTitle]);

  const legendValues = (() => {
    const values = geoJsonData.features
      .map((f) => f.properties?.[valueField] as number)
      .filter((v) => v != null && !isNaN(v));
    if (values.length === 0) return null;
    return { min: Math.min(...values), max: Math.max(...values) };
  })();

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        style={{ height: '500px', width: '100%', background: '#f0ede8' }}
      />
      {legendValues && (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: 16,
            zIndex: 1000,
            background: 'white',
            borderRadius: 8,
            padding: '10px 14px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            fontSize: 12,
            minWidth: 160,
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: 6 }}>{legendTitle}</p>
          <div style={{ display: 'flex', height: 12, borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
            {colorScale.map((c, i) => (
              <div key={i} style={{ flex: 1, background: c }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
            <span>{Number(legendValues.min).toLocaleString()}</span>
            <span>{Number(legendValues.max).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
