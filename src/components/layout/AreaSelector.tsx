'use client';

import { useState, useRef, useEffect } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { useAppStore } from '@/store';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import type { Area } from '@/types';

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

  const filteredAreas = SAMPLE_AREAS.filter(
    (area) =>
      (areaType === 'lga' ? area.type === 'lga' : area.type === areaType) &&
      area.name.toLowerCase().includes(search.toLowerCase())
  );

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
        <MapPin className="w-4 h-4 text-gray-400" />
        <span className={selectedArea ? 'text-gray-900' : 'text-gray-400'}>
          {selectedArea ? selectedArea.name : 'Select area...'}
        </span>
        {selectedArea && (
          <X
            className="w-4 h-4 text-gray-400 hover:text-gray-600 ml-auto"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedArea(null);
            }}
          />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-[320px] bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          {/* Area type tabs */}
          <div className="flex border-b border-gray-200">
            {(['lga', 'sa2', 'suburb'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setAreaType(type)}
                className={`flex-1 px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
                  areaType === type
                    ? 'text-primary-600 border-b-2 border-primary-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search areas..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
              />
            </div>
          </div>

          {/* Results */}
          <div className="max-h-[300px] overflow-y-auto">
            {filteredAreas.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-500">No areas found</p>
            ) : (
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
