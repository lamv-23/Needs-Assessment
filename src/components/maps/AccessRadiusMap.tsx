'use client';

import { useEffect, useRef } from 'react';

export type StopMode = 'train' | 'metro' | 'bus' | 'ferry' | 'lightRail';

export interface NearbyStop {
  stop_id: string;
  stop_name: string;
  lat: number;
  lng: number;
  mode: string;
  feed: string;
  distance: number;
  memberCount?: number;
}

interface AccessRadiusMapProps {
  initialCenter: [number, number];
  point: [number, number] | null;
  radius: number;
  stops: NearbyStop[];
  onPointChange: (lat: number, lng: number) => void;
  className?: string;
}

const MODE_COLORS: Record<string, string> = {
  train: '#e11d48',      // rose-600
  metro: '#7c3aed',      // violet-600
  bus: '#2563eb',        // blue-600
  ferry: '#0891b2',      // cyan-600
  lightRail: '#d97706',  // amber-600
};

export default function AccessRadiusMap({
  initialCenter,
  point,
  radius,
  stops,
  onPointChange,
  className = '',
}: AccessRadiusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<ReturnType<typeof import('leaflet').map> | null>(null);
  const markerRef = useRef<ReturnType<typeof import('leaflet').marker> | null>(null);
  const circleRef = useRef<ReturnType<typeof import('leaflet').circle> | null>(null);
  const stopLayerRef = useRef<ReturnType<typeof import('leaflet').layerGroup> | null>(null);
  const firstPointSetRef = useRef(false);

  function createCenterMarkerIcon(L: typeof import('leaflet')) {
    return L.divIcon({
      className: 'access-radius-center-marker',
      html: `
        <div style="
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          background: #2563eb;
          border: 3px solid #ffffff;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.20), 0 4px 10px rgba(15, 23, 42, 0.25);
        "></div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
  }

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Dynamically import Leaflet so it only runs on the client
    import('leaflet').then((L) => {
      if (!containerRef.current) return;
      const map = L.map(containerRef.current, {
        center: initialCenter,
        zoom: 13,
        zoomControl: true,
      });

      L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        {
          attribution:
            'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community',
          maxZoom: 16,
        }
      ).addTo(map);
      L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 16 }
      ).addTo(map);

      map.on('click', (e) => {
        onPointChange(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      stopLayerRef.current = L.layerGroup().addTo(map);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
        stopLayerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker + circle when point or radius changes
  useEffect(() => {
    if (!mapRef.current) return;
    import('leaflet').then((L) => {
      const map = mapRef.current!;

      if (!point) {
        markerRef.current?.remove();
        circleRef.current?.remove();
        markerRef.current = null;
        circleRef.current = null;
        return;
      }

      const latlng: [number, number] = point;

      if (markerRef.current) {
        markerRef.current.setLatLng(latlng);
      } else {
        markerRef.current = L.marker(latlng, {
          draggable: true,
          icon: createCenterMarkerIcon(L),
        }).addTo(map);
        markerRef.current.on('dragend', (e) => {
          const ll = (e.target as ReturnType<typeof L.marker>).getLatLng();
          onPointChange(ll.lat, ll.lng);
        });
        markerRef.current.bindTooltip('Drag to move your marker', {
          direction: 'top',
          offset: [0, -10],
          opacity: 0.9,
        });
      }

      if (circleRef.current) {
        circleRef.current.setLatLng(latlng);
        circleRef.current.setRadius(radius);
      } else {
        circleRef.current = L.circle(latlng, {
          radius,
          color: '#2563eb',
          fillColor: '#2563eb',
          fillOpacity: 0.07,
          weight: 2,
        }).addTo(map);
        circleRef.current.bindTooltip('Search radius', {
          permanent: false,
          direction: 'center',
          opacity: 0.8,
        });
      }

      if (!firstPointSetRef.current) {
        map.flyTo(latlng, Math.max(map.getZoom(), 14), { duration: 0.5 });
        firstPointSetRef.current = true;
      }
    });
  }, [point, radius, onPointChange]);

  // Update stop dots when stops list changes
  useEffect(() => {
    if (!stopLayerRef.current) return;
    import('leaflet').then((L) => {
      stopLayerRef.current!.clearLayers();
      for (const stop of stops) {
        const color = MODE_COLORS[stop.mode] ?? '#6b7280';
        const groupedDetail = stop.memberCount && stop.memberCount > 1
          ? `${stop.memberCount} ${stop.mode === 'bus' ? 'stands' : 'platforms'} combined`
          : 'Single stop marker';
        L.circleMarker([stop.lat, stop.lng], {
          radius: 5,
          color,
          fillColor: color,
          fillOpacity: 0.85,
          weight: 1.5,
        })
          .bindTooltip(`<strong>${stop.stop_name}</strong><br/>${stop.mode} · ${Math.round(stop.distance)}m`, { sticky: true })
          .bindPopup(
            `<div style="min-width: 160px">
              <strong>${stop.stop_name}</strong><br/>
              <span style="text-transform: capitalize">${stop.mode}</span><br/>
              ${Math.round(stop.distance)}m from your marker<br/>
              ${groupedDetail}
            </div>`
          )
          .addTo(stopLayerRef.current!);
      }
    });
  }, [stops]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-[60vh] md:h-full rounded-lg overflow-hidden ${className}`}
      style={{ minHeight: 320 }}
    />
  );
}
