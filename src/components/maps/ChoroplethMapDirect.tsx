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
  center?: [number, number];
  zoom?: number;
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

export default function ChoroplethMapDirect({
  geoJsonData,
  valueField,
  colorScale = ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'],
  onAreaClick,
  selectedAreaId,
  center = [-33.8688, 151.2093],
  zoom = 10,
  legendTitle,
}: ChoroplethMapDirectProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const geoJsonLayer = useRef<L.GeoJSON | null>(null);
  const mapInitialized = useRef(false);

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

  const style = useCallback(
    (feature: Feature<Geometry> | undefined): L.PathOptions => {
      if (!feature) return {};
      const value = feature.properties?.[valueField] as number | undefined;
      const isSelected =
        selectedAreaId != null &&
        (feature.properties?.id === selectedAreaId ||
          feature.properties?.SA2_CODE === selectedAreaId);

      return {
        fillColor: getColor(value, breaks, colorScale),
        weight: isSelected ? 3 : 1,
        opacity: 1,
        color: isSelected ? '#1d4ed8' : '#6b7280',
        fillOpacity: 0.7,
      };
    },
    [valueField, breaks, colorScale, selectedAreaId]
  );

  // Initialize map once on mount
  useEffect(() => {
    if (mapInitialized.current || !mapContainer.current) {
      return;
    }

    try {
      console.log('Initializing map once on mount');
      map.current = L.map(mapContainer.current, {
        attributionControl: true,
        zoomControl: true,
      }).setView(center, zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map.current);

      // Force size calculation
      setTimeout(() => {
        map.current?.invalidateSize();
        console.log('Map invalidated');
      }, 100);

      mapInitialized.current = true;
      console.log('Map initialization complete');
    } catch (error) {
      console.error('Error initializing map:', error);
    }

    return () => {
      // Don't destroy the map on unmount, just clean up layers
      console.log('Unmounting map component');
    };
  }, [center, zoom]);

  // Update GeoJSON layer when data or style changes
  useEffect(() => {
    if (!map.current || !mapContainer.current) {
      console.warn('Map not ready');
      return;
    }

    try {
      // Remove old GeoJSON layer
      if (geoJsonLayer.current) {
        map.current.removeLayer(geoJsonLayer.current);
      }

      // Add new GeoJSON layer
      geoJsonLayer.current = L.geoJSON(geoJsonData, {
        style: (feature) => style(feature as Feature<Geometry>),
        onEachFeature: (feature, layer) => {
          const name =
            feature.properties?.name ||
            feature.properties?.SA2_NAME ||
            'Unknown';
          const value = feature.properties?.[valueField];
          const displayValue =
            value != null ? Number(value).toLocaleString() : 'N/A';

          layer.bindPopup(
            `<div class="text-sm"><strong>${name}</strong><br/>${valueField}: ${displayValue}</div>`
          );

          layer.on({
            mouseover: (e) => {
              const target = e.target as any;
              target.setStyle({
                weight: 2,
                fillOpacity: 0.85,
              });
              target.openPopup();
            },
            mouseout: (e) => {
              const target = e.target as any;
              target.setStyle(style(feature));
              target.closePopup();
            },
            click: () => {
              onAreaClick?.(feature);
            },
          });
        },
      }).addTo(map.current);

      console.log('GeoJSON updated with', geoJsonData.features.length, 'features');

      // Fit bounds
      if (geoJsonLayer.current) {
        const bounds = geoJsonLayer.current.getBounds();
        if (bounds.isValid()) {
          map.current.fitBounds(bounds, { padding: [50, 50] });
        }
      }
    } catch (error) {
      console.error('Error updating GeoJSON:', error);
    }
  }, [geoJsonData, valueField, style, onAreaClick]);

  return (
    <div className="relative">
      <div
        ref={mapContainer}
        className="h-[500px] w-full rounded-lg z-0"
        style={{ background: '#f3f4f6' }}
      />
      <div className="absolute bottom-4 left-4 z-[1000]">
        <MapLegend
          title={legendTitle || valueField}
          colors={colorScale}
          min={minValue}
          max={maxValue}
        />
      </div>
    </div>
  );
}
