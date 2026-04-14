import { NextRequest, NextResponse } from 'next/server';
import { haversine } from '@/lib/geo';
import { getTransitStopsRepository } from '@/lib/repositories';

export const runtime = 'nodejs';

type NearbyStop = {
  stop_id: string;
  stop_name: string;
  lat: number;
  lng: number;
  mode: string;
  feed: string;
  distance: number;
  memberCount?: number;
};

type GroupedStop = NearbyStop & {
  memberCount: number;
  rawNames: Set<string>;
  pointCount: number;
};

function normalizeStopName(name: string, mode: string): string {
  let normalized = name.trim();

  if (mode === 'train' || mode === 'metro' || mode === 'lightRail') {
    normalized = normalized.replace(/\s+Platform\s+[A-Z0-9-]+$/i, '');
  }

  if (mode === 'bus') {
    normalized = normalized
      .replace(/,\s*Stand\s+[A-Z0-9-]+$/i, '')
      .replace(/,\s*Bay\s+[A-Z0-9-]+$/i, '')
      .replace(/,\s*Platform\s+[A-Z0-9-]+$/i, '');
  }

  if (mode === 'ferry') {
    normalized = normalized.replace(/,\s*Wharf\s+\d+[A-Z]?$/i, '');
  }

  return normalized.replace(/\s+/g, ' ').trim();
}

function getGroupingThreshold(mode: string): number {
  switch (mode) {
    case 'train':
    case 'metro':
    case 'lightRail':
      return 250;
    case 'bus':
      return 350;
    case 'ferry':
      return 200;
    default:
      return 120;
  }
}

function groupNearbyStops(originLat: number, originLng: number, stops: NearbyStop[]): NearbyStop[] {
  const grouped = new Map<string, GroupedStop[]>();

  for (const stop of stops) {
    const normalizedName = normalizeStopName(stop.stop_name, stop.mode);
    const key = `${stop.mode}:${normalizedName}`;
    const existingGroup = grouped.get(key) ?? [];
    const threshold = getGroupingThreshold(stop.mode);

    const matchingCluster = existingGroup.find((candidate) => (
      haversine(candidate.lat, candidate.lng, stop.lat, stop.lng) <= threshold
    ));

    if (!matchingCluster) {
      grouped.set(key, [
        ...existingGroup,
        {
          ...stop,
          stop_name: normalizedName,
          memberCount: 1,
          rawNames: new Set([stop.stop_name]),
          pointCount: 1,
        },
      ]);
      continue;
    }

    const currentCount = matchingCluster.pointCount;
    matchingCluster.rawNames.add(stop.stop_name);
    const nextCount = currentCount + 1;
    matchingCluster.lat = ((matchingCluster.lat * currentCount) + stop.lat) / (currentCount + 1);
    matchingCluster.lng = ((matchingCluster.lng * currentCount) + stop.lng) / (currentCount + 1);
    matchingCluster.pointCount = nextCount;
    matchingCluster.memberCount = matchingCluster.rawNames.size;
  }

  return Array.from(grouped.values())
    .flat()
    .map(({ rawNames: _rawNames, pointCount: _pointCount, ...stop }) => ({
      ...stop,
      distance: haversine(originLat, originLng, stop.lat, stop.lng),
    }))
    .sort((a, b) => a.distance - b.distance);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');
  const radius = Math.min(10000, Math.max(100, parseFloat(searchParams.get('radius') ?? '1000')));
  const grouped = searchParams.get('grouped') !== 'false';
  const modesParam = searchParams.get('modes');
  const requestedModes = new Set(
    (modesParam ?? 'bus,train,ferry,lightRail,metro')
      .split(',')
      .map((mode) => mode.trim())
      .filter(Boolean)
  );

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  // Approximate bounding box (1 degree ≈ 111 km)
  const latDelta = radius / 111000;
  const lngDelta = radius / (111000 * Math.cos((lat * Math.PI) / 180));

  const candidates = await getTransitStopsRepository().queryStopsInBounds(
    lat - latDelta,
    lat + latDelta,
    lng - lngDelta,
    lng + lngDelta
  );

  // Precise haversine filter
  const rawStops: NearbyStop[] = candidates
    .filter((s) => requestedModes.has(s.mode))
    .map((s) => ({
      stop_id: s.stopId,
      stop_name: s.stopName,
      lat: s.lat,
      lng: s.lng,
      mode: s.mode,
      feed: s.feed,
      distance: haversine(lat, lng, s.lat, s.lng),
    }))
    .filter((s) => s.distance <= radius)
    .sort((a, b) => a.distance - b.distance);

  const stops = grouped ? groupNearbyStops(lat, lng, rawStops) : rawStops;

  const counts: Record<string, number> = {
    bus: 0,
    train: 0,
    ferry: 0,
    lightRail: 0,
    metro: 0,
    total: 0,
  };
  for (const s of stops) {
    const key = s.mode in counts ? s.mode : 'bus';
    counts[key]++;
    counts.total++;
  }

  return NextResponse.json({ stops, counts });
}
