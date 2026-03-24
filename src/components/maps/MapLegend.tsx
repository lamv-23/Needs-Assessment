'use client';

import { formatNumber } from '@/lib/utils';

interface MapLegendProps {
  title?: string;
  colors: string[];
  min: number;
  max: number;
  steps?: number;
}

export default function MapLegend({
  title,
  colors,
  min,
  max,
  steps,
}: MapLegendProps) {
  const legendSteps = steps ?? colors.length;
  const range = max - min;
  const stepLabels = Array.from({ length: legendSteps + 1 }, (_, i) =>
    formatNumber(min + (range * i) / legendSteps)
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
      {title && (
        <p className="text-xs font-semibold text-gray-700 mb-2">{title}</p>
      )}
      <div className="flex items-center gap-0">
        {colors.map((color, index) => (
          <div key={index} className="flex flex-col items-center">
            <div
              className="w-8 h-4"
              style={{ backgroundColor: color }}
            />
            <span className="text-[10px] text-gray-500 mt-1">
              {stepLabels[index]}
            </span>
          </div>
        ))}
        <div className="flex flex-col items-center">
          <div className="w-0 h-4" />
          <span className="text-[10px] text-gray-500 mt-1">
            {stepLabels[legendSteps]}
          </span>
        </div>
      </div>
    </div>
  );
}
