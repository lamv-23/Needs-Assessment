import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { GREATER_SYDNEY_GCCSA_AREA_IDS } from '@/lib/data/sample-areas';
import { runAssessment } from '@/lib/needs/assess';
import { INDICATOR_BY_ID, INDICATORS } from '@/lib/needs/indicators';
import { buildInsights } from '@/lib/needs/insights';
import { sourceNumber } from '@/lib/needs/page-data';
import {
  MAX_RADAR_AREAS, QUADRANT_SCATTERS, RADAR_AXES, inNeedQuadrant, quadrantData, quadrantInsights, radarData, radarGaps,
  typicalLabel, type QuadrantSpec,
} from '@/lib/needs/project-need';
import { universeRecords } from '@/lib/needs/scoring';
import type {
  IndicatorId, IndicatorValue, InsightSeries, LgaIndicatorRecord, NeedsAssessment, NeedsMode, Universe,
} from '@/lib/needs/types';
import { EMPTY_SERIES } from './fixtures/needs';

type Values = Partial<Record<IndicatorId, IndicatorValue>>;

function makeRecord(
  areaId: string,
  { values = {}, series = {}, ...extra }:
    { values?: Values; series?: Partial<InsightSeries> } & Omit<Partial<LgaIndicatorRecord>, 'values' | 'series'> = {},
): LgaIndicatorRecord {
  const all = {} as Record<IndicatorId, IndicatorValue>;
  for (const def of INDICATORS) all[def.id] = values[def.id] ?? { value: null };
  return {
    areaId, name: areaId, region: 'Hunter', population: 100000, densityPerKm2: 500, peerGroup: 'regional_city',
    values: all, series: { ...EMPTY_SERIES, ...series }, ...extra,
  };
}

const GENERATED_AT = '2026-10-23T00:00:00.000Z';

function assess(
  areaIds: string[],
  mode: NeedsMode = 'separate',
  universe: Universe = 'nsw',
  records: LgaIndicatorRecord[] = NEEDS_SNAPSHOT.records,
): NeedsAssessment {
  return runAssessment({ snapshot: { generatedAt: GENERATED_AT, records }, areaIds, mode, universe });
}

const GROWTH_SERVICE = QUADRANT_SCATTERS.find(s => s.id === 'growth-service')!;
const DISADVANTAGE_SERVICE = QUADRANT_SCATTERS.find(s => s.id === 'disadvantage-service')!;

const valueOf = (r: LgaIndicatorRecord, id: IndicatorId): number | null => r.values[id]?.value ?? null;

/** An independent median: the middle value, or the mean of the two middle ones. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = (sorted.length - 1) / 2;
  return (sorted[Math.floor(mid)] + sorted[Math.ceil(mid)]) / 2;
}

/**
 * Five LGAs of one group. Growth sorts 10, 20, 24.8, 30, 40.9 (median 24.8) and departures 10, 32.5, 35.0, 40, 50
 * (median 35.0); SEIFA sorts 900, 980, 1000, 1050, 1100 (median 1000). 'blacktown' is high growth, high
 * disadvantage and low service; 'high' has the most growth and the best service.
 */
function fiveRecords(): LgaIndicatorRecord[] {
  const row = (areaId: string, name: string, growth: number | null, departures: number | null, seifa: number | null) =>
    makeRecord(areaId, {
      name,
      values: {
        pop_growth_2041: { value: growth },
        am_peak_departures_per_1000: { value: departures },
        seifa_irsd: { value: seifa },
      },
    });
  return [
    row('lga_blacktown', 'Blacktown', 40.9, 32.5, 900),
    row('lga_b', 'Bee', 24.8, 40, 1000),
    row('lga_c', 'Sea', 10, 35.0, 1100),
    row('lga_d', 'Dee', 20, 10, 980),
    row('lga_e', 'Eee', 30, 50, 1050),
  ];
}

describe('RADAR_AXES', () => {
  test('are the spec five, in order, with the spec labels', () => {
    expect(RADAR_AXES.map(a => a.id)).toEqual([
      'car_dependency', 'frequent_stop_share', 'zero_car_households', 'seifa_irsd', 'pop_growth_2041',
    ]);
    expect(RADAR_AXES.map(a => a.label)).toEqual([
      'Car dependency', 'Public transport service gap', 'Households without a car', 'Socio-economic disadvantage',
      'Population growth to 2041',
    ]);
  });
});

describe('radarData', () => {
  const a = assess(['lga_blacktown', 'lga_penrith']);
  const r = radarData(a);

  test('one row per axis, with the area need percentiles and a typical value of 50', () => {
    expect(r.rows.map(row => row.axis)).toEqual(RADAR_AXES.map(axis => axis.label));
    for (const row of r.rows) expect(row.typical).toBe(50);
    expect(r.series.map(s => s.name)).toEqual(['Blacktown', 'Penrith', 'Greater Sydney']);
    expect(r.series.map(s => s.isBenchmark)).toEqual([false, false, true]);
    expect(r.hiddenAreas).toBe(0);

    RADAR_AXES.forEach((axis, i) => {
      a.areas.forEach((area, k) => {
        const percentile = area.indicators.find(s => s.id === axis.id)!.percentile;
        expect(percentile).not.toBeNull();
        // the unrounded percentile, not a rounded or displayed one
        expect(r.rows[i][r.series[k].key]).toBe(percentile);
      });
      expect(r.rows[i][r.series[2].key]).toBe(a.benchmarks.gsyd.indicators.find(s => s.id === axis.id)!.percentile);
    });
  });

  test('series keys are unique and none is a reserved row key', () => {
    const keys = r.series.map(s => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain('axis');
    expect(keys).not.toContain('typical');
  });

  test('frequent_stop_share is a need percentile: a low share ranks high', () => {
    const lowest = NEEDS_SNAPSHOT.records
      .filter(rec => valueOf(rec, 'frequent_stop_share') === 0)
      .map(rec => rec.areaId)
      .filter(id => !GREATER_SYDNEY_GCCSA_AREA_IDS.includes(id))[0];
    const row = radarData(assess([lowest])).rows.find(x => x.axis === 'Public transport service gap')!;
    expect(row.a0 as number).toBeGreaterThan(50);
  });

  test('a null percentile stays null: a gap, never 0', () => {
    const records = [...fiveRecords(), makeRecord('lga_nogrowth', { name: 'No Growth' })];
    const gap = radarData(assess(['lga_nogrowth'], 'separate', 'nsw', records));
    const growthRow = gap.rows.find(x => x.axis === 'Population growth to 2041')!;
    expect(growthRow.a0).toBeNull();
    for (const row of gap.rows) expect(row.a0).toBeNull();
  });

  test('Greater Sydney is drawn only when the universe is nsw or gsyd', () => {
    const names = (universe: Universe) => radarData(assess(['lga_blacktown', 'lga_penrith'], 'separate', universe))
      .series.map(s => s.name);
    expect(names('nsw')).toContain('Greater Sydney');
    expect(names('gsyd')).toContain('Greater Sydney');
    expect(names('region')).not.toContain('Greater Sydney');
    expect(names('peer')).not.toContain('Greater Sydney');
  });

  test('the universe actually used decides: a combined area that fell back to NSW keeps Greater Sydney', () => {
    // Blacktown (Greater Sydney) and Newcastle (Hunter) span two regions, so 'region' falls back to NSW.
    const combined = assess(['lga_blacktown', 'lga_newcastle'], 'combined', 'region');
    expect(combined.universeFallback).toBe(true);
    expect(radarData(combined).series.map(s => s.name)).toContain('Greater Sydney');
    // ... and one that stays in its region does not
    const sameRegion = assess(['lga_blacktown', 'lga_penrith'], 'combined', 'region');
    expect(sameRegion.universeFallback).toBe(false);
    expect(radarData(sameRegion).series.map(s => s.name)).not.toContain('Greater Sydney');
  });

  test('draws at most 6 areas and reports how many are hidden', () => {
    const nine = assess(NEEDS_SNAPSHOT.records.slice(0, 9).map(rec => rec.areaId));
    const nineData = radarData(nine);
    expect(MAX_RADAR_AREAS).toBe(6);
    expect(nineData.series.filter(s => !s.isBenchmark).map(s => s.name)).toEqual(nine.areas.slice(0, 6).map(x => x.name));
    expect(nineData.hiddenAreas).toBe(3);
    for (const row of nineData.rows) expect(Object.keys(row).filter(k => /^a\d+$/.test(k))).toHaveLength(6);
  });

  test('a combined selection is one series', () => {
    const combined = radarData(assess(['lga_blacktown', 'lga_penrith'], 'combined'));
    expect(combined.series.filter(s => !s.isBenchmark)).toHaveLength(1);
    expect(combined.series[0].name).toBe('Blacktown + Penrith');
  });
});

describe('radarGaps', () => {
  test('lists the area and axis of every null percentile', () => {
    const records = [...fiveRecords(), makeRecord('lga_nogrowth', { name: 'No Growth' })];
    const data = radarData(assess(['lga_blacktown', 'lga_nogrowth'], 'separate', 'nsw', records));
    const gaps = radarGaps(data);
    expect(gaps.find(g => g.name === 'No Growth')!.axes).toEqual(RADAR_AXES.map(axis => axis.label));
    // Blacktown has growth, service departures and SEIFA in the fixture but no car or frequent-stop data
    expect(gaps.find(g => g.name === 'Blacktown')!.axes).toEqual([
      'Car dependency', 'Public transport service gap', 'Households without a car',
    ]);
  });

  test('is empty when nothing is missing', () => {
    expect(radarGaps(radarData(assess(['lga_blacktown'])))).toEqual([]);
  });
});

describe('typicalLabel', () => {
  test('names the comparison group', () => {
    expect(typicalLabel(assess(['lga_blacktown']))).toBe('Typical LGA (NSW LGAs)');
    expect(typicalLabel(assess(['lga_blacktown'], 'separate', 'peer'))).toBe('Typical LGA (outer metropolitan LGAs)');
  });

  test('lists each distinct comparison group once when the areas are in different ones', () => {
    const label = typicalLabel(assess(['lga_blacktown', 'lga_penrith', 'lga_newcastle'], 'separate', 'region'));
    expect(label).toBe('Typical LGA (LGAs in the Greater Sydney region, LGAs in the Hunter region)');
  });
});

describe('QUADRANT_SCATTERS', () => {
  test('are the two spec charts', () => {
    expect(QUADRANT_SCATTERS.map(s => [s.id, s.x, s.y, s.quadrantLabel])).toEqual([
      ['growth-service', 'pop_growth_2041', 'am_peak_departures_per_1000', 'High growth, low service'],
      ['disadvantage-service', 'seifa_irsd', 'am_peak_departures_per_1000', 'High disadvantage, low service'],
    ]);
    expect(QUADRANT_SCATTERS.map(s => s.title)).toEqual([
      'Population growth vs public transport service',
      'Socio-economic disadvantage vs public transport service',
    ]);
  });
});

describe('quadrantData: the comparison group', () => {
  const both = (spec: QuadrantSpec) => (r: LgaIndicatorRecord) => valueOf(r, spec.x) !== null && valueOf(r, spec.y) !== null;
  const selectedIds = ['lga_blacktown', 'lga_penrith'];

  test('nsw: every NSW LGA with both values, less the selected areas', () => {
    const d = quadrantData(assess(selectedIds), GROWTH_SERVICE);
    const expected = NEEDS_SNAPSHOT.records.filter(both(GROWTH_SERVICE)).map(r => r.areaId)
      .filter(id => !selectedIds.includes(id));
    expect(d.points.map(p => p.areaId)).toEqual(expected);
    // 128 LGAs, five of them without a 2041 projection
    expect(NEEDS_SNAPSHOT.records).toHaveLength(128);
    expect(d.points).toHaveLength(128 - 5 - 2);
    expect(d.selected.map(s => s.areaId)).toEqual(selectedIds);
  });

  test('gsyd: the 34 Greater Sydney LGAs', () => {
    const d = quadrantData(assess(selectedIds, 'separate', 'gsyd'), GROWTH_SERVICE);
    expect(d.points).toHaveLength(34 - 2);
    for (const p of d.points) expect(GREATER_SYDNEY_GCCSA_AREA_IDS).toContain(p.areaId);
  });

  test('peer: the selected areas\' peer group', () => {
    const a = assess(selectedIds, 'separate', 'peer');
    const group = universeRecords(a.records, 'peer', a.areas[0]);
    const d = quadrantData(a, DISADVANTAGE_SERVICE);
    expect(d.points.map(p => p.areaId)).toEqual(group.map(r => r.areaId).filter(id => !selectedIds.includes(id)));
    expect(group.length).toBeLessThan(34);
  });

  test('areas in different peer groups are compared with both groups', () => {
    const a = assess(['lga_blacktown', 'lga_newcastle'], 'separate', 'peer');
    const [first, second] = a.areas.map(area => universeRecords(a.records, 'peer', area));
    expect(first[0].peerGroup).not.toBe(second[0].peerGroup);
    const d = quadrantData(a, DISADVANTAGE_SERVICE);
    expect(d.points).toHaveLength(first.length + second.length - 2);
  });

  test('an LGA missing either value is not a point', () => {
    const d = quadrantData(assess(['lga_blacktown']), GROWTH_SERVICE);
    const noGrowth = NEEDS_SNAPSHOT.records.filter(r => valueOf(r, 'pop_growth_2041') === null);
    expect(noGrowth.length).toBeGreaterThan(0);
    for (const r of noGrowth) expect(d.points.map(p => p.areaId)).not.toContain(r.areaId);
  });

  test('combined mode plots one combined point in place of its member LGAs', () => {
    const a = assess(selectedIds, 'combined');
    const d = quadrantData(a, GROWTH_SERVICE);
    expect(d.selected).toHaveLength(1);
    expect(d.selected[0]).toMatchObject({ areaId: 'combined', name: 'Blacktown + Penrith' });
    expect(d.selected[0].x).toBe(a.areas[0].indicators.find(s => s.id === 'pop_growth_2041')!.value);
    expect(d.selected[0].y).toBe(a.areas[0].indicators.find(s => s.id === 'am_peak_departures_per_1000')!.value);
    // the members are the combined point, not also grey points; both have values, so 123 - 2
    expect(d.points).toHaveLength(128 - 5 - 2);
    expect(d.points.map(p => p.areaId)).not.toContain('lga_blacktown');
    // ... but they are in the group, so they count towards its medians
    const group = NEEDS_SNAPSHOT.records.filter(r => valueOf(r, 'pop_growth_2041') !== null);
    expect(d.medians.x).toBeCloseTo(median(group.map(r => valueOf(r, 'pop_growth_2041')!)), 10);
  });

  test('no areas: nothing to plot', () => {
    const d = quadrantData(assess([]), GROWTH_SERVICE);
    expect(d.points).toEqual([]);
    expect(d.selected).toEqual([]);
  });
});

describe('quadrantData: medians, axes and Greater Sydney', () => {
  test('medians are the comparison group medians', () => {
    for (const universe of ['nsw', 'gsyd', 'peer'] as const) {
      const a = assess(['lga_blacktown', 'lga_penrith'], 'separate', universe);
      const group = universeRecords(a.records, universe, a.areas[0])
        .filter(r => valueOf(r, 'pop_growth_2041') !== null && valueOf(r, 'am_peak_departures_per_1000') !== null);
      const d = quadrantData(a, GROWTH_SERVICE);
      expect(d.medians.x).toBeCloseTo(median(group.map(r => valueOf(r, 'pop_growth_2041')!)), 10);
      expect(d.medians.y).toBeCloseTo(median(group.map(r => valueOf(r, 'am_peak_departures_per_1000')!)), 10);
    }
  });

  test('the median counts the selected areas, which belong to the group', () => {
    const a = assess(['lga_blacktown'], 'separate', 'nsw', fiveRecords());
    const d = quadrantData(a, GROWTH_SERVICE);
    expect(d.medians).toEqual({ x: 24.8, y: 35 });
    expect(d.points).toHaveLength(4);
  });

  test('the disadvantage-service x axis is reversed, the growth-service one is not; y is never reversed', () => {
    const a = assess(['lga_blacktown']);
    expect(quadrantData(a, GROWTH_SERVICE).xReversed).toBe(false);
    expect(quadrantData(a, DISADVANTAGE_SERVICE).xReversed).toBe(true);
    expect(quadrantData(a, DISADVANTAGE_SERVICE).yReversed).toBe(false);
  });

  test('Greater Sydney is the benchmark value when it has both, else null', () => {
    const a = assess(['lga_blacktown']);
    const gs = a.benchmarks.gsyd.indicators;
    expect(quadrantData(a, GROWTH_SERVICE).greaterSydney).toEqual({
      x: gs.find(s => s.id === 'pop_growth_2041')!.value,
      y: gs.find(s => s.id === 'am_peak_departures_per_1000')!.value,
    });
    const none = assess(['lga_blacktown'], 'separate', 'nsw', fiveRecords());
    expect(quadrantData(none, GROWTH_SERVICE).greaterSydney).toBeNull();
  });
});

describe('inNeedQuadrant', () => {
  const medians = { x: 24.8, y: 35 };

  test('growth-service: growth above the median AND departures below it', () => {
    expect(inNeedQuadrant(GROWTH_SERVICE, 40.9, 32.5, medians)).toBe(true);
    expect(inNeedQuadrant(GROWTH_SERVICE, 10, 32.5, medians)).toBe(false);
    expect(inNeedQuadrant(GROWTH_SERVICE, 40.9, 50, medians)).toBe(false);
    expect(inNeedQuadrant(GROWTH_SERVICE, 10, 50, medians)).toBe(false);
  });

  test('disadvantage-service: IRSD below the median AND departures below it', () => {
    const m = { x: 1000, y: 35 };
    expect(inNeedQuadrant(DISADVANTAGE_SERVICE, 900, 32.5, m)).toBe(true);
    expect(inNeedQuadrant(DISADVANTAGE_SERVICE, 1100, 32.5, m)).toBe(false);
    expect(inNeedQuadrant(DISADVANTAGE_SERVICE, 900, 50, m)).toBe(false);
    expect(inNeedQuadrant(DISADVANTAGE_SERVICE, 1100, 50, m)).toBe(false);
  });

  test('a value on the median is not past it', () => {
    expect(inNeedQuadrant(GROWTH_SERVICE, 24.8, 32.5, medians)).toBe(false);
    expect(inNeedQuadrant(GROWTH_SERVICE, 40.9, 35, medians)).toBe(false);
  });

  test('without medians (an empty group) nothing is in the quadrant', () => {
    expect(inNeedQuadrant(GROWTH_SERVICE, 40.9, 32.5, { x: NaN, y: NaN })).toBe(false);
  });
});

describe('quadrantData: selected areas', () => {
  test('flags the selected areas in the need quadrant', () => {
    const d = quadrantData(assess(['lga_blacktown'], 'separate', 'nsw', fiveRecords()), GROWTH_SERVICE);
    expect(d.selected).toEqual([{ areaId: 'lga_blacktown', name: 'Blacktown', x: 40.9, y: 32.5, inNeedQuadrant: true }]);
    const outside = quadrantData(assess(['lga_c'], 'separate', 'nsw', fiveRecords()), GROWTH_SERVICE);
    expect(outside.selected).toEqual([{ areaId: 'lga_c', name: 'Sea', x: 10, y: 35, inNeedQuadrant: false }]);
  });

  test('a selected area with a null x or y is listed with its nulls and is never in the quadrant', () => {
    const records = [
      ...fiveRecords(),
      makeRecord('lga_nogrowth', { name: 'No Growth', values: { am_peak_departures_per_1000: { value: 1 } } }),
      makeRecord('lga_nodep', { name: 'No Departures', values: { pop_growth_2041: { value: 90 } } }),
    ];
    const d = quadrantData(assess(['lga_nogrowth', 'lga_nodep', 'lga_blacktown'], 'separate', 'nsw', records), GROWTH_SERVICE);
    expect(d.selected).toEqual([
      { areaId: 'lga_nogrowth', name: 'No Growth', x: null, y: 1, inNeedQuadrant: false },
      { areaId: 'lga_nodep', name: 'No Departures', x: 90, y: null, inNeedQuadrant: false },
      { areaId: 'lga_blacktown', name: 'Blacktown', x: 40.9, y: 32.5, inNeedQuadrant: true },
    ]);
    // neither is a grey point either
    expect(d.points.map(p => p.areaId)).toEqual(['lga_b', 'lga_c', 'lga_d', 'lga_e']);
  });

  test('every selected area is in the order of the selection', () => {
    const d = quadrantData(assess(['lga_penrith', 'lga_blacktown']), GROWTH_SERVICE);
    expect(d.selected.map(s => s.areaId)).toEqual(['lga_penrith', 'lga_blacktown']);
  });
});

describe('quadrantInsights', () => {
  const a = assess(['lga_blacktown'], 'separate', 'nsw', fiveRecords());

  test('growth-service text, exact', () => {
    const insight = quadrantInsights(a).find(i => i.id === 'quadrant:lga_blacktown:growth-service')!;
    expect(insight.text).toBe(
      'Blacktown is in the high-growth, low-service group: population growth to 2041 of 40.9% (median 24.8%) and '
      + '32.5 AM-peak departures per 1,000 residents (median 35.0) among NSW LGAs.',
    );
  });

  test('disadvantage-service text, exact', () => {
    const insight = quadrantInsights(a).find(i => i.id === 'quadrant:lga_blacktown:disadvantage-service')!;
    expect(insight.text).toBe(
      'Blacktown is in the high-disadvantage, low-service group: a SEIFA IRSD score of 900 (median 1000) and '
      + '32.5 AM-peak departures per 1,000 residents (median 35.0) among NSW LGAs.',
    );
  });

  test('carries both indicators\' citations and a severity of the mean need percentile over 100', () => {
    const growth = quadrantInsights(a).find(i => i.id === 'quadrant:lga_blacktown:growth-service')!;
    expect(growth.kind).toBe('quadrant');
    expect(growth.areaId).toBe('lga_blacktown');
    expect(growth.citations).toEqual([INDICATOR_BY_ID.pop_growth_2041.source, INDICATOR_BY_ID.am_peak_departures_per_1000.source]);
    const area = a.areas[0];
    const p = (id: IndicatorId) => area.indicators.find(s => s.id === id)!.percentile!;
    expect(growth.severity).toBeCloseTo((p('pop_growth_2041') + p('am_peak_departures_per_1000')) / 2 / 100, 12);
    // growth 40.9 is the highest of five (percentile 90); 32.5 departures has three better-served LGAs (70)
    expect(growth.severity).toBeCloseTo(0.8, 12);

    const disadvantage = quadrantInsights(a).find(i => i.id === 'quadrant:lga_blacktown:disadvantage-service')!;
    expect(disadvantage.citations).toEqual([INDICATOR_BY_ID.seifa_irsd.source, INDICATOR_BY_ID.am_peak_departures_per_1000.source]);
    // IRSD 900 is the lowest of five (percentile 90)
    expect(disadvantage.severity).toBeCloseTo(0.8, 12);
  });

  test('an area outside the need quadrant has no insight', () => {
    const outside = assess(['lga_e'], 'separate', 'nsw', fiveRecords());
    expect(quadrantInsights(outside)).toEqual([]);
  });

  test('an area with a missing value has no insight', () => {
    const records = [...fiveRecords(), makeRecord('lga_nogrowth', { name: 'No Growth', values: { am_peak_departures_per_1000: { value: 1 } } })];
    expect(quadrantInsights(assess(['lga_nogrowth'], 'separate', 'nsw', records))).toEqual([]);
  });

  test('a combined area is "The combined area"', () => {
    const member = (id: string, growth: number, departures: number, population: number) => makeRecord(id, {
      name: id,
      population,
      values: {
        pop_growth_2041: { value: growth, numerator: growth, denominator: 100 },
        am_peak_departures_per_1000: { value: (departures * 1000) / population, numerator: departures, denominator: population },
      },
    });
    const filler = [5, 10, 15, 20, 25].map((growth, i) => makeRecord(`lga_f${i}`, {
      values: {
        pop_growth_2041: { value: growth, numerator: growth, denominator: 100 },
        am_peak_departures_per_1000: { value: 60 + i * 10, numerator: 60 + i * 10, denominator: 1000 },
      },
    }));
    const records = [member('lga_m1', 50, 30, 1000), member('lga_m2', 40, 36, 1000), ...filler];
    const combined = assess(['lga_m1', 'lga_m2'], 'combined', 'nsw', records);
    const growth = quadrantInsights(combined).find(i => i.kind === 'quadrant' && i.id.endsWith('growth-service'))!;
    expect(growth.areaId).toBe('combined');
    expect(growth.text).toBe(
      'The combined area is in the high-growth, low-service group: population growth to 2041 of 45.0% (median 20.0%) '
      + 'and 33.0 AM-peak departures per 1,000 residents (median 70.0) among NSW LGAs.',
    );
  });

  test('uses each area\'s own comparison group', () => {
    const outer = assess(['lga_blacktown', 'lga_penrith'], 'separate', 'peer');
    for (const insight of quadrantInsights(outer)) {
      expect(insight.text.endsWith('among outer metropolitan LGAs.')).toBe(true);
    }
  });

  test('every citation is a numbered source of the page', () => {
    for (const universe of ['nsw', 'gsyd', 'region', 'peer'] as const) {
      for (const mode of ['separate', 'combined'] as const) {
        const all = assess(NEEDS_SNAPSHOT.records.slice(0, 40).map(r => r.areaId), mode, universe);
        for (const insight of quadrantInsights(all)) {
          expect(insight.citations.length).toBeGreaterThanOrEqual(2);
          for (const citation of insight.citations) expect(sourceNumber(citation)).toBeGreaterThan(0);
        }
      }
    }
    // the sample must reach the code it is meant to check
    const blacktown = quadrantInsights(assess(['lga_blacktown', 'lga_penrith'], 'separate', 'gsyd'));
    expect(blacktown.length).toBeGreaterThan(0);
  });

  test('on real data: an insight exactly when the chart puts the area in the quadrant', () => {
    for (const universe of ['nsw', 'gsyd', 'peer'] as const) {
      const all = assess(NEEDS_SNAPSHOT.records.map(r => r.areaId).slice(0, 60), 'separate', universe);
      for (const spec of QUADRANT_SCATTERS) {
        // each area is compared with its own group, which is the chart's group when all the areas share one
        for (const area of all.areas) {
          const alone = assess([area.areaId], 'separate', universe);
          const flagged = quadrantData(alone, spec).selected[0].inNeedQuadrant;
          const has = quadrantInsights(alone).some(i => i.id === `quadrant:${area.areaId}:${spec.id}`);
          expect(has).toBe(flagged);
        }
      }
    }
  });
});

describe('buildInsights with quadrant insights', () => {
  test('includes them, ordered by severity with the other kinds', () => {
    const a = assess(['lga_blacktown'], 'separate', 'nsw', fiveRecords());
    const insights = buildInsights(a);
    const quadrant = insights.filter(i => i.kind === 'quadrant');
    expect(quadrant.map(i => i.id)).toEqual([
      'quadrant:lga_blacktown:growth-service',
      'quadrant:lga_blacktown:disadvantage-service',
    ]);
    expect(insights.map(i => i.severity)).toEqual([...insights.map(i => i.severity)].sort((x, y) => y - x));
    expect(quadrant.map(i => i.text)).toEqual(quadrantInsights(a).map(i => i.text));
  });

  test('ids are unique across a large selection', () => {
    const insights = buildInsights(assess(GREATER_SYDNEY_GCCSA_AREA_IDS, 'separate', 'gsyd'));
    const ids = insights.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(insights.some(i => i.kind === 'quadrant')).toBe(true);
  });
});
