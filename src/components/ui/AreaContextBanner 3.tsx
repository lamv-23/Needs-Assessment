'use client';

import { usePathname } from 'next/navigation';
import { useAppStore } from '@/store';
import { MapPin, ChevronRight, Info } from 'lucide-react';

/**
 * Shown at the top of every module page (not the home dashboard).
 * Tells users which area they're viewing and nudges them to pick their own.
 */
export default function AreaContextBanner() {
  const pathname = usePathname();
  const { selectedArea } = useAppStore();

  // Only show on module/tool pages, not the home dashboard
  if (pathname === '/') return null;

  const isDefault = selectedArea?.id === 'lga_sydney';

  if (!selectedArea) return null;

  return (
    <div
      className={`flex items-center gap-3 px-6 py-2.5 border-b text-sm ${
        isDefault
          ? 'bg-amber-50 border-amber-100 text-amber-800'
          : 'bg-primary-50 border-primary-100 text-primary-800'
      }`}
    >
      <div className={`flex-shrink-0 ${isDefault ? 'text-amber-500' : 'text-primary-500'}`}>
        {isDefault ? <Info className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
      </div>
      <span>
        {isDefault ? (
          <>
            Showing default area: <strong>City of Sydney</strong>.{' '}
            <span className="opacity-75">Use the area selector (top right) to explore your LGA.</span>
          </>
        ) : (
          <>
            Viewing: <strong>{selectedArea.name}</strong>
            <span className="opacity-60 ml-2 text-xs uppercase tracking-wide font-medium">
              {selectedArea.type?.toUpperCase()}
            </span>
          </>
        )}
      </span>
      {isDefault && (
        <span className="ml-auto flex items-center gap-1 text-xs font-medium opacity-70">
          Change area <ChevronRight className="w-3 h-3" />
        </span>
      )}
    </div>
  );
}
