'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { MapPin, Search, X, ChevronDown } from 'lucide-react';
import { useAppStore } from '@/store';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import type { Area } from '@/types';

// Region display order
const REGION_ORDER = [
  'Greater Sydney',
  'Hunter',
  'Central Coast',
  'Illawarra-Shoalhaven',
  'South East & Tablelands',
  'New England & North West',
  'North Coast',
  'Central West & Orana',
  'Riverina-Murray',
  'Far West',
];

export default function AreaSelector() {
  const { selectedArea, setSelectedArea, areaType, setAreaType } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredAreas = useMemo(() =>
    SAMPLE_AREAS.filter(
      (area) =>
        (areaType === 'lga' ? area.type === 'lga' : area.type === areaType) &&
        area.name.toLowerCase().includes(search.toLowerCase())
    ),
    [areaType, search]
  );

  // Group LGAs by region; non-LGAs are ungrouped
  const groupedAreas = useMemo(() => {
    if (areaType !== 'lga') return null;
    const groups: Record<string, Area[]> = {};
    for (const area of filteredAreas) {
      const region = area.region ?? 'Other';
      if (!groups[region]) groups[region] = [];
      groups[region].push(area);
    }
    // Sort regions by defined order, then any unlisted ones alphabetically
    return REGION_ORDER
      .filter((r) => groups[r]?.length)
      .map((r) => ({ region: r, areas: groups[r] }))
      .concat(
        Object.entries(groups)
          .filter(([r]) => !REGION_ORDER.includes(r))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([region, areas]) => ({ region, areas }))
      );
  }, [areaType, filteredAreas]);

  const handleSelect = (area: Area) => {
    setSelectedArea(area);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors min-w-[240px]"
      >
        <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
        <span className={`flex-1 text-left truncate ${selectedArea ? 'text-gray-900' : 'text-gray-400'}`}>
          {selectedArea ? selectedArea.name : 'Select area...'}
        </span>
        {selectedArea ? (
          <X
            className="w-4 h-4 text-gray-400 hover:text-gray-600 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedArea(null);
            }}
          />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-[340px] bg-white rounded-lg shadow-lg border border-gray-200 z-50 flex flex-col max-h-[480px]">
          {/* Area type tabs */}
          <div className="flex border-b border-gray-200 shrink-0">
            {(['lga', 'sa2', 'suburb'] as const).map((type) => (
              <button
                key={type}
                onClick={() => { setAreaType(type); setSearch(''); }}
                className={`flex-1 px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
                  areaType === type
                    ? 'text-primary-600 border-b-2 border-primary-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {type === 'lga' ? `LGA${areaType === 'lga' ? ` (${filteredAreas.length})` : ''}` : type.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="p-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={areaType === 'lga' ? 'Search 128 NSW LGAs...' : 'Search areas...'}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
              />
            </div>
          </div>

          {/* Results */}
          <div className="overflow-y-auto flex-1">
            {filteredAreas.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-500">No areas found</p>
            ) : groupedAreas ? (
              // Grouped view for LGAs
              groupedAreas.map(({ region, areas }) => (
                <div key={region}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 sticky top-0">
                    {region}
                    <span className="ml-1.5 font-normal normal-case">({areas.length})</span>
                  </div>
                  {areas.map((area) => (
                    <button
                      key={area.id}
                      onClick={() => handleSelect(area)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                        selectedArea?.id === area.id ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                      }`}
                    >
                      {area.name}
                    </button>
                  ))}
                </div>
              ))
            ) : (
              // Flat view for SA2 / suburb
              filteredAreas.map((area) => (
                <button
                  key={area.id}
                  onClick={() => handleSelect(area)}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                    selectedArea?.id === area.id ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                  }`}
                >
                  <span className="font-medium">{area.name}</span>
                  <span className="text-gray-400 ml-2 text-xs uppercase">{area.type}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

