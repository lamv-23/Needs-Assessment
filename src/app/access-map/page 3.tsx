'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { useAppStore } from '@/store';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import { useDebounce } from '@/hooks/useDebounce';
import type { NearbyStop } from '@/components/maps/AccessRadiusMap';
import { MapPin, Train, Bus, Anchor, Zap, Circle, Info, Navigation, ChevronUp, ChevronDown } from 'lucide-react';

const AccessRadiusMap = dynamic(
  () => import('@/components/maps/AccessRadiusMap'),
  { ssr: false }
);

const MODE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  train:     { label: 'Train',      icon: <Train size={16} />,  color: 'text-rose-600 bg-rose-50' },
  metro:     { label: 'Metro',      icon: <Zap size={16} />,    color: 'text-violet-600 bg-violet-50' },
  bus:       { label: 'Bus',        icon: <Bus size={16} />,    color: 'text-blue-600 bg-blue-50' },
  ferry:     { label: 'Ferry',      icon: <Anchor size={16} />, color: 'text-cyan-600 bg-cyan-50' },
  lightRail: { label: 'Light Rail', icon: <Circle size={16} />, color: 'text-amber-600 bg-amber-50' },
};

const MODE_KEYS = ['train', 'metro', 'bus', 'ferry', 'lightRail'] as const;
type ModeKey = typeof MODE_KEYS[number];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AccessMapPage() {
  const { selectedArea } = useAppStore();
  const areaId = selectedArea?.id ?? 'lga_sydney';

  const areaData = SAMPLE_AREAS.find((a) => a.id === areaId);
  const initialCenter: [number, number] = [
    areaData?.centroidLat ?? -33.8688,
    areaData?.centroidLng ?? 151.2093,
  ];

  const [point, setPoint] = useState<[number, number] | null>(null);
  const [radius, setRadius] = useState(1000);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [groupedStops, setGroupedStops] = useState(true);
  const [selectedModes, setSelectedModes] = useState<Record<ModeKey, boolean>>({
    train: true,
    metro: true,
    bus: true,
    ferry: true,
    lightRail: true,
  });
  const debouncedPoint = useDebounce(point, 300);
  const debouncedRadius = useDebounce(radius, 300);

  const activeModes = MODE_KEYS.filter((mode) => selectedModes[mode]);

  const apiUrl =
    debouncedPoint
      ? `/api/transport/stops-near?lat=${debouncedPoint[0]}&lng=${debouncedPoint[1]}&radius=${debouncedRadius}&grouped=${groupedStops}&modes=${encodeURIComponent(activeModes.join(','))}`
      : null;

  const { data, isLoading } = useSWR<{
    stops: NearbyStop[];
    counts: Record<string, number>;
  }>(apiUrl, fetcher);

  const stops = data?.stops ?? [];
  const counts = data?.counts ?? { bus: 0, train: 0, ferry: 0, lightRail: 0, metro: 0, total: 0 };

  const handlePointChange = useCallback((lat: number, lng: number) => {
    setPoint([lat, lng]);
    setMobilePanelOpen(true);
  }, []);

  const handleClearMarker = useCallback(() => {
    setPoint(null);
    setMobilePanelOpen(false);
  }, []);

  const toggleMode = useCallback((mode: ModeKey) => {
    setSelectedModes((current) => {
      const enabledCount = MODE_KEYS.filter((key) => current[key]).length;
      if (current[mode] && enabledCount === 1) {
        return current;
      }
      return {
        ...current,
        [mode]: !current[mode],
      };
    });
  }, []);

  useEffect(() => {
    if (!point) {
      setMobilePanelOpen(false);
    }
  }, [point]);

  const radiusHelperText =
    radius <= 700
      ? 'Good for a short walk: roughly 5-10 minutes on foot.'
      : radius <= 1500
        ? 'Typical walk-up catchment: roughly 10-20 minutes on foot.'
        : radius <= 3000
          ? 'Useful for cycling or local feeder access.'
          : 'Best for broader access testing, not just walk-up catchments.';

  const mobileSummary = !point
    ? 'Tap the map to place a marker'
      : isLoading
        ? 'Finding stops near your marker...'
        : `${counts.total} ${groupedStops ? 'grouped stop location' : 'stop'}${counts.total === 1 ? '' : 's'} found within ${radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}`;

  const panelHeader = (
    <div className="px-5 pt-5 pb-4 border-b border-gray-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <MapPin size={18} className="text-primary-600" />
            PT Access Map
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Place a marker on the map to measure how many public transport stops fall within a walk-up or cycle catchment.
          </p>
        </div>
        {point && (
          <button
            onClick={handleClearMarker}
            className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-primary-300 hover:text-primary-700"
          >
            Clear marker
          </button>
        )}
      </div>
    </div>
  );

  const panelBody = (
    <>
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="mb-4">
          <div className="text-sm font-medium text-gray-700 mb-2">Display</div>
          <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
            <button
              onClick={() => setGroupedStops(true)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${groupedStops ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Grouped
            </button>
            <button
              onClick={() => setGroupedStops(false)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${!groupedStops ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Raw platforms / stands
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {groupedStops
              ? 'Counts shown as grouped stop locations, with train platforms and bus stands combined where they belong together.'
              : 'Showing individual platforms, stands and stop points from the underlying source data.'}
          </p>
        </div>

        <div className="mb-4">
          <div className="text-sm font-medium text-gray-700 mb-2">Modes</div>
          <div className="flex flex-wrap gap-2">
            {MODE_KEYS.map((mode) => {
              const meta = MODE_META[mode];
              const active = selectedModes[mode];
              return (
                <button
                  key={mode}
                  onClick={() => toggleMode(mode)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? `${meta.color} border-transparent`
                      : 'border-gray-200 text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {meta.icon}
                  {meta.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Choose which public transport modes to include in the map and counts.
          </p>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-2">
          Radius:{' '}
          <span className="text-primary-600 font-semibold">
            {radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}
          </span>
        </label>
        <input
          type="range"
          min={500}
          max={5000}
          step={100}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="w-full accent-primary-600"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>500 m · short walk</span>
          <span>5 km · broader catchment</span>
        </div>
        <p className="mt-2 text-xs text-gray-500 leading-relaxed">
          {radiusHelperText}
        </p>
      </div>

      <div className="px-5 py-4 flex-1">
        {!point ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-10">
            <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center">
              <MapPin size={22} className="text-primary-500" />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-gray-600 font-medium">
                Start by placing a marker on the map
              </p>
              <div className="text-xs text-gray-500 space-y-1">
                <p>1. Click or tap the map to choose a location</p>
                <p>2. Adjust the radius to test a short walk or wider catchment</p>
                <p>3. Review nearby stops by mode and distance</p>
              </div>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-10 text-sm text-gray-400 gap-2">
            <svg className="animate-spin h-4 w-4 text-primary-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Finding stops near your marker...
          </div>
        ) : (
          <>
            <div className="mb-4 p-3 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-between">
              <span className="text-sm font-medium text-primary-700">
                Total {groupedStops ? 'grouped stop locations' : 'stops'} within radius
              </span>
              <span className="text-xl font-bold text-primary-700">{counts.total}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {Object.entries(MODE_META).map(([mode, meta]) => {
                const count = counts[mode] ?? 0;
                return (
                  <div
                    key={mode}
                    className={`rounded-lg p-3 flex items-center gap-2 ${meta.color}`}
                  >
                    {meta.icon}
                    <div>
                      <div className="text-xs font-medium">{meta.label}</div>
                      <div className="text-lg font-bold leading-tight">{count}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {stops.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Closest {groupedStops ? 'grouped stop locations' : 'stops'} to your marker
                </h3>
                <ul className="space-y-1.5">
                  {stops.slice(0, 8).map((s) => {
                    const meta = MODE_META[s.mode];
                    return (
                      <li
                        key={s.stop_id}
                        className="flex items-start gap-2 text-sm"
                      >
                        <span className={`mt-0.5 shrink-0 ${meta?.color ?? 'text-gray-500'} rounded p-0.5`}>
                          {meta?.icon ?? <Circle size={14} />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-gray-700">{s.stop_name}</span>
                          {s.memberCount && s.memberCount > 1 && (
                            <span className="block text-[11px] text-gray-500">
                              {s.memberCount} {s.mode === 'bus' ? 'stands' : 'platforms'} combined
                            </span>
                          )}
                        </span>
                        <span className="text-gray-400 shrink-0">{Math.round(s.distance)}m</span>
                      </li>
                    );
                  })}
                  {stops.length > 8 && (
                    <li className="text-xs text-gray-500 pl-6 flex items-center gap-1">
                      <ChevronUp size={12} className="rotate-90" />
                      Showing 8 closest results. {stops.length - 8} more are visible on the map.
                    </li>
                  )}
                </ul>
              </div>
            )}

            {counts.total === 0 && (
              <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
                <Info size={15} className="shrink-0 mt-0.5" />
                No matching public transport stops were found within this radius. Try enabling more modes, moving the marker, or increasing the radius to test a wider catchment.
              </div>
            )}

            {counts.total > 0 && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 leading-relaxed">
                Tip: tap a stop on the map to see its name, mode and distance from your marker.
              </div>
            )}
          </>
        )}
      </div>
    </>
  );

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] overflow-hidden">
      {/* ── Map panel ── */}
      <div className="flex-1 relative min-h-0">
        <div className="md:hidden absolute top-3 left-3 right-3 z-[500]">
          <div className="rounded-xl border border-primary-200 bg-white/95 backdrop-blur-sm shadow-sm px-4 py-3">
            <div className="flex items-start gap-2">
              <Navigation size={16} className="text-primary-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-gray-900">Tap the map to place a marker</div>
                <div className="text-gray-600">Then adjust the radius to see nearby public transport stops.</div>
              </div>
            </div>
          </div>
        </div>

        <AccessRadiusMap
          initialCenter={initialCenter}
          point={point}
          radius={radius}
          stops={stops}
          onPointChange={handlePointChange}
          className="h-full"
        />

        {!point && (
          <div className="absolute inset-0 flex items-end justify-center pb-10 pointer-events-none">
            <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl px-5 py-3 shadow flex items-center gap-2 text-sm text-gray-600">
              <MapPin size={16} className="text-primary-600 shrink-0" />
              Click to place a marker and see nearby public transport stops
            </div>
          </div>
        )}
      </div>

      {/* ── Control + stats panel ── */}
      <aside className="hidden md:flex w-full md:w-80 bg-white border-t md:border-t-0 md:border-l border-gray-200 flex-col overflow-y-auto shrink-0">
        {panelHeader}
        {panelBody}
      </aside>

      <div className="md:hidden fixed inset-x-0 bottom-16 z-[550] px-3">
        <div className="overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-xl">
          <button
            onClick={() => setMobilePanelOpen((open) => !open)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div>
              <div className="text-sm font-semibold text-gray-900">Analysis panel</div>
              <div className="text-xs text-gray-500 mt-0.5">{mobileSummary}</div>
            </div>
            {mobilePanelOpen ? (
              <ChevronDown size={18} className="text-gray-500" />
            ) : (
              <ChevronUp size={18} className="text-gray-500" />
            )}
          </button>

          {mobilePanelOpen && (
            <div className="max-h-[52vh] overflow-y-auto border-t border-gray-100">
              {panelHeader}
              {panelBody}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
