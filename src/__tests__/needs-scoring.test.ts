import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { INDICATORS } from '@/lib/needs/indicators';
import {
  assessRecord, bandFor, needPercentile, universeLabelFor, universeRecords,
} from '@/lib/needs/scoring';
import type {
  AreaAssessment, IndicatorId, IndicatorValue, LgaIndicatorRecord, NeedDomain, PeerGroup,
} from '@/lib/needs/types';
import { EMPTY_SERIES } from './fixtures/needs';

type Values = Partial<Record<IndicatorId, number | null>>;

function makeValues(values: Values): Record<IndicatorId, IndicatorValue> {
  const out = {} as Record<IndicatorId, IndicatorValue>;
  for (const def of INDICATORS) out[def.id] = { value: values[def.id] ?? null };
  return out;
}

function makeRecord(areaId: string, values: Values, extra: Partial<LgaIndicatorRecord> = {}): LgaIndicatorRecord {
  return {
    areaId, name: areaId, region: 'Hunter', population: 100000, densityPerKm2: 500,
    peerGroup: 'regional_city', values: makeValues(values), series: EMPTY_SERIES, ...extra,
  };
}

/** Peers whose every indicator takes the values 0..n-1, so a target's percentile is easy to predict. */
function rampPeers(n: number): LgaIndicatorRecord[] {
  return Array.from({ length: n }, (_, i) => makeRecord(`lga_peer_${i}`, Object.fromEntries(INDICATORS.map(d => [d.id, i]))));
}

const byId = (a: AreaAssessment, id: IndicatorId) => a.indicators.find(i => i.id === id)!;
const domainOf = (a: AreaAssessment, domain: NeedDomain) => a.domains.find(d => d.domain === domain)!;

describe('needPercentile', () => {
  test('mid-rank percentile in the direction of need', () => {
    expect(needPercentile(5, [1, 2, 3, 4, 5], 'higher')).toBe(90);
    expect(needPercentile(1, [1, 2, 3, 4, 5], 'lower')).toBe(90);
    expect(needPercentile(3, [3, 3, 3, 3], 'higher')).toBe(50);
  });

  test('runs 0 to 100 and gives half-credit to ties', () => {
    expect(needPercentile(10, [1, 2, 3, 4], 'higher')).toBe(100);
    expect(needPercentile(0, [1, 2, 3, 4], 'higher')).toBe(0);
    expect(needPercentile(10, [1, 2, 3, 4], 'lower')).toBe(0);
    expect(needPercentile(2, [1, 2, 2, 4], 'higher')).toBe(50);
  });
});

describe('bandFor', () => {
  test('band edges', () => {
    expect([bandFor(80), bandFor(79.9), bandFor(60), bandFor(40), bandFor(39.9)])
      .toEqual(['Very high', 'High', 'High', 'Moderate', 'Lower']);
    expect([bandFor(100), bandFor(59.9), bandFor(0)]).toEqual(['Very high', 'Moderate', 'Lower']);
  });
});

describe('assessRecord', () => {
  test('null value → null percentile, not key need', () => {
    const target = makeRecord('lga_target', { car_dependency: null });
    const a = assessRecord(target, 'nsw', rampPeers(5));
    expect(byId(a, 'car_dependency')).toEqual({
      id: 'car_dependency', value: null, percentile: null, keyNeed: false, approximate: false, partial: false,
    });
  });

  test('one score per indicator, in registry order, with unrounded percentiles', () => {
    const a = assessRecord(makeRecord('lga_target', { car_dependency: 0.5 }), 'nsw', rampPeers(3));
    expect(a.indicators.map(i => i.id)).toEqual(INDICATORS.map(d => d.id));
    expect(byId(a, 'car_dependency').value).toBe(0.5);
    expect(byId(a, 'car_dependency').percentile).toBeCloseTo(100 / 3, 10); // 1 of 3 below, not 33
  });

  test('direction lower: a low SEIFA score means high need', () => {
    const target = makeRecord('lga_target', { seifa_irsd: -1 });
    const a = assessRecord(target, 'nsw', rampPeers(5));
    expect(byId(a, 'seifa_irsd').percentile).toBe(100);
    expect(byId(a, 'seifa_irsd').keyNeed).toBe(true);
  });

  test('the distribution is the peers non-null values only', () => {
    const peers = [
      makeRecord('p0', { car_dependency: 10 }),
      makeRecord('p1', { car_dependency: 20 }),
      makeRecord('p2', { car_dependency: null }),
      makeRecord('p3', { car_dependency: null }),
    ];
    const a = assessRecord(makeRecord('lga_target', { car_dependency: 15 }), 'nsw', peers);
    expect(byId(a, 'car_dependency').percentile).toBe(50); // 1 of 2 values below, not 1 of 4
  });

  test('no peer values → null percentile even when the target has a value', () => {
    const peers = [makeRecord('p0', {}), makeRecord('p1', {})];
    const a = assessRecord(makeRecord('lga_target', { car_dependency: 15 }), 'nsw', peers);
    expect(byId(a, 'car_dependency').value).toBe(15);
    expect(byId(a, 'car_dependency').percentile).toBeNull();
    expect(byId(a, 'car_dependency').keyNeed).toBe(false);
  });

  test('keyNeed when percentile >= 80', () => {
    const peers = rampPeers(5);
    // Target outside the peers: 4 of 5 below → exactly 80; 3 of 5 below → 60.
    const a = assessRecord(makeRecord('lga_target', { crash_rate: 3.5, car_dependency: 2.5 }), 'nsw', peers);
    expect(byId(a, 'crash_rate').percentile).toBe(80);
    expect(byId(a, 'crash_rate').keyNeed).toBe(true);
    expect(byId(a, 'car_dependency').percentile).toBe(60);
    expect(byId(a, 'car_dependency').keyNeed).toBe(false);
  });

  test('domain score is null when fewer than half its indicators have values', () => {
    const peers = rampPeers(5);
    // Transport has 6 scored indicators. Values 3, 4, 0 each tie with a peer → percentiles 70, 90, 10.
    const two = assessRecord(makeRecord('lga_target', { car_dependency: 3, zero_car_households: 4 }), 'nsw', peers);
    expect(domainOf(two, 'transport')).toEqual({ domain: 'transport', score: null, band: null, available: 2, total: 6 });

    const three = assessRecord(
      makeRecord('lga_target', { car_dependency: 3, zero_car_households: 4, crash_rate: 0 }), 'nsw', peers);
    const transport = domainOf(three, 'transport') as { score: number; band: string; available: number; total: number };
    expect(transport.available).toBe(3);
    expect(transport.total).toBe(6);
    expect(transport.score).toBeCloseTo((70 + 90 + 10) / 3, 10);
    expect(transport.band).toBe('Moderate');
  });

  test('all three domains are always assessed, in order, with null scores when empty', () => {
    const a = assessRecord(makeRecord('lga_target', {}), 'nsw', rampPeers(5));
    expect(a.domains.map(d => d.domain)).toEqual(['transport', 'socio', 'growth']);
    expect(a.domains.map(d => d.total)).toEqual([6, 6, 3]);
    expect(a.domains.every(d => d.score === null && d.band === null && d.available === 0)).toBe(true);
    expect(a.overall).toBeNull();
    expect(a.band).toBeNull();
  });

  test('unscored indicators get a percentile but do not affect scores or key needs', () => {
    const peers = Array.from({ length: 10 }, (_, i) =>
      makeRecord(`p${i}`, { indigenous_share: i, unemployment_rate: i, low_income_households: i, needs_assistance: i }));
    const socio = { unemployment_rate: 4, low_income_households: 4, needs_assistance: 4 };
    const without = assessRecord(makeRecord('lga_a', { ...socio }), 'nsw', peers);
    const withIndigenous = assessRecord(makeRecord('lga_b', { ...socio, indigenous_share: 9 }), 'nsw', peers);

    expect(byId(withIndigenous, 'indigenous_share').percentile).toBeCloseTo(95, 10);
    expect(byId(withIndigenous, 'indigenous_share').keyNeed).toBe(false);
    expect(byId(without, 'indigenous_share').percentile).toBeNull();

    const socioWith = domainOf(withIndigenous, 'socio');
    expect(socioWith).toEqual(domainOf(without, 'socio'));
    expect(socioWith.total).toBe(6); // scored indicators only
    expect(socioWith.available).toBe(3);
    expect(socioWith.score).toBeCloseTo(45, 10);
    expect(withIndigenous.overall).toBe(without.overall);
  });

  test('an unscored value alone cannot make a domain score', () => {
    const peers = Array.from({ length: 10 }, (_, i) => makeRecord(`p${i}`, { indigenous_share: i }));
    const a = assessRecord(makeRecord('lga_target', { indigenous_share: 9 }), 'nsw', peers);
    expect(domainOf(a, 'socio')).toEqual({ domain: 'socio', score: null, band: null, available: 0, total: 6 });
    expect(a.overall).toBeNull();
  });

  test('overall is the mean of non-null domain scores', () => {
    const target = makeRecord('lga_target', {
      car_dependency: 2.5, zero_car_households: 2.5, commute_distance_km: 2.5, // percentile 60 each
      unemployment_rate: 3.5, low_income_households: 3.5, needs_assistance: 3.5, // percentile 80 each
    });
    const a = assessRecord(target, 'nsw', rampPeers(5));
    expect(domainOf(a, 'transport').score).toBeCloseTo(60, 10);
    expect(domainOf(a, 'socio').score).toBeCloseTo(80, 10);
    expect(domainOf(a, 'growth').score).toBeNull();
    expect(a.overall).toBeCloseTo(70, 10);
    expect(a.band).toBe('High');
    expect(domainOf(a, 'socio').band).toBe('Very high');
  });

  test('approximate and partial flags come from the flags argument', () => {
    const target = makeRecord('lga_target', { car_dependency: 1, crash_rate: 1 });
    const a = assessRecord(target, 'nsw', rampPeers(5), { approximate: ['car_dependency'], partial: ['crash_rate'] });
    expect(byId(a, 'car_dependency')).toMatchObject({ approximate: true, partial: false });
    expect(byId(a, 'crash_rate')).toMatchObject({ approximate: false, partial: true });
    expect(byId(a, 'zero_car_households')).toMatchObject({ approximate: false, partial: false });
  });

  test('carries the target identity and universe description', () => {
    const peers = rampPeers(6);
    const target = makeRecord('lga_target', {}, { name: 'Target', region: 'Hunter', population: 12345, peerGroup: 'regional_town' });
    const a = assessRecord(target, 'region', peers);
    expect(a).toMatchObject({
      areaId: 'lga_target', name: 'Target', region: 'Hunter', population: 12345, peerGroup: 'regional_town',
      universe: 'region', universeLabel: 'LGAs in the Hunter region', universeSize: 6, smallGroup: false,
    });
    const peer = assessRecord(target, 'peer', peers);
    expect(peer.universeLabel).toBe('regional towns');
  });

  test('a combined area with no single peer group has a null peerGroup', () => {
    const combined = { ...makeRecord('combined', {}), peerGroup: null };
    const a = assessRecord(combined, 'nsw', rampPeers(5));
    expect(a.peerGroup).toBeNull();
    expect(a.universeLabel).toBe('NSW LGAs');
  });

  test('smallGroup when the universe has fewer than 5 LGAs', () => {
    const target = makeRecord('lga_target', {});
    expect(assessRecord(target, 'nsw', rampPeers(4)).smallGroup).toBe(true);
    expect(assessRecord(target, 'nsw', rampPeers(4)).universeSize).toBe(4);
    expect(assessRecord(target, 'nsw', rampPeers(5)).smallGroup).toBe(false);
  });
});

describe('universes', () => {
  const records = NEEDS_SNAPSHOT.records;

  test('universes from the real snapshot', () => {
    expect(universeRecords(records, 'nsw')).toHaveLength(128);
    expect(universeRecords(records, 'gsyd')).toHaveLength(34);
    const hunter = universeRecords(records, 'region', { region: 'Hunter', peerGroup: null });
    expect(hunter.length).toBeGreaterThan(0);
    expect(hunter.every(r => r.region === 'Hunter')).toBe(true);
    const outer = universeRecords(records, 'peer', { region: 'Greater Sydney', peerGroup: 'metro_outer' });
    expect(outer.length).toBeGreaterThan(0);
    expect(outer.every(r => r.peerGroup === 'metro_outer')).toBe(true);
  });

  test('gsyd follows the GCCSA list, so it includes Central Coast although its region is its own', () => {
    const gsyd = universeRecords(records, 'gsyd');
    expect(gsyd.map(r => r.areaId)).toContain('lga_central_coast');
    expect(gsyd.some(r => r.region !== 'Greater Sydney')).toBe(true);
  });

  test('region and peer universes need a target', () => {
    expect(() => universeRecords(records, 'region')).toThrow();
    expect(() => universeRecords(records, 'peer')).toThrow();
    expect(() => universeRecords(records, 'peer', { region: 'Hunter', peerGroup: null })).toThrow();
  });

  test('universe labels', () => {
    expect(universeLabelFor('nsw')).toBe('NSW LGAs');
    expect(universeLabelFor('gsyd')).toBe('Greater Sydney LGAs');
    expect(universeLabelFor('region', { region: 'Hunter', peerGroup: null })).toBe('LGAs in the Hunter region');
    expect(universeLabelFor('peer', { region: 'Hunter', peerGroup: 'regional_city' })).toBe('regional cities');
    expect(() => universeLabelFor('peer', { region: 'Hunter', peerGroup: null })).toThrow();
  });

  test('assessing a real LGA against its peer groups', () => {
    const sydney = records.find(r => r.areaId === 'lga_sydney')!;
    for (const universe of ['nsw', 'gsyd', 'region', 'peer'] as const) {
      const target = { region: sydney.region, peerGroup: sydney.peerGroup as PeerGroup | null };
      const peers = universeRecords(records, universe, target);
      expect(peers.map(r => r.areaId)).toContain('lga_sydney');
      const a = assessRecord(sydney, universe, peers);
      expect(a.universeSize).toBe(peers.length);
      expect(a.indicators).toHaveLength(16);
      for (const i of a.indicators.filter(i => i.percentile !== null)) {
        expect(i.percentile).toBeGreaterThanOrEqual(0);
        expect(i.percentile).toBeLessThanOrEqual(100);
      }
      expect(a.overall).not.toBeNull();
    }
  });

  test('the Central Coast region is a single-LGA small group', () => {
    const cc = records.find(r => r.areaId === 'lga_central_coast')!;
    const peers = universeRecords(records, 'region', { region: cc.region, peerGroup: cc.peerGroup });
    expect(peers).toHaveLength(1);
    expect(assessRecord(cc, 'region', peers).smallGroup).toBe(true);
  });
});
