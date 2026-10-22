import * as fs from 'fs';
import * as path from 'path';
import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { runAssessment } from '@/lib/needs/assess';
import { INDICATOR_BY_ID, INDICATORS } from '@/lib/needs/indicators';
import { buildInsights } from '@/lib/needs/insights';
import { buildNarrative } from '@/lib/needs/narrative';
import {
  assessRecord, bandFor, needPercentile, universeLabelFor, universeRecords,
} from '@/lib/needs/scoring';
import type {
  AreaAssessment, IndicatorId, IndicatorValue, LgaIndicatorRecord, NeedDomain, NeedsMode, PeerGroup, ScorableRecord,
  Universe,
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
      id: 'car_dependency', value: null, percentile: null, rank: null, ranked: null, unranked: false, keyNeed: false,
      approximate: false, partial: false,
    });
  });

  test('one score per indicator, in registry order, with unrounded percentiles', () => {
    const a = assessRecord(makeRecord('lga_target', { car_dependency: 0.5 }), 'nsw', rampPeers(6));
    expect(a.indicators.map(i => i.id)).toEqual(INDICATORS.map(d => d.id));
    expect(byId(a, 'car_dependency').value).toBe(0.5);
    expect(byId(a, 'car_dependency').percentile).toBeCloseTo(100 / 6, 10); // 1 of 6 below, not 17
  });

  test('direction lower: a low SEIFA score means high need', () => {
    const target = makeRecord('lga_target', { seifa_irsd: -1 });
    const a = assessRecord(target, 'nsw', rampPeers(5));
    expect(byId(a, 'seifa_irsd').percentile).toBe(100);
    expect(byId(a, 'seifa_irsd').keyNeed).toBe(true);
  });

  test('the distribution is the peers non-null values only', () => {
    const peers = [
      ...[10, 20, 30, 40].map((v, i) => makeRecord(`p${i}`, { car_dependency: v })),
      makeRecord('p4', { car_dependency: null }),
      makeRecord('p5', { car_dependency: null }),
    ];
    const a = assessRecord(makeRecord('lga_target', { car_dependency: 25 }), 'nsw', [...peers, makeRecord('p6', { car_dependency: 50 })]);
    expect(byId(a, 'car_dependency').percentile).toBe(40); // 2 of 5 values below, not 2 of 7
    expect(byId(a, 'car_dependency').ranked).toBe(5);
  });

  test('no peer values → not ranked, even when the target has a value', () => {
    const peers = [makeRecord('p0', {}), makeRecord('p1', {})];
    const a = assessRecord(makeRecord('lga_target', { car_dependency: 15 }), 'nsw', peers);
    expect(byId(a, 'car_dependency')).toMatchObject({
      value: 15, percentile: null, rank: null, ranked: 0, unranked: true, keyNeed: false,
    });
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
    // Transport has 7 scored indicators. Values 3, 4, 0 each tie with a peer → percentiles 70, 90, 10; a catchment
    // share of 0 (lower is more need) → 90.
    const three = assessRecord(
      makeRecord('lga_target', { car_dependency: 3, zero_car_households: 4, crash_rate: 0 }), 'nsw', peers);
    expect(domainOf(three, 'transport')).toEqual({ domain: 'transport', score: null, band: null, available: 3, total: 7 });

    const four = assessRecord(
      makeRecord('lga_target', { car_dependency: 3, zero_car_households: 4, crash_rate: 0, frequent_service_catchment: 0 }),
      'nsw', peers);
    const transport = domainOf(four, 'transport') as { score: number; band: string; available: number; total: number };
    expect(transport.available).toBe(4);
    expect(transport.total).toBe(7);
    expect(transport.score).toBeCloseTo((70 + 90 + 10 + 90) / 4, 10);
    expect(transport.band).toBe('High');
  });

  test('frequent_stop_share is context: it gets a percentile but no key need and counts towards no score', () => {
    const peers = rampPeers(5);
    const a = assessRecord(makeRecord('lga_target', { frequent_stop_share: -1 }), 'nsw', peers);
    expect(byId(a, 'frequent_stop_share')).toMatchObject({ percentile: 100, rank: 1, keyNeed: false });
    expect(domainOf(a, 'transport')).toMatchObject({ score: null, available: 0, total: 7 });
  });

  test('all three domains are always assessed, in order, with null scores when empty', () => {
    const a = assessRecord(makeRecord('lga_target', {}), 'nsw', rampPeers(5));
    expect(a.domains.map(d => d.domain)).toEqual(['transport', 'socio', 'growth']);
    expect(a.domains.map(d => d.total)).toEqual([7, 6, 3]);
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
      frequent_service_catchment: 1.5, // lower is more need: 3 of 5 have a higher share → percentile 60
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

describe('rank and ranked (R57)', () => {
  /** Eight LGAs whose car dependency is 1..8; `values` replaces some of them. */
  const eight = (values: Array<number | null> = [1, 2, 3, 4, 5, 6, 7, 8]) =>
    values.map((v, i) => makeRecord(`lga_${i}`, { car_dependency: v, seifa_irsd: v }));
  const rankOf = (target: LgaIndicatorRecord, peers: LgaIndicatorRecord[], id: IndicatorId = 'car_dependency') => {
    const s = byId(assessRecord(target, 'region', peers), id);
    return [s.rank, s.ranked];
  };

  test('a group of 8: the most car-dependent ranks 1st, the next 2nd, of 8', () => {
    const peers = eight();
    expect(rankOf(peers[7], peers)).toEqual([1, 8]);
    expect(rankOf(peers[6], peers)).toEqual([2, 8]);
    expect(rankOf(peers[0], peers)).toEqual([8, 8]);
  });

  test('direction lower: the lowest SEIFA score ranks 1st', () => {
    const peers = eight();
    expect(rankOf(peers[0], peers, 'seifa_irsd')).toEqual([1, 8]);
    expect(rankOf(peers[7], peers, 'seifa_irsd')).toEqual([8, 8]);
  });

  test('ties share the better rank', () => {
    const peers = eight([8, 8, 6, 5, 4, 3, 2, 1]);
    expect(rankOf(peers[0], peers)).toEqual([1, 8]);
    expect(rankOf(peers[1], peers)).toEqual([1, 8]);
    expect(rankOf(peers[2], peers)).toEqual([3, 8]);
  });

  test('ranked counts the universe LGAs with a value only', () => {
    const peers = eight([1, 2, null, 4, 5, null, 7, 8]);
    expect(rankOf(peers[7], peers)).toEqual([1, 6]);
  });

  test('an area that is not one of the LGAs (combined, benchmark) takes the place it would have among them', () => {
    const peers = eight();
    expect(rankOf(makeRecord('combined', { car_dependency: 9 }), peers)).toEqual([1, 8]);
    expect(rankOf(makeRecord('combined', { car_dependency: 6.5 }), peers)).toEqual([3, 8]);
  });

  test('no value: no rank', () => {
    expect(rankOf(makeRecord('lga_target', { car_dependency: null }), eight())).toEqual([null, null]);
  });
});

describe('per-indicator small group (R58)', () => {
  /** `withJobs` LGAs with job growth 1..n; every LGA has population growth and approvals 1..10. */
  const peers = (withJobs: number) => Array.from({ length: 10 }, (_, i) => makeRecord(`lga_${i}`, {
    pop_growth_2041: i + 1, approvals_per_1000: i + 1, job_growth_2041: i < withJobs ? i + 1 : null,
  }));
  const target = makeRecord('lga_target', { pop_growth_2041: 10, approvals_per_1000: 10, job_growth_2041: 99 });

  test('fewer than 5 LGAs with a value: no percentile or rank, not a key need, and the count kept', () => {
    const a = assessRecord(target, 'region', peers(4));
    expect(byId(a, 'job_growth_2041')).toMatchObject({
      value: 99, percentile: null, rank: null, ranked: 4, unranked: true, keyNeed: false,
    });
    expect(byId(a, 'pop_growth_2041')).toMatchObject({ unranked: false, ranked: 10, rank: 1 });
  });

  test('5 LGAs with a value are ranked', () => {
    const a = assessRecord(target, 'region', peers(5));
    expect(byId(a, 'job_growth_2041')).toMatchObject({ percentile: 100, rank: 1, ranked: 5, unranked: false, keyNeed: true });
  });

  test('an unranked indicator counts towards no domain or overall score', () => {
    const growth = domainOf(assessRecord(target, 'region', peers(4)), 'growth');
    expect(growth.available).toBe(2);
    expect(growth.score).toBeCloseTo((95 + 95) / 2, 10);
  });

  test('a value with no peer values is not ranked either', () => {
    const lone = assessRecord(target, 'region', peers(0));
    expect(byId(lone, 'job_growth_2041')).toMatchObject({ ranked: 0, unranked: true, percentile: null });
  });

  test('no value is not "unranked": it is missing', () => {
    const a = assessRecord(makeRecord('lga_target', {}), 'region', peers(4));
    expect(byId(a, 'job_growth_2041')).toMatchObject({ value: null, ranked: null, unranked: false });
  });

  describe('on real data', () => {
    const records = NEEDS_SNAPSHOT.records;
    const assessIn = (areaId: string, universe: 'nsw' | 'region') => {
      const record = records.find(r => r.areaId === areaId)!;
      return assessRecord(record, universe, universeRecords(records, universe, record));
    };

    test('job growth in the Hunter region: 2 LGAs with data, so Newcastle is not ranked on it', () => {
      const newcastle = assessIn('lga_newcastle', 'region');
      expect(byId(newcastle, 'job_growth_2041')).toMatchObject({ ranked: 2, unranked: true, percentile: null });
      const growth = domainOf(newcastle, 'growth');
      expect(growth.available).toBe(2);
      const ranked = ['pop_growth_2041', 'approvals_per_1000'].map(id => byId(newcastle, id as IndicatorId).percentile!);
      expect(growth.score).toBeCloseTo((ranked[0] + ranked[1]) / 2, 10);
    });

    test('job growth against NSW: ranked among the 43 LGAs with data', () => {
      const camden = assessIn('lga_camden', 'nsw');
      expect(camden.universeSize).toBe(128);
      expect(byId(camden, 'job_growth_2041')).toMatchObject({ ranked: 43, unranked: false });
    });

    test('the Central Coast region (one LGA) ranks nothing, so it has no overall score', () => {
      const cc = assessIn('lga_central_coast', 'region');
      expect(cc.indicators.filter(s => s.value !== null).every(s => s.unranked && s.percentile === null)).toBe(true);
      expect(cc.domains.every(d => d.score === null)).toBe(true);
      expect(cc.overall).toBeNull();
    });
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
      expect(a.indicators).toHaveLength(18);
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

describe('SA2 level', () => {
  const SA2_IDS = INDICATORS.filter(d => d.levels.includes('sa2')).map(d => d.id);

  /** An SA2-like record: no series, density or peer group (P2-R1), and only SA2 indicators. */
  function sa2(areaId: string, values: Values): ScorableRecord {
    return {
      areaId, name: areaId, region: 'Greater Sydney', population: 5000, peerGroup: null,
      values: Object.fromEntries(SA2_IDS.map(id => [id, { value: values[id] ?? null }])),
    };
  }
  const peers = Array.from({ length: 5 }, (_, i) => sa2(`sa2_${i}`, Object.fromEntries(SA2_IDS.map(id => [id, i]))));

  test('only the SA2 indicators are assessed, and a domain with nothing scored at the level is left out', () => {
    const a = assessRecord(sa2('sa2_target', { car_dependency: 3.5 }), 'nsw', peers, {}, 'sa2');
    expect(a.indicators.map(s => s.id)).toEqual(SA2_IDS);
    expect(a.domains.map(d => d.domain)).toEqual(['transport', 'socio']);
    expect(a.domains.map(d => d.total)).toEqual([4, 6]);
    expect(byId(a, 'car_dependency').percentile).toBe(80);
  });

  test('ranked against NSW SA2s, with no peer group', () => {
    const a = assessRecord(sa2('sa2_target', {}), 'nsw', peers, {}, 'sa2');
    expect(a).toMatchObject({ universe: 'nsw', universeLabel: 'NSW SA2s', universeSize: 5, smallGroup: false, peerGroup: null });
    expect(universeLabelFor('nsw', undefined, 'sa2')).toBe('NSW SA2s');
    expect(() => assessRecord(sa2('sa2_target', {}), 'gsyd', peers, {}, 'sa2')).toThrow();
  });

  test('R58: an SA2 indicator fewer than 5 SA2s have a value for is not ranked', () => {
    const few = peers.map((p, i) => (i < 4 ? p : { ...p, values: { ...p.values, seifa_irsd: { value: null } } }));
    const a = assessRecord(sa2('sa2_target', { seifa_irsd: 900 }), 'nsw', few, {}, 'sa2');
    expect(byId(a, 'seifa_irsd')).toMatchObject({ value: 900, percentile: null, rank: null, ranked: 4, unranked: true });
  });

  test('universeRecords filters any scorable record', () => {
    const mixed: ScorableRecord[] = [sa2('a', {}), { ...sa2('b', {}), region: 'Hunter' }];
    expect(universeRecords(mixed, 'region', { region: 'Hunter', peerGroup: null }).map(r => r.areaId)).toEqual(['b']);
  });
});

describe('LGA behaviour is unchanged by the SA2 generalisation (P2-R1)', () => {
  /**
   * runAssessment, buildNarrative and buildInsights output for four real selections, captured from the code before
   * Phase 2 Task 6. Re-creating the old registry here (frequent_stop_share scored, the two catchment indicators not
   * assessed for LGAs) must reproduce it exactly, so the generalised scoring changes nothing else. Left out of the
   * comparison are the intended changes that the old registry cannot re-create: mismatch insights (their metro
   * predictor is now the frequent-service catchment, P2-R4) and the method note, which names the new context indicator.
   * The SA2 pockets of need never enter it: buildNarrative is called without the SA2 file, so there is no 'pockets'
   * section or SA2 data note.
   *
   * This is a one-off migration guard for P2-R1. If it fails after a data refresh (a rebuilt snapshot) or a wording
   * change, delete this describe block and its fixture (fixtures/needs-pre-catchment.json); do not update the fixture.
   */
  interface Golden {
    selection: { areaIds: string[]; mode: NeedsMode; universe: Universe };
    areas: AreaAssessment[];
    benchmarks: { gsyd: AreaAssessment; nsw: AreaAssessment };
    narrative: { id: string; heading: string; paragraphs: { text: string; citations: string[] }[] }[];
    insights: { id: string; kind: string; severity: number; text: string; citations: string[] }[];
  }
  const GOLDEN = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/needs-pre-catchment.json'), 'utf-8'),
  ) as Golden[];
  const OLD_METHOD_NOTE = 'Aboriginal and Torres Strait Islander share is shown for context and is not scored.';
  const withoutMethodNote = (sections: Golden['narrative']) => sections.map(s => ({
    ...s,
    paragraphs: s.paragraphs.filter(p => !p.text.startsWith('Need scores are the equally weighted mean')),
  }));

  const stopShare = INDICATOR_BY_ID.frequent_stop_share;
  const catchments = [INDICATOR_BY_ID.frequent_service_catchment, INDICATOR_BY_ID.any_service_catchment];
  const saved = { scored: stopShare.scored, levels: catchments.map(def => def.levels) };
  beforeAll(() => {
    stopShare.scored = true;
    for (const def of catchments) def.levels = [];
  });
  afterAll(() => {
    stopShare.scored = saved.scored;
    catchments.forEach((def, i) => { def.levels = saved.levels[i]; });
  });

  test('the fixture covers separate and combined selections in every universe', () => {
    expect(GOLDEN.map(g => `${g.selection.mode}/${g.selection.universe}`))
      .toEqual(['separate/nsw', 'combined/gsyd', 'separate/peer', 'combined/region']);
    expect(GOLDEN.some(g => g.narrative.some(s => s.paragraphs.some(p => p.text.endsWith(OLD_METHOD_NOTE))))).toBe(true);
  });

  test.each(GOLDEN.map(g => [g.selection.areaIds.join(', '), g] as const))('%s', (_, golden) => {
    const a = runAssessment({ snapshot: NEEDS_SNAPSHOT, ...golden.selection });
    expect(a.areas).toEqual(golden.areas);
    expect(a.benchmarks).toEqual(golden.benchmarks);

    const narrative = buildNarrative(a)
      .filter(s => s.id !== 'key_findings' && s.id !== 'insights')
      .map(s => ({ id: s.id, heading: s.heading, paragraphs: s.paragraphs.map(p => ({ text: p.text, citations: p.citations.map(c => c.short) })) }));
    expect(withoutMethodNote(narrative)).toEqual(withoutMethodNote(golden.narrative));

    const insights = buildInsights(a)
      .filter(i => i.kind !== 'mismatch')
      .map(i => ({ id: i.id, kind: i.kind, severity: i.severity, text: i.text, citations: i.citations.map(c => c.short) }));
    expect(insights).toEqual(golden.insights);
  });
});
