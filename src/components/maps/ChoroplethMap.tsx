'use client';

import dynamic from 'next/dynamic';
import type { Feature, FeatureCollection } from 'geojson';

const ChoroplethMapInner = dynamic(() => import('./ChoroplethMapInner'), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] w-full rounded-lg bg-gray-100 animate-pulse flex items-center justify-center">
      <p className="text-gray-400 text-sm">Loading map...</p>
    </div>
  ),
});

interface ChoroplethMapProps {
  geoJsonData: FeatureCollection;
  valueField: string;
  colorScale?: string[];
  onAreaClick?: (feature: Feature) => void;
  selectedAreaId?: string | number;
  center?: [number, number];
  zoom?: number;
  legendTitle?: string;
}

export default function ChoroplethMap(props: ChoroplethMapProps) {
  return <ChoroplethMapInner {...props} />;
}
