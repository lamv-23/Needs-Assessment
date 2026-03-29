'use client';

import { useEffect, useRef } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import L from 'leaflet';
import MapLegend from './MapLegend';
import 'leaflet/dist/leaflet.css';

interface SimpleMapProps {
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

export default function SimpleMap({
  geoJsonData,
  valueField,
  colorScale = ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'],
  legendTitle,
}: SimpleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    // Only run this effect on client
    if (typeof window === 'undefined') return;

    // Check if container exists
    if (!containerRef.current) {
      console.error('[Map] Container ref not attached');
      return;
    }

    // Prevent multiple initializations (also guards against StrictMode double-invoke
    // where Leaflet leaves _leaflet_id on the DOM node after cleanup)
    if (mapRef.current || (containerRef.current as any)._leaflet_id) {
      console.log('[Map] Already initialized, skipping');
      return;
    }

    try {
      console.log('[Map] Starting initialization');

      // Create map
      const map = L.map(containerRef.current, {
        zoom: 10,
        center: [-33.8688, 151.2093],
      });

      mapRef.current = map;
      console.log('[Map] Created map instance');

      // Add tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      console.log('[Map] Tiles added');

      // Calculate color breaks
      const values = geoJsonData.features
        .map((f) => f.properties?.[valueField] as number)
        .filter((v) => v != null && !isNaN(v));

      const breaks = getQuantileBreaks(values, colorScale.length);
      const minValue = Math.min(...values);
      const maxValue = Math.max(...values);

      console.log('[Map] Calculated breaks:', { breaks, minValue, maxValue });

      // Add GeoJSON
      const geoJsonLayer = L.geoJSON(geoJsonData, {
        style: (feature) => {
          const value = feature?.properties?.[valueField] as number | undefined;
          return {
            fillColor: getColor(value, breaks, colorScale),
            weight: 1,
            opacity: 1,
            color: '#6b7280',
            fillOpacity: 0.7,
          };
        },
        onEachFeature: (feature, layer) => {
          const name = feature.properties?.name || 'Unknown';
          const value = feature.properties?.[valueField];
          layer.bindPopup(`<strong>${name}</strong><br/>${valueField}: ${value}`);
        },
      });

      geoJsonLayer.addTo(map);
      console.log('[Map] GeoJSON added:', geoJsonData.features.length, 'features');

      // Fit bounds
      const bounds = geoJsonLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
        console.log('[Map] Bounds fitted');
      }

      // Force size recalculation
      setTimeout(() => {
        map.invalidateSize();
        console.log('[Map] Size invalidated');
      }, 100);
    } catch (error) {
      console.error('[Map] Error during initialization:', error);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Only run once on mount

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[500px] w-full bg-gray-200 rounded-lg border border-gray-300"
      />
      <div className="absolute bottom-4 left-4 z-[1000]">
        <MapLegend
          title={legendTitle || valueField}
          colors={colorScale}
          min={0}
          max={100}
        />
      </div>
    </div>
  );
}
