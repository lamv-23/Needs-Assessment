import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { GREATER_SYDNEY_GCCSA_AREA_IDS } from '@/lib/data/sample-areas';
import { aggregateRecords, combinedName } from '@/lib/needs/aggregate';
import { runAssessment } from '@/lib/needs/assess';
import { INDICATORS } from '@/lib/needs/indicators';
import { universeRecords } from '@/lib/needs/scoring';
import type {
  AreaAssessment, IndicatorId, IndicatorValue, LgaIndicatorRecord, NeedsAssessment, NeedsMode, Universe,
} from '@/lib/needs/types';

type Values = Partial<Record<IndicatorId, IndicatorValue>>;

function makeValues(values: Values): Record<IndicatorId, IndicatorValue> {
  const out = {} as Record<IndicatorId, IndicatorValue>;
  for (const def of INDICATORS) out[def.id] = values[def.id] ?? { value: null };
  return out;
}

function makeRecord(areaId: string, values: Values, extra: Partial<LgaIndicatorRecord> = {}): LgaIndicatorRecord {
  return {
    areaId, name: areaId, region: 'Hunter', population: 100000, densityPerKm2: 500,
    peerGroup: 'regional_city', values: makeValues(values), ...extra,
  };
}

/** numerator ÷ denominator × scale, with the parts kept (as `extractIndicators` does). */
const ratioOf = (numerator: number, denominator: number, scale = 100): IndicatorValue => (
  { value: (numerator * scale) / denominator, numerator, denominator }
);

const byId = (a: AreaAssessment, id: IndicatorId) => a.indicators.find(i => i.id === id)!;
const snapshotRecord = (id: string) => NEEDS_SNAPSHOT.records.find(r => r.areaId === id)!;

describe('aggregateRecords', () => {
  test('ratio indicators aggregate as Σnum/Σden', () => {
    const a = makeRecord('a', { zero_car_households: ratioOf(10, 100) });
    const b = makeRecord('b', { zero_car_households: ratioOf(90, 300) });
    const agg = aggregateRecords([a, b], 'A + B', 'combined');
    // 100 / 400 = 25, not the mean of the two rates (10 and 30 → 20)
    expect(agg.values.zero_car_households).toEqual({ value: 25, numerator: 100, denominator: 400 });
    expect(agg.approximate).not.toContain('zero_car_households');
    expect(agg.partial).not.toContain('zero_car_households');
  });

  test('weighted indicators use population weights and are flagged approximate', () => {
    const a = makeRecord('a', { seifa_irsd: { value: 900 } }, { population: 100000 });
    const b = makeRecord('b', { seifa_irsd: { value: 1000 } }, { population: 300000 });
    const agg = aggregateRecords([a, b], 'A + B', 'combined');
    expect(agg.values.seifa_irsd).toEqual({ value: 975 });
    expect(agg.approximate).toContain('seifa_irsd');
    expect(agg.partial).not.toContain('seifa_irsd');
  });

  test('only weighted indicators with a member value are approximate', () => {
    const a = makeRecord('a', { car_dependency: { value: 80 }, zero_car_households: ratioOf(1, 10) });
    const agg = aggregateRecords([a, makeRecord('b', {})], 'A + B', 'combined');
    expect(agg.approximate).toEqual(['car_dependency']); // seifa etc. have no value anywhere; ratios are exact
  });

  test('members missing a value are skipped and the indicator is flagged partial', () => {
    const a = makeRecord('a', { zero_car_households: ratioOf(10, 100), seifa_irsd: { value: 900 } }, { population: 100000 });
    const b = makeRecord('b', {}, { population: 300000 });
    const agg = aggregateRecords([a, b], 'A + B', 'combined');
    expect(agg.values.zero_car_households).toEqual({ value: 10, numerator: 10, denominator: 100 });
    expect(agg.values.seifa_irsd).toEqual({ value: 900 }); // B's population does not dilute the mean
    expect(agg.partial).toEqual(expect.arrayContaining(['zero_car_households', 'seifa_irsd']));
    expect(agg.approximate).toContain('seifa_irsd');
  });

  test('a ratio member with a value but no parts cannot be summed, so it counts as missing', () => {
    const a = makeRecord('a', { zero_car_households: ratioOf(10, 100) });
    const b = makeRecord('b', { zero_car_households: { value: 50 } });
    const agg = aggregateRecords([a, b], 'A + B', 'combined');
    expect(agg.values.zero_car_households.value).toBe(10);
    expect(agg.partial).toContain('zero_car_households');
  });

  test('all members missing → null, and neither partial nor approximate', () => {
    const agg = aggregateRecords([makeRecord('a', {}), makeRecord('b', {})], 'A + B', 'combined');
    expect(agg.values.zero_car_households).toEqual({ value: null });
    expect(agg.values.seifa_irsd).toEqual({ value: null });
    expect(agg.partial).toEqual([]);
    expect(agg.approximate).toEqual([]);
  });

  test('every indicator gets a value entry, including unscored context indicators', () => {
    const a = makeRecord('a', { indigenous_share: ratioOf(5, 100) });
    const b = makeRecord('b', { indigenous_share: ratioOf(15, 100) });
    const agg = aggregateRecords([a, b], 'A + B', 'combined');
    expect(Object.keys(agg.values).sort()).toEqual(INDICATORS.map(d => d.id).sort());
    expect(agg.values.indigenous_share).toEqual({ value: 10, numerator: 20, denominator: 200 });
  });

  test('ratio scale is applied once (per 1,000)', () => {
    const a = makeRecord('a', { approvals_per_1000: ratioOf(10, 1000, 1000) });
    const b = makeRecord('b', { approvals_per_1000: ratioOf(30, 3000, 1000) });
    expect(aggregateRecords([a, b], 'x', 'combined').values.approvals_per_1000.value).toBe(10);
  });

  test('identity: name, areaId, population sum and memberIds in order', () => {
    const agg = aggregateRecords([makeRecord('a', {}, { population: 120000 }), makeRecord('b', {}, { population: 80000 })], 'A + B', 'combined');
    expect(agg.areaId).toBe('combined');
    expect(agg.name).toBe('A + B');
    expect(agg.population).toBe(200000);
    expect(agg.memberIds).toEqual(['a', 'b']);
  });

  test('combined density is Σpopulation ÷ Σarea', () => {
    // A 100k @ 1000/km² = 100 km²; B 100k @ 100/km² = 1000 km² → 200k ÷ 1100 km² ≈ 181.8 (not the mean, 550)
    const a = makeRecord('a', {}, { population: 100000, densityPerKm2: 1000 });
    const b = makeRecord('b', {}, { population: 100000, densityPerKm2: 100 });
    const density = aggregateRecords([a, b], 'A + B', 'combined').densityPerKm2;
    expect(density).toBeCloseTo(200000 / 1100, 6);
    expect(density).toBeCloseTo(181.8, 1);
  });

  test('region and peer group are the shared ones, else Multiple regions / null', () => {
    const same = aggregateRecords([makeRecord('a', {}), makeRecord('b', {})], 'x', 'combined');
    expect(same.region).toBe('Hunter');
    expect(same.peerGroup).toBe('regional_city');

    const mixed = aggregateRecords([
      makeRecord('a', {}),
      makeRecord('b', {}, { region: 'Greater Sydney', peerGroup: 'metro_outer' }),
    ], 'x', 'combined');
    expect(mixed.region).toBe('Multiple regions');
    expect(mixed.peerGroup).toBeNull();
  });

  test('the members are not mutated', () => {
    const members = [
      makeRecord('a', { zero_car_households: ratioOf(10, 100), seifa_irsd: { value: 900 } }),
      makeRecord('b', { zero_car_households: ratioOf(90, 300) }),
    ];
    const before = JSON.parse(JSON.stringify(members));
    aggregateRecords(members, 'A + B', 'combined');
    expect(members).toEqual(before);
  });

  test('no members → an all-null record rather than NaN', () => {
    const agg = aggregateRecords([], 'none', 'benchmark');
    expect(agg.population).toBe(0);
    expect(agg.densityPerKm2).toBe(0);
    expect(agg.memberIds).toEqual([]);
    expect(INDICATORS.every(d => agg.values[d.id].value === null)).toBe(true);
  });

  test('a single LGA keeps its published 1 dp value, while an aggregate of it uses Σnum/Σden', () => {
    const sydney = snapshotRecord('lga_sydney');
    expect(sydney.values.frequent_stop_share).toEqual({ value: 47.6, numerator: 531, denominator: 1116 });
    const agg = aggregateRecords([sydney], 'City of Sydney', 'combined');
    expect(agg.values.frequent_stop_share.value).toBeCloseTo((531 * 100) / 1116, 10); // 47.5806…, not 47.6
  });
});

describe('combinedName', () => {
  test('up to three names are joined, more are counted', () => {
    expect(combinedName(['Blacktown', 'Penrith'])).toBe('Blacktown + Penrith');
    expect(combinedName(['A'])).toBe('A');
    expect(combinedName(['A', 'B', 'C'])).toBe('A + B + C');
    expect(combinedName(['A', 'B', 'C', 'D'])).toBe('4 LGAs');
  });
});

describe('runAssessment', () => {
  const run = (areaIds: string[], mode: NeedsMode, universe: Universe): NeedsAssessment =>
    runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds, mode, universe });

  describe('separate mode', () => {
    test('returns one assessment per valid id and reports invalid ids', () => {
      const a = run(['lga_blacktown', 'lga_nowhere', 'lga_penrith'], 'separate', 'nsw');
      expect(a.mode).toBe('separate');
      expect(a.areas.map(x => x.areaId)).toEqual(['lga_blacktown', 'lga_penrith']);
      expect(a.memberIds).toEqual(['lga_blacktown', 'lga_penrith']);
      expect(a.invalidIds).toEqual(['lga_nowhere']);
      expect(a.universe).toBe('nsw');
      expect(a.universeFallback).toBe(false);
      expect(a.generatedAt).toBe(NEEDS_SNAPSHOT.generatedAt);
      expect(a.records).toBe(NEEDS_SNAPSHOT.records);
    });

    test('uses the published single-LGA values', () => {
      const a = run(['lga_sydney'], 'separate', 'nsw');
      expect(byId(a.areas[0], 'frequent_stop_share').value).toBe(47.6);
      expect(byId(a.areas[0], 'frequent_stop_share').approximate).toBe(false);
    });

    test('a repeated id is assessed once', () => {
      const a = run(['lga_blacktown', 'lga_blacktown', 'lga_nowhere', 'lga_nowhere'], 'separate', 'nsw');
      expect(a.areas.map(x => x.areaId)).toEqual(['lga_blacktown']);
      expect(a.memberIds).toEqual(['lga_blacktown']);
      expect(a.invalidIds).toEqual(['lga_nowhere']);
    });

    test('region: each LGA is ranked within its own region', () => {
      const a = run(['lga_blacktown', 'lga_newcastle'], 'separate', 'region');
      const [blacktown, newcastle] = a.areas;
      expect(a.universe).toBe('region');
      expect(a.universeFallback).toBe(false);
      expect(blacktown.universe).toBe('region');
      expect(blacktown.universeSize).toBe(NEEDS_SNAPSHOT.records.filter(r => r.region === 'Greater Sydney').length);
      expect(newcastle.universeSize).toBe(NEEDS_SNAPSHOT.records.filter(r => r.region === 'Hunter').length);
      expect(blacktown.universeLabel).toBe('LGAs in the Greater Sydney region');
      expect(newcastle.universeLabel).toBe('LGAs in the Hunter region');
    });

    test('peer: each LGA is ranked within its own peer group', () => {
      const a = run(['lga_sydney', 'lga_blacktown'], 'separate', 'peer');
      const [sydney, blacktown] = a.areas;
      expect(sydney.universeSize).toBe(NEEDS_SNAPSHOT.records.filter(r => r.peerGroup === 'metro_inner').length);
      expect(blacktown.universeSize).toBe(NEEDS_SNAPSHOT.records.filter(r => r.peerGroup === 'metro_outer').length);
      expect(sydney.peerGroup).toBe('metro_inner');
      expect(blacktown.peerGroup).toBe('metro_outer');
    });

    test('gsyd: ranked against the 34 Greater Sydney LGAs', () => {
      const a = run(['lga_blacktown'], 'separate', 'gsyd');
      expect(a.areas[0].universeSize).toBe(GREATER_SYDNEY_GCCSA_AREA_IDS.length);
    });
  });

  describe('combined mode', () => {
    test('returns one area whose population is the sum', () => {
      const a = run(['lga_blacktown', 'lga_penrith'], 'combined', 'nsw');
      expect(a.mode).toBe('combined');
      expect(a.areas).toHaveLength(1);
      const [area] = a.areas;
      expect(area.areaId).toBe('combined');
      expect(area.name).toBe('Blacktown + Penrith');
      expect(area.population).toBe(snapshotRecord('lga_blacktown').population + snapshotRecord('lga_penrith').population);
      expect(area.region).toBe('Greater Sydney');
      expect(area.peerGroup).toBe('metro_outer');
      expect(a.memberIds).toEqual(['lga_blacktown', 'lga_penrith']);
    });

    test('is ranked against the individual LGAs, which do not include the combined area', () => {
      const a = run(['lga_blacktown', 'lga_penrith'], 'combined', 'nsw');
      expect(a.areas[0].universeSize).toBe(NEEDS_SNAPSHOT.records.length);
      const dependency = byId(a.areas[0], 'car_dependency');
      expect(dependency.percentile).not.toBeNull();
      expect(dependency.approximate).toBe(true); // weighted mean
      expect(byId(a.areas[0], 'zero_car_households').approximate).toBe(false);
    });

    test('values are Σnum/Σden for ratios and population-weighted for the rest', () => {
      const a = run(['lga_blacktown', 'lga_penrith'], 'combined', 'nsw');
      const b = snapshotRecord('lga_blacktown');
      const p = snapshotRecord('lga_penrith');
      const zc = (r: LgaIndicatorRecord) => r.values.zero_car_households;
      expect(byId(a.areas[0], 'zero_car_households').value)
        .toBeCloseTo(((zc(b).numerator! + zc(p).numerator!) * 100) / (zc(b).denominator! + zc(p).denominator!), 8);
      const cd = (r: LgaIndicatorRecord) => r.values.car_dependency.value!;
      expect(byId(a.areas[0], 'car_dependency').value)
        .toBeCloseTo((cd(b) * b.population + cd(p) * p.population) / (b.population + p.population), 8);
    });

    test('a single selected LGA is still one combined area', () => {
      const a = run(['lga_sydney', 'lga_nowhere'], 'combined', 'nsw');
      expect(a.areas.map(x => [x.areaId, x.name])).toEqual([['combined', 'City of Sydney']]);
      expect(a.invalidIds).toEqual(['lga_nowhere']);
    });

    test('region: members sharing a region use it', () => {
      const a = run(['lga_blacktown', 'lga_penrith'], 'combined', 'region');
      expect(a.universe).toBe('region');
      expect(a.universeFallback).toBe(false);
      expect(a.areas[0].universeLabel).toBe('LGAs in the Greater Sydney region');
      expect(a.areas[0].universeSize).toBe(NEEDS_SNAPSHOT.records.filter(r => r.region === 'Greater Sydney').length);
    });

    test('combined + region across two regions falls back to NSW', () => {
      const a = run(['lga_blacktown', 'lga_newcastle'], 'combined', 'region');
      expect(a.universe).toBe('nsw');
      expect(a.universeFallback).toBe(true);
      expect(a.areas[0].region).toBe('Multiple regions');
      expect(a.areas[0].universe).toBe('nsw');
      expect(a.areas[0].universeLabel).toBe('NSW LGAs');
    });

    test('peer: members sharing a peer group use it', () => {
      const a = run(['lga_blacktown', 'lga_penrith'], 'combined', 'peer');
      expect(a.universe).toBe('peer');
      expect(a.universeFallback).toBe(false);
      expect(a.areas[0].universeSize).toBe(NEEDS_SNAPSHOT.records.filter(r => r.peerGroup === 'metro_outer').length);
    });

    test('combined + peer across two peer groups falls back to NSW without throwing', () => {
      // Sydney is metro_inner, Blacktown metro_outer
      const a = run(['lga_sydney', 'lga_blacktown'], 'combined', 'peer');
      expect(a.universe).toBe('nsw');
      expect(a.universeFallback).toBe(true);
      expect(a.areas[0].peerGroup).toBeNull();
      expect(a.areas[0].universe).toBe('nsw');
      expect(a.areas[0].universeSize).toBe(NEEDS_SNAPSHOT.records.length);
    });

    test('requestedUniverse keeps the universe asked for, whether or not it fell back', () => {
      const region = run(['lga_blacktown', 'lga_newcastle'], 'combined', 'region');
      expect([region.requestedUniverse, region.universe, region.universeFallback]).toEqual(['region', 'nsw', true]);
      const peer = run(['lga_sydney', 'lga_blacktown'], 'combined', 'peer');
      expect([peer.requestedUniverse, peer.universe, peer.universeFallback]).toEqual(['peer', 'nsw', true]);
      const kept = run(['lga_blacktown', 'lga_penrith'], 'combined', 'peer');
      expect([kept.requestedUniverse, kept.universe, kept.universeFallback]).toEqual(['peer', 'peer', false]);
      for (const universe of ['nsw', 'gsyd', 'region', 'peer'] as const) {
        expect(run([], 'combined', universe).requestedUniverse).toBe(universe);
        expect(run(['lga_blacktown'], 'separate', universe).requestedUniverse).toBe(universe);
      }
    });

    test('nsw and gsyd never fall back', () => {
      const nsw = run(['lga_sydney', 'lga_newcastle'], 'combined', 'nsw');
      expect([nsw.universe, nsw.universeFallback]).toEqual(['nsw', false]);
      const gsyd = run(['lga_sydney', 'lga_blacktown'], 'combined', 'gsyd');
      expect([gsyd.universe, gsyd.universeFallback]).toEqual(['gsyd', false]);
      expect(gsyd.areas[0].universeSize).toBe(GREATER_SYDNEY_GCCSA_AREA_IDS.length);
    });
  });

  describe('benchmarks', () => {
    test('Greater Sydney aggregates the 34 GCCSA LGAs', () => {
      const a = run(['lga_blacktown'], 'separate', 'nsw');
      const gsyd = a.benchmarkRecords.gsyd;
      const members = universeRecords(NEEDS_SNAPSHOT.records, 'gsyd');
      expect(members).toHaveLength(34);
      expect([...gsyd.memberIds].sort()).toEqual([...GREATER_SYDNEY_GCCSA_AREA_IDS].sort());
      expect(gsyd.population).toBe(members.reduce((sum, r) => sum + r.population, 0));
      expect(gsyd.peerGroup).toBeNull();
      expect(gsyd.name).toBe('Greater Sydney');

      // Σ/Σ over the 34 LGAs
      const zero = members.map(r => r.values.zero_car_households);
      const num = zero.reduce((s, v) => s + (v.numerator ?? 0), 0);
      const den = zero.reduce((s, v) => s + (v.denominator ?? 0), 0);
      expect(gsyd.values.zero_car_households.value).toBeCloseTo((num * 100) / den, 8);
      expect(a.benchmarks.gsyd.name).toBe('Greater Sydney');
      expect(a.benchmarks.gsyd.population).toBe(gsyd.population);
    });

    test('NSW aggregates every LGA in the snapshot', () => {
      const a = run(['lga_blacktown'], 'separate', 'nsw');
      expect(a.benchmarkRecords.nsw.memberIds).toEqual(NEEDS_SNAPSHOT.records.map(r => r.areaId));
      expect(a.benchmarkRecords.nsw.population).toBe(NEEDS_SNAPSHOT.records.reduce((s, r) => s + r.population, 0));
      expect(a.benchmarkRecords.nsw.peerGroup).toBeNull();
      expect(a.benchmarkRecords.nsw.region).toBe('Multiple regions');
      expect(a.benchmarkRecords.nsw.approximate).toContain('car_dependency');
      expect(byId(a.benchmarks.nsw, 'car_dependency').approximate).toBe(true);
    });

    test('are assessed against the requested universe: nsw and gsyd', () => {
      const nsw = run(['lga_blacktown'], 'separate', 'nsw');
      expect(nsw.benchmarks.gsyd.universe).toBe('nsw');
      expect(nsw.benchmarks.nsw.universeSize).toBe(NEEDS_SNAPSHOT.records.length);

      const gsyd = run(['lga_blacktown'], 'separate', 'gsyd');
      expect(gsyd.benchmarks.gsyd.universe).toBe('gsyd');
      expect(gsyd.benchmarks.nsw.universe).toBe('gsyd');
      expect(gsyd.benchmarks.nsw.universeSize).toBe(GREATER_SYDNEY_GCCSA_AREA_IDS.length);
    });

    test.each<[Universe, NeedsMode, string[]]>([
      ['region', 'separate', ['lga_blacktown', 'lga_newcastle']],
      ['peer', 'separate', ['lga_sydney', 'lga_blacktown']],
      ['region', 'combined', ['lga_blacktown', 'lga_newcastle']],
      ['peer', 'combined', ['lga_sydney', 'lga_blacktown']],
      ['region', 'combined', []],
      ['peer', 'separate', []],
    ])('under universe %s (%s, %j) are assessed against NSW without throwing', (universe, mode, ids) => {
      const a = run(ids, mode, universe);
      expect(a.benchmarks.gsyd.universe).toBe('nsw');
      expect(a.benchmarks.nsw.universe).toBe('nsw');
      expect(a.benchmarks.gsyd.universeSize).toBe(NEEDS_SNAPSHOT.records.length);
      expect(a.benchmarks.nsw.overall).not.toBeNull();
    });
  });

  describe('edge cases and purity', () => {
    test('empty areaIds → areas []', () => {
      for (const mode of ['separate', 'combined'] as const) {
        for (const universe of ['nsw', 'gsyd', 'region', 'peer'] as const) {
          const a = run([], mode, universe);
          expect(a.areas).toEqual([]);
          expect(a.memberIds).toEqual([]);
          expect(a.invalidIds).toEqual([]);
          expect(a.universe).toBe(universe);
          expect(a.universeFallback).toBe(false);
          expect(a.benchmarks.nsw.population).toBeGreaterThan(0);
        }
      }
    });

    test('only invalid ids → areas [] and the ids reported', () => {
      for (const mode of ['separate', 'combined'] as const) {
        const a = run(['lga_nowhere', 'lga_elsewhere'], mode, 'peer');
        expect(a.areas).toEqual([]);
        expect(a.invalidIds).toEqual(['lga_nowhere', 'lga_elsewhere']);
      }
    });

    test('the snapshot is not mutated', () => {
      const before = JSON.parse(JSON.stringify(NEEDS_SNAPSHOT));
      for (const mode of ['separate', 'combined'] as const) {
        for (const universe of ['nsw', 'gsyd', 'region', 'peer'] as const) {
          run(['lga_sydney', 'lga_blacktown', 'lga_newcastle', 'lga_nowhere'], mode, universe);
        }
      }
      expect(NEEDS_SNAPSHOT).toEqual(before);
    });

    test('a snapshot without Greater Sydney LGAs gives an all-null Greater Sydney benchmark, not a crash', () => {
      const records = Array.from({ length: 6 }, (_, i) =>
        makeRecord(`lga_x${i}`, { zero_car_households: ratioOf(i + 1, 100) }));
      const a = runAssessment({
        snapshot: { generatedAt: 'now', records }, areaIds: ['lga_x0'], mode: 'separate', universe: 'gsyd',
      });
      expect(a.benchmarkRecords.gsyd.memberIds).toEqual([]);
      expect(a.benchmarks.gsyd.overall).toBeNull();
      expect(a.benchmarks.gsyd.universeSize).toBe(0);
    });
  });
});
