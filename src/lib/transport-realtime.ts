import { SAMPLE_AREAS } from '@/lib/data/sample-areas';

export const REALTIME_DESTINATIONS = {
  sydney_cbd: { name: 'Sydney CBD', lat: -33.8688, lng: 151.2093 },
  parramatta_cbd: { name: 'Parramatta CBD', lat: -33.8148, lng: 151.0017 },
} as const;

const WESTERN_LGAS = new Set([
  'lga_penrith',
  'lga_blacktown',
  'lga_camden',
  'lga_liverpool',
  'lga_campbelltown',
  'lga_blue_mountains',
]);

export type RealtimeDestinationKey = keyof typeof REALTIME_DESTINATIONS;

export function findNearestDestination(lgaId: string): RealtimeDestinationKey {
  return WESTERN_LGAS.has(lgaId) ? 'parramatta_cbd' : 'sydney_cbd';
}

export function getRealtimeCentroid(lgaId: string): { lat: number; lng: number } | null {
  const area = SAMPLE_AREAS.find((candidate) => candidate.id === lgaId);
  if (typeof area?.centroidLat === 'number' && typeof area?.centroidLng === 'number') {
    return { lat: area.centroidLat, lng: area.centroidLng };
  }

  return null;
}
