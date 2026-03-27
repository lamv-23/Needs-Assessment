'use client';

import { useMemo, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import type { Layer, PathOptions } from 'leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import MapLegend from './MapLegend';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for Leaflet marker icons in Next.js
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: '/leaflet/marker-icon-2x.png',
    iconUrl: '/leaflet/marker-icon.png',
    shadowUrl: '/leaflet/marker-shadow.png',
  });
}

interface ChoroplethMapInnerProps {
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

export default function ChoroplethMapInner({
  geoJsonData,
  valueField,
  colorScale = ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'],
  onAreaClick,
  selectedAreaId,
  center = [-33.8688, 151.2093],
  zoom = 10,
  legendTitle,
}: ChoroplethMapInnerProps) {
  // Debug logging
  useEffect(() => {
    console.log('ChoroplethMapInner mounting with:', {
      featuresCount: geoJsonData.features.length,
      valueField,
      colorScaleLength: colorScale.length,
    });
  }, [geoJsonData, valueField, colorScale.length]);

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
    (feature: Feature<Geometry> | undefined): PathOptions => {
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

  const onEachFeature = useCallback(
    (feature: Feature<Geometry>, layer: Layer) => {
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
          const target = e.target;
          target.setStyle({
            weight: 2,
            fillOpacity: 0.85,
          });
          target.openPopup();
        },
        mouseout: (e) => {
          const target = e.target;
          target.setStyle(style(feature));
          target.closePopup();
        },
        click: () => {
          onAreaClick?.(feature);
        },
      });
    },
    [valueField, onAreaClick, style]
  );

  return (
    <div className="relative">
      <MapContainer
        center={center}
        zoom={zoom}
        className="h-[500px] w-full rounded-lg z-0"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <GeoJSON
          key={JSON.stringify(geoJsonData).slice(0, 100) + valueField}
          data={geoJsonData}
          style={style}
          onEachFeature={onEachFeature}
        />
      </MapContainer>
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
