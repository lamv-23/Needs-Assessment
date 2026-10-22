'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { NSW_REGIONS, SAMPLE_AREAS, lgasInRegion } from '@/lib/data/sample-areas';
import type { Area } from '@/types';

interface LgaMultiSelectProps {
  selected: string[];
  onChange: (ids: string[]) => void;
}

type Menu = 'search' | 'region' | null;

const LGAS: Area[] = SAMPLE_AREAS.filter(a => a.type === 'lga');
const LGA_BY_ID = new Map(LGAS.map(a => [a.id, a]));

/** Multi-select over the NSW LGAs: search-and-toggle list, region quick-add, removable chips and Clear. */
export default function LgaMultiSelect({ selected, onChange }: LgaMultiSelectProps) {
  const [menu, setMenu] = useState<Menu>(null);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Escape returns focus to the input; that focus must not reopen the list it just closed.
  const skipOpenOnFocus = useRef(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setMenu(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return LGAS.filter(a => a.name.toLowerCase().includes(q));
  }, [search]);

  const groups = useMemo(() => {
    const byRegion = new Map<string, Area[]>();
    for (const area of matches) {
      const region = area.region ?? 'Other';
      byRegion.set(region, [...(byRegion.get(region) ?? []), area]);
    }
    const ordered = NSW_REGIONS.filter(r => byRegion.has(r));
    const others = [...byRegion.keys()].filter(r => !NSW_REGIONS.includes(r)).sort((a, b) => a.localeCompare(b));
    return [...ordered, ...others].map(region => ({ region, areas: byRegion.get(region) ?? [] }));
  }, [matches]);

  const toggle = (id: string) => {
    onChange(selectedSet.has(id) ? selected.filter(s => s !== id) : [...selected, id]);
  };

  const addRegion = (region: string) => {
    const toAdd = lgasInRegion(region).map(a => a.id).filter(id => !selectedSet.has(id));
    if (toAdd.length > 0) onChange([...selected, ...toAdd]);
    setMenu(null);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMenu('search');
      listRef.current?.querySelector('button')?.focus();
    } else if (event.key === 'Enter' && search.trim() && matches.length > 0) {
      // Enter adds the top match; it never removes an LGA that is already selected.
      event.preventDefault();
      if (!selectedSet.has(matches[0].id)) onChange([...selected, matches[0].id]);
      setSearch('');
    }
  };

  const handleRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && menu) {
      setMenu(null);
      if (document.activeElement !== inputRef.current) {
        skipOpenOnFocus.current = true;
        inputRef.current?.focus();
      }
    }
  };

  return (
    <div ref={rootRef} className="space-y-2" onKeyDown={handleRootKeyDown}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setMenu('search'); }}
            onFocus={() => {
              if (skipOpenOnFocus.current) skipOpenOnFocus.current = false;
              else setMenu('search');
            }}
            onClick={() => setMenu('search')}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search LGAs..."
            aria-label="Search LGAs"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
          />
          {menu === 'search' && (
            <div
              ref={listRef}
              role="group"
              aria-label="LGA results"
              className="absolute left-0 top-full mt-1 w-full min-w-[280px] bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-[360px] overflow-y-auto"
            >
              {groups.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-500">No LGAs found</p>
              ) : (
                groups.map(({ region, areas }) => (
                  <div key={region}>
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 sticky top-0">
                      {region}
                      <span className="ml-1.5 font-normal normal-case">({areas.length})</span>
                    </div>
                    {areas.map(area => {
                      const isSelected = selectedSet.has(area.id);
                      return (
                        <button
                          key={area.id}
                          type="button"
                          onClick={() => toggle(area.id)}
                          aria-pressed={isSelected}
                          className={`w-full flex items-center justify-between text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                            isSelected ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                          }`}
                        >
                          <span>{area.name}</span>
                          {isSelected && <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu(menu === 'region' ? null : 'region')}
            aria-expanded={menu === 'region'}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
          >
            Add region
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
          </button>
          {menu === 'region' && (
            <div
              role="group"
              aria-label="Regions"
              className="absolute left-0 top-full mt-1 w-[260px] bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-[360px] overflow-y-auto"
            >
              {NSW_REGIONS.map(region => {
                const inRegion = lgasInRegion(region);
                const remaining = inRegion.filter(a => !selectedSet.has(a.id)).length;
                return (
                  <button
                    key={region}
                    type="button"
                    onClick={() => addRegion(region)}
                    disabled={remaining === 0}
                    className="w-full flex items-center justify-between text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent transition-colors"
                  >
                    <span>{region}</span>
                    <span className="ml-2 text-xs text-gray-400">{inRegion.length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => { onChange([]); setSearch(''); setMenu(null); }}
          disabled={selected.length === 0}
          className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:border-primary-400 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:text-gray-300 disabled:hover:border-gray-300 transition-colors"
        >
          Clear
        </button>
      </div>

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Selected LGAs">
          {selected.map(id => {
            const name = LGA_BY_ID.get(id)?.name ?? id;
            return (
              <li
                key={id}
                className="inline-flex items-center gap-1 pl-3 pr-1 py-1 text-sm text-primary-700 bg-primary-50 border border-primary-200 rounded-full"
              >
                {name}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  aria-label={`Remove ${name}`}
                  className="p-0.5 rounded-full text-primary-500 hover:bg-primary-100 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
