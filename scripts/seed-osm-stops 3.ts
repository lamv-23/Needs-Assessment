/**
 * seed-osm-stops.ts
 *
 * Seeds the gtfs_stops table with public transport stops from OpenStreetMap
 * via the Overpass API — no API key required.
 *
 * Covers Greater Sydney + key regional centres.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/seed-osm-stops.ts
 *   npm run seed:osm-stops
 */

import { clearGtfsStops, upsertGtfsStopsBatch } from '../src/lib/db';
import type { GtfsStop } from '../src/lib/db';

// Bounding box: Greater Sydney + Wollongong + Central Coast + Blue Mountains
const BBOX = '-34.4,150.0,-32.9,151.55';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

// Overpass QL query — fetch all relevant PT stop types
function buildQuery(bbox: string): string {
  return `[out:json][timeout:90];
(
  node["railway"="station"](${bbox});
  node["railway"="halt"](${bbox});
  node["railway"="tram_stop"](${bbox});
  node["highway"="bus_stop"](${bbox});
  node["public_transport"="stop_position"](${bbox});
  node["amenity"="ferry_terminal"](${bbox});
  node["amenity"="bus_station"](${bbox});
);
out body;`;
}

function classifyMode(tags: Record<string, string>): string | null {
  const railway = tags['railway'];
  const amenity = tags['amenity'];
  const highway = tags['highway'];
  const publicTransport = tags['public_transport'];
  const network = (tags['network'] ?? '').toLowerCase();
  const station = (tags['station'] ?? '').toLowerCase();
  const bus = tags['bus'];
  const train = tags['train'];
  const light_rail = tags['light_rail'];
  const ferry = tags['ferry'];

  // Metro
  if (
    station === 'subway' ||
    network.includes('metro') ||
    (railway === 'station' && network.includes('sydney metro'))
  ) return 'metro';

  // Train (heavy rail)
  if (railway === 'station' || railway === 'halt') {
    if (station === 'light_rail' || network.includes('light rail') || network.includes('tram')) return 'lightRail';
    return 'train';
  }

  // Light rail / tram
  if (railway === 'tram_stop') return 'lightRail';
  if (light_rail === 'yes') return 'lightRail';

  // Ferry
  if (amenity === 'ferry_terminal' || ferry === 'yes') return 'ferry';

  // Bus
  if (highway === 'bus_stop' || amenity === 'bus_station' || bus === 'yes') return 'bus';

  // public_transport=stop_position — derive from other tags
  if (publicTransport === 'stop_position') {
    if (train === 'yes') return 'train';
    if (light_rail === 'yes') return 'lightRail';
    if (ferry === 'yes') return 'ferry';
    return 'bus';
  }

  return null;
}

async function fetchOverpass(query: string): Promise<OverpassElement[]> {
  const body = `data=${encodeURIComponent(query)}`;
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as OverpassResponse;
  return json.elements;
}

async function main() {
  console.log('🗺  Fetching PT stops from OpenStreetMap Overpass API...');
  console.log(`   Bounding box: ${BBOX}`);

  let elements: OverpassElement[];
  try {
    elements = await fetchOverpass(buildQuery(BBOX));
  } catch (err) {
    console.error('❌ Overpass fetch failed:', err);
    process.exit(1);
  }

  console.log(`   Raw elements returned: ${elements.length}`);

  const stops: GtfsStop[] = [];
  const seen = new Set<string>();

  for (const el of elements) {
    if (!el.tags) continue;

    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!lat || !lon) continue;

    const mode = classifyMode(el.tags);
    if (!mode) continue;

    const name =
      el.tags['name'] ||
      el.tags['ref'] ||
      el.tags['local_ref'] ||
      `OSM ${el.id}`;

    const stopId = `osm_${el.id}`;
    if (seen.has(stopId)) continue;
    seen.add(stopId);

    stops.push({
      stop_id: stopId,
      stop_name: name,
      lat,
      lng: lon,
      mode,
      feed: 'osm',
    });
  }

  // Summarise by mode
  const modeCounts: Record<string, number> = {};
  for (const s of stops) {
    modeCounts[s.mode] = (modeCounts[s.mode] ?? 0) + 1;
  }

  console.log('\n📊 Stop counts by mode:');
  for (const [mode, count] of Object.entries(modeCounts)) {
    console.log(`   ${mode.padEnd(12)} ${count}`);
  }
  console.log(`   ${'TOTAL'.padEnd(12)} ${stops.length}`);

  if (stops.length === 0) {
    console.error('\n❌ No stops found — check network access and bounding box');
    process.exit(1);
  }

  console.log('\n💾 Writing to gtfs_stops table...');
  clearGtfsStops();
  upsertGtfsStopsBatch(stops);

  console.log(`✅ Done — ${stops.length} stops seeded from OSM`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
