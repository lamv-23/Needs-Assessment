import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { peerGroupFor } from '@/lib/needs/peer-groups';

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

test('peerGroupFor boundaries', () => {
  expect(peerGroupFor({ areaId: 'lga_sydney', population: 1, densityPerKm2: 4000 })).toBe('metro_inner');
  expect(peerGroupFor({ areaId: 'lga_sydney', population: 1, densityPerKm2: 3999 })).toBe('metro_middle');
  expect(peerGroupFor({ areaId: 'lga_sydney', population: 1, densityPerKm2: 1700 })).toBe('metro_middle');
  expect(peerGroupFor({ areaId: 'lga_blacktown', population: 1, densityPerKm2: 1699 })).toBe('metro_outer');
  expect(peerGroupFor({ areaId: 'lga_newcastle', population: 50000, densityPerKm2: 9999 })).toBe('regional_city');
  expect(peerGroupFor({ areaId: 'lga_newcastle', population: 15000, densityPerKm2: 1 })).toBe('regional_town');
  expect(peerGroupFor({ areaId: 'lga_bourke', population: 14999, densityPerKm2: 0.1 })).toBe('rural');
});

test('every peer group in the snapshot has at least 5 LGAs and Central Coast is outer metro', () => {
  const counts = countBy(NEEDS_SNAPSHOT.records, r => r.peerGroup);
  expect(Object.values(counts).every(n => n >= 5)).toBe(true);
  expect(NEEDS_SNAPSHOT.records.find(r => r.areaId === 'lga_central_coast')!.peerGroup).toBe('metro_outer');
});

test('snapshot covers all 128 LGAs with name, region and population', () => {
  expect(NEEDS_SNAPSHOT.records).toHaveLength(128);
  for (const r of NEEDS_SNAPSHOT.records) {
    expect(r.region).toBeTruthy();
    expect(r.population).toBeGreaterThan(0);
  }
});

test('core Census indicators are present for every LGA', () => {
  for (const id of ['seifa_irsd', 'zero_car_households', 'car_dependency', 'unemployment_rate'] as const)
    expect(NEEDS_SNAPSHOT.records.filter(r => r.values[id].value === null)).toEqual([]);
});

test('Blacktown matches the cache', () => {
  const b = NEEDS_SNAPSHOT.records.find(r => r.areaId === 'lga_blacktown')!;
  expect(b.values.seifa_irsd.value).toBe(987);
  expect(b.values.zero_car_households.value).toBeCloseTo(6.7, 1);
  expect(b.values.car_dependency.value).toBeCloseTo(83.8, 1);
  expect(b.values.frequent_stop_share.value).toBeCloseTo(27.9, 1);
  expect(b.peerGroup).toBe('metro_outer');
});

// The bundled TZP24 extract (src/lib/data/nsw-employment-projections.ts) holds 43 LGAs: all 33 Greater
// Sydney, Central Coast, Newcastle, Lake Macquarie, five Illawarra-Shoalhaven, Lismore and Coffs Harbour.
// The other 85 have no bundled source rows, so job growth stays null for them (never proxied).
const EXPECTED_TZP24_LGAS = 43;

test('job growth coverage matches the TZP24 source', () => {
  expect(NEEDS_SNAPSHOT.records.filter(r => r.values.job_growth_2041.value !== null).length).toBe(EXPECTED_TZP24_LGAS);
});
