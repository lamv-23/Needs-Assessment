'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import type { Feature, FeatureCollection } from 'geojson';

const ChoroplethMapDirect = dynamic(() => import('./ChoroplethMapDirect'), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] w-full rounded-lg bg-gray-100 flex items-center justify-center">
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
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="h-[500px] w-full rounded-lg bg-gray-100 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Initializing map...</p>
      </div>
    );
  }

  return <ChoroplethMapDirect {...props} />;
}
