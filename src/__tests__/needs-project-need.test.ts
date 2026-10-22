import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { GREATER_SYDNEY_GCCSA_AREA_IDS } from '@/lib/data/sample-areas';
import { runAssessment } from '@/lib/needs/assess';
import { formatValue } from '@/lib/needs/format';
import { INDICATOR_BY_ID, INDICATORS } from '@/lib/needs/indicators';
import { buildInsights } from '@/lib/needs/insights';
import { sourceNumber } from '@/lib/needs/page-data';
import {
  MAX_RADAR_AREAS, QUADRANT_SCATTERS, RADAR_AXES, inNeedQuadrant, quadrantData, quadrantGroupOf, quadrantInsights,
  quadrantPanels, radarData, radarGaps, typicalLabel, type QuadrantSpec,
} from '@/lib/needs/project-need';
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

/** Five LGAs in Greater Sydney, and five outside it, which have different comparison groups against NSW. */
const METRO_FIVE = ['lga_blacktown', 'lga_penrith', 'lga_camden', 'lga_campbelltown', 'lga_liverpool'];
const NON_METRO_FIVE = ['lga_x_blacktown', 'lga_x_penrith', 'lga_x_camden', 'lga_x_campbelltown', 'lga_x_liverpool'];

/**
 * Five LGAs of one comparison group. Growth sorts 10, 20, 24.8, 30, 40.9 (median 24.8) and departures 10, 32.5,
 * 35.0, 40, 50 (median 35.0); SEIFA sorts 900, 980, 1000, 1050, 1100 (median 1000). 'Blacktown' is high growth, high
 * disadvantage and low service; 'Eee' has the best service.
 */
function fiveRecords(ids: string[] = METRO_FIVE): LgaIndicatorRecord[] {
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
    row(ids[0], 'Blacktown', 40.9, 32.5, 900),
    row(ids[1], 'Bee', 24.8, 40, 1000),
    row(ids[2], 'Sea', 10, 35.0, 1100),
    row(ids[3], 'Dee', 20, 10, 980),
    row(ids[4], 'Eee', 30, 50, 1050),
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

const both = (spec: QuadrantSpec) => (r: LgaIndicatorRecord) => valueOf(r, spec.x) !== null && valueOf(r, spec.y) !== null;
const medianOf = (records: LgaIndicatorRecord[], spec: QuadrantSpec) => {
  const group = records.filter(both(spec));
  return {
    x: median(group.map(r => valueOf(r, spec.x)!)),
    y: median(group.map(r => valueOf(r, spec.y)!)),
    n: group.length,
  };
};
const metroRecords = () => NEEDS_SNAPSHOT.records.filter(r => GREATER_SYDNEY_GCCSA_AREA_IDS.includes(r.areaId));
const nonMetroRecords = () => NEEDS_SNAPSHOT.records.filter(r => !GREATER_SYDNEY_GCCSA_AREA_IDS.includes(r.areaId));

/** The first LGA of each of the first `count` regions (or peer groups), in snapshot order. */
function onePerGroup(by: 'region' | 'peerGroup', count: number): string[] {
  const seen = new Map<string, string>();
  for (const r of NEEDS_SNAPSHOT.records) if (!seen.has(r[by])) seen.set(r[by], r.areaId);
  return Array.from(seen.values()).slice(0, count);
}

describe('quadrantGroupOf', () => {
  test('against NSW, an area is compared with the metropolitan or the non-metropolitan LGAs', () => {
    const a = assess(['lga_blacktown', 'lga_newcastle']);
    const [blacktown, newcastle] = a.areas.map(area => quadrantGroupOf(a, area));
    expect(blacktown).toMatchObject({ key: 'metro', label: 'metropolitan LGAs', showsGreaterSydney: true });
    expect(blacktown.records.map(r => r.areaId)).toEqual(metroRecords().map(r => r.areaId));
    expect(blacktown.records).toHaveLength(34);
    expect(newcastle).toMatchObject({ key: 'non_metro', label: 'non-metropolitan LGAs', showsGreaterSydney: false });
    expect(newcastle.records).toHaveLength(94);
  });

  test('Greater Sydney, a region and a peer group are each their own group, named as the assessment names them', () => {
    const gsyd = assess(['lga_newcastle'], 'separate', 'gsyd');
    expect(quadrantGroupOf(gsyd, gsyd.areas[0])).toMatchObject({ label: 'Greater Sydney LGAs', showsGreaterSydney: true });
    const region = assess(['lga_newcastle'], 'separate', 'region');
    expect(quadrantGroupOf(region, region.areas[0])).toMatchObject({ label: 'LGAs in the Hunter region', showsGreaterSydney: false });
    const peer = assess(['lga_blacktown'], 'separate', 'peer');
    expect(quadrantGroupOf(peer, peer.areas[0])).toMatchObject({ label: 'outer metropolitan LGAs', showsGreaterSydney: false });
  });

  test('a combined area is compared with the setting all its LGAs share, else with NSW as a whole', () => {
    const metro = assess(['lga_blacktown', 'lga_penrith'], 'combined');
    expect(quadrantGroupOf(metro, metro.areas[0]).key).toBe('metro');
    const mixed = assess(['lga_blacktown', 'lga_newcastle'], 'combined');
    expect(quadrantGroupOf(mixed, mixed.areas[0])).toMatchObject({ key: 'nsw', label: 'NSW LGAs', showsGreaterSydney: false });
    expect(quadrantGroupOf(mixed, mixed.areas[0]).records).toHaveLength(128);
    // a region or peer selection that fell back to NSW is split by setting just the same
    const fallback = assess(['lga_blacktown', 'lga_penrith'], 'combined', 'region');
    expect(fallback.universeFallback).toBe(false);
    expect(quadrantGroupOf(fallback, fallback.areas[0]).label).toBe('LGAs in the Greater Sydney region');
    const spanning = assess(['lga_blacktown', 'lga_newcastle'], 'combined', 'region');
    expect(spanning.universeFallback).toBe(true);
    expect(quadrantGroupOf(spanning, spanning.areas[0]).key).toBe('nsw');
  });
});

describe('quadrantPanels: one panel per comparison group', () => {
  test('nsw, Blacktown and Penrith: one metropolitan panel with its own medians (R51)', () => {
    const { panels, notes } = quadrantPanels(assess(['lga_blacktown', 'lga_penrith']), GROWTH_SERVICE);
    expect(notes).toEqual([]);
    expect(panels).toHaveLength(1);
    const [panel] = panels;
    expect(panel.group.label).toBe('metropolitan LGAs');
    const expected = medianOf(metroRecords(), GROWTH_SERVICE);
    expect(panel.n).toBe(expected.n);
    expect(panel.data.medians.x).toBeCloseTo(expected.x, 10);
    expect(panel.data.medians.y).toBeCloseTo(expected.y, 10);
    // the NSW-wide median of 5.6 would leave no Sydney LGA in "low service"
    expect(panel.data.medians.y).toBeGreaterThan(30);
    expect(panel.data.points).toHaveLength(34 - 2);
    expect(panel.data.selected.map(s => [s.name, s.inNeedQuadrant])).toEqual([['Blacktown', true], ['Penrith', true]]);
    expect(panel.data.greaterSydney).not.toBeNull();
  });

  test('nsw, a metropolitan and a regional area: a panel each, metropolitan first, holding only its own areas', () => {
    for (const ids of [['lga_blacktown', 'lga_newcastle'], ['lga_newcastle', 'lga_blacktown']]) {
      const { panels } = quadrantPanels(assess(ids), GROWTH_SERVICE);
      expect(panels.map(p => p.group.label)).toEqual(['metropolitan LGAs', 'non-metropolitan LGAs']);
      expect(panels.map(p => p.data.selected.map(s => s.areaId))).toEqual([['lga_blacktown'], ['lga_newcastle']]);
      // each panel's grey points are its own group's, less the selected areas
      expect(panels[0].data.points).toHaveLength(34 - 1);
      const nonMetro = medianOf(nonMetroRecords(), GROWTH_SERVICE);
      expect(panels[1].n).toBe(nonMetro.n);
      expect(panels[1].data.points).toHaveLength(nonMetro.n - 1);
      expect(panels[1].data.medians.y).toBeCloseTo(nonMetro.y, 10);
      // Greater Sydney is marked on the metropolitan panel only
      expect(panels.map(p => p.data.greaterSydney !== null)).toEqual([true, false]);
    }
  });

  test('nsw, regional areas only: one non-metropolitan panel', () => {
    const { panels } = quadrantPanels(assess(['lga_newcastle', 'lga_wollongong']), DISADVANTAGE_SERVICE);
    expect(panels.map(p => p.group.key)).toEqual(['non_metro']);
    expect(panels[0].data.selected).toHaveLength(2);
  });

  test('gsyd: one panel of the Greater Sydney LGAs, even for a regional area', () => {
    const { panels } = quadrantPanels(assess(['lga_blacktown', 'lga_newcastle'], 'separate', 'gsyd'), GROWTH_SERVICE);
    expect(panels).toHaveLength(1);
    expect(panels[0].group.label).toBe('Greater Sydney LGAs');
    expect(panels[0].data.selected).toHaveLength(2);
    expect(panels[0].data.greaterSydney).not.toBeNull();
  });

  test('region and peer: a panel for each distinct group in selection order, at most 3, the rest counted', () => {
    for (const [universe, by] of [['region', 'region'], ['peer', 'peerGroup']] as const) {
      const ids = onePerGroup(by, 5);
      expect(ids).toHaveLength(5);
      const a = assess(ids, 'separate', universe);
      const { panels, notes } = quadrantPanels(a, GROWTH_SERVICE);
      expect(panels.map(p => p.group.label)).toEqual(a.areas.slice(0, 3).map(area => area.universeLabel));
      expect(panels.map(p => p.data.selected.map(s => s.areaId))).toEqual(ids.slice(0, 3).map(id => [id]));
      expect(panels.every(p => p.data.greaterSydney === null)).toBe(true);
      expect(notes).toEqual(['2 further comparison groups not shown.']);
      expect(quadrantPanels(assess(ids.slice(0, 4), 'separate', universe), GROWTH_SERVICE).notes)
        .toEqual(['1 further comparison group not shown.']);
      expect(quadrantPanels(assess(ids.slice(0, 3), 'separate', universe), GROWTH_SERVICE).notes).toEqual([]);
    }
  });

  test('areas of one group share a panel', () => {
    const { panels } = quadrantPanels(assess(['lga_blacktown', 'lga_penrith', 'lga_camden'], 'separate', 'peer'), GROWTH_SERVICE);
    expect(panels).toHaveLength(1);
    expect(panels[0].data.selected).toHaveLength(3);
  });

  test('a combined area is one point on its group\'s panel', () => {
    const { panels } = quadrantPanels(assess(['lga_blacktown', 'lga_penrith'], 'combined'), GROWTH_SERVICE);
    expect(panels.map(p => p.group.key)).toEqual(['metro']);
    expect(panels[0].data.selected).toHaveLength(1);
    expect(panels[0].data.selected[0]).toMatchObject({ areaId: 'combined', name: 'Blacktown + Penrith' });
    // its members are the combined point, not also grey points, but they still count towards the medians
    expect(panels[0].data.points).toHaveLength(34 - 2);
    expect(panels[0].data.medians.x).toBeCloseTo(medianOf(metroRecords(), GROWTH_SERVICE).x, 10);
  });

  test('a combined area spanning both settings is NSW-wide, with a note that says so', () => {
    const { panels, notes } = quadrantPanels(assess(['lga_blacktown', 'lga_newcastle'], 'combined'), GROWTH_SERVICE);
    expect(panels.map(p => p.group.label)).toEqual(['NSW LGAs']);
    expect(panels[0].data.medians.y).toBeCloseTo(medianOf(NEEDS_SNAPSHOT.records, GROWTH_SERVICE).y, 10);
    expect(panels[0].data.greaterSydney).toBeNull();
    expect(notes).toEqual(['Selected LGAs span metropolitan and non-metropolitan settings; medians are NSW-wide.']);
  });

  test('no areas: no panels', () => {
    expect(quadrantPanels(assess([]), GROWTH_SERVICE)).toEqual({ panels: [], notes: [] });
  });
});

describe('quadrantData', () => {
  const selectedIds = ['lga_blacktown', 'lga_penrith'];

  test('an LGA missing either value is not a point', () => {
    const a = assess(['lga_newcastle']);
    const d = quadrantData(a, GROWTH_SERVICE);
    const noGrowth = nonMetroRecords().filter(r => valueOf(r, 'pop_growth_2041') === null);
    expect(noGrowth.length).toBeGreaterThan(0);
    for (const r of noGrowth) expect(d.points.map(p => p.areaId)).not.toContain(r.areaId);
  });

  test('the group of the first selected area is the default', () => {
    const a = assess(['lga_blacktown', 'lga_newcastle']);
    expect(quadrantData(a, GROWTH_SERVICE)).toEqual(quadrantPanels(a, GROWTH_SERVICE).panels[0].data);
  });

  test('combined mode plots one combined point in place of its member LGAs', () => {
    const a = assess(selectedIds, 'combined');
    const d = quadrantData(a, GROWTH_SERVICE);
    expect(d.selected).toHaveLength(1);
    expect(d.selected[0].x).toBe(a.areas[0].indicators.find(s => s.id === 'pop_growth_2041')!.value);
    expect(d.selected[0].y).toBe(a.areas[0].indicators.find(s => s.id === 'am_peak_departures_per_1000')!.value);
    expect(d.points.map(p => p.areaId)).not.toContain('lga_blacktown');
  });

  test('no areas: nothing to plot', () => {
    const d = quadrantData(assess([]), GROWTH_SERVICE);
    expect(d.points).toEqual([]);
    expect(d.selected).toEqual([]);
    expect(Number.isNaN(d.medians.x)).toBe(true);
  });

  test('medians are over the group and count the selected LGAs, which belong to it', () => {
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

  test('Greater Sydney is the benchmark value on a metropolitan panel when it has both, else null', () => {
    const a = assess(['lga_blacktown']);
    const gs = a.benchmarks.gsyd.indicators;
    expect(quadrantData(a, GROWTH_SERVICE).greaterSydney).toEqual({
      x: gs.find(s => s.id === 'pop_growth_2041')!.value,
      y: gs.find(s => s.id === 'am_peak_departures_per_1000')!.value,
    });
    // no Greater Sydney LGA has a value in this fixture, so the benchmark has none
    const none = assess(['lga_x_blacktown'], 'separate', 'nsw', fiveRecords(NON_METRO_FIVE));
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
    const outside = quadrantData(assess(['lga_camden'], 'separate', 'nsw', fiveRecords()), GROWTH_SERVICE);
    expect(outside.selected).toEqual([{ areaId: 'lga_camden', name: 'Sea', x: 10, y: 35, inNeedQuadrant: false }]);
  });

  test('a selected area with a null x or y is listed with its nulls and is never in the quadrant', () => {
    const records = [
      ...fiveRecords(),
      makeRecord('lga_hawkesbury', { name: 'No Growth', values: { am_peak_departures_per_1000: { value: 1 } } }),
      makeRecord('lga_hills', { name: 'No Departures', values: { pop_growth_2041: { value: 90 } } }),
    ];
    const d = quadrantData(assess(['lga_hawkesbury', 'lga_hills', 'lga_blacktown'], 'separate', 'nsw', records), GROWTH_SERVICE);
    expect(d.selected).toEqual([
      { areaId: 'lga_hawkesbury', name: 'No Growth', x: null, y: 1, inNeedQuadrant: false },
      { areaId: 'lga_hills', name: 'No Departures', x: 90, y: null, inNeedQuadrant: false },
      { areaId: 'lga_blacktown', name: 'Blacktown', x: 40.9, y: 32.5, inNeedQuadrant: true },
    ]);
    // neither is a grey point either
    expect(d.points.map(p => p.areaId)).toEqual(['lga_penrith', 'lga_camden', 'lga_campbelltown', 'lga_liverpool']);
  });

  test('every selected area is in the order of the selection', () => {
    const d = quadrantData(assess(['lga_penrith', 'lga_blacktown']), GROWTH_SERVICE);
    expect(d.selected.map(s => s.areaId)).toEqual(['lga_penrith', 'lga_blacktown']);
  });
});

describe('quadrantInsights', () => {
  const a = assess(['lga_blacktown'], 'separate', 'nsw', fiveRecords());
  const find = (id: string, assessment = a) => quadrantInsights(assessment).find(i => i.id === id)!;

  test('growth-service text, exact', () => {
    expect(find('quadrant:lga_blacktown:growth-service').text).toBe(
      'Blacktown is in the high-growth, low-service group: population growth to 2041 of 40.9% (median 24.8%) and '
      + '32.5 AM-peak departures per 1,000 residents (median 35.0) among metropolitan LGAs.',
    );
  });

  test('disadvantage-service text, exact', () => {
    expect(find('quadrant:lga_blacktown:disadvantage-service').text).toBe(
      'Blacktown is in the high-disadvantage, low-service group: a SEIFA IRSD score of 900 (median 1000) and '
      + '32.5 AM-peak departures per 1,000 residents (median 35.0) among metropolitan LGAs.',
    );
  });

  test('names the group the area is compared with: non-metropolitan LGAs outside Greater Sydney', () => {
    const outside = assess(['lga_x_blacktown'], 'separate', 'nsw', fiveRecords(NON_METRO_FIVE));
    expect(find('quadrant:lga_x_blacktown:growth-service', outside).text.endsWith(' among non-metropolitan LGAs.')).toBe(true);
  });

  test('on real data Blacktown and Penrith are high growth, low service among metropolitan LGAs', () => {
    const real = assess(['lga_blacktown', 'lga_penrith']);
    expect(find('quadrant:lga_blacktown:growth-service', real).text).toBe(
      'Blacktown is in the high-growth, low-service group: population growth to 2041 of 40.9% (median 22.5%) and '
      + '32.5 AM-peak departures per 1,000 residents (median 36.9) among metropolitan LGAs.',
    );
    expect(find('quadrant:lga_penrith:growth-service', real).text).toBe(
      'Penrith is in the high-growth, low-service group: population growth to 2041 of 23.8% (median 22.5%) and '
      + '31.9 AM-peak departures per 1,000 residents (median 36.9) among metropolitan LGAs.',
    );
  });

  test('carries both indicators\' citations and a severity of the mean need percentile over 100', () => {
    const growth = find('quadrant:lga_blacktown:growth-service');
    expect(growth.kind).toBe('quadrant');
    expect(growth.areaId).toBe('lga_blacktown');
    expect(growth.citations).toEqual([INDICATOR_BY_ID.pop_growth_2041.source, INDICATOR_BY_ID.am_peak_departures_per_1000.source]);
    const area = a.areas[0];
    const p = (id: IndicatorId) => area.indicators.find(s => s.id === id)!.percentile!;
    expect(growth.severity).toBeCloseTo((p('pop_growth_2041') + p('am_peak_departures_per_1000')) / 2 / 100, 12);
    // growth 40.9 is the highest of five (percentile 90); 32.5 departures has three better-served LGAs (70)
    expect(growth.severity).toBeCloseTo(0.8, 12);

    const disadvantage = find('quadrant:lga_blacktown:disadvantage-service');
    expect(disadvantage.citations).toEqual([INDICATOR_BY_ID.seifa_irsd.source, INDICATOR_BY_ID.am_peak_departures_per_1000.source]);
    // IRSD 900 is the lowest of five (percentile 90)
    expect(disadvantage.severity).toBeCloseTo(0.8, 12);
  });

  test('severity is the mean of the area\'s need percentiles within its panel group, not within NSW (R52)', () => {
    // Five rural LGAs with the least growth, the least service and the least disadvantage push Blacktown up the NSW ranking on
    // growth and IRSD and down on service: NSW percentiles 95, 35 and 95, but 90, 70 and 90 among the five metropolitan LGAs.
    const rural = NON_METRO_FIVE.map((id, i) => makeRecord(id, {
      name: `Rural ${i}`,
      values: { pop_growth_2041: { value: 0 }, am_peak_departures_per_1000: { value: 1 }, seifa_irsd: { value: 1200 } },
    }));
    const mixed = assess(['lga_blacktown'], 'separate', 'nsw', [...fiveRecords(), ...rural]);
    const area = mixed.areas[0];
    const assessed = (id: IndicatorId) => area.indicators.find(s => s.id === id)!.percentile!;
    expect([assessed('pop_growth_2041'), assessed('am_peak_departures_per_1000'), assessed('seifa_irsd')]).toEqual([95, 35, 95]);

    const growth = find('quadrant:lga_blacktown:growth-service', mixed);
    const disadvantage = find('quadrant:lga_blacktown:disadvantage-service', mixed);
    expect(growth.text.endsWith(' among metropolitan LGAs.')).toBe(true);
    // (90 + 70) / 2 / 100, where the NSW percentiles would give (95 + 35) / 2 / 100 = 0.65
    expect(growth.severity).toBeCloseTo(0.8, 12);
    // IRSD runs the other way: the lowest of the five is the most need
    expect(disadvantage.severity).toBeCloseTo(0.8, 12);
  });

  test('a combined area is ranked within the panel group by its combined values', () => {
    const member = (id: string, growth: number, departures: number) => makeRecord(id, {
      name: id,
      values: {
        pop_growth_2041: { value: growth, numerator: growth, denominator: 100 },
        am_peak_departures_per_1000: { value: departures, numerator: departures, denominator: 1000 },
      },
    });
    const filler = [5, 10, 15, 20, 25].map((growth, i) => member(`lga_f${i}`, growth, 60 + i * 10));
    const records = [member('lga_m1', 50, 30), member('lga_m2', 40, 36), ...filler];
    // the combined value 45% is above 6 of the 7 non-metropolitan LGAs, and 33 departures is below 6 of them
    const growth = find('quadrant:combined:growth-service', assess(['lga_m1', 'lga_m2'], 'combined', 'nsw', records));
    expect(growth.severity).toBeCloseTo(6 / 7, 12);
  });

  test('an area outside the need quadrant has no insight', () => {
    const outside = assess(['lga_liverpool'], 'separate', 'nsw', fiveRecords());
    expect(quadrantInsights(outside)).toEqual([]);
  });

  test('an area with a missing value has no insight', () => {
    const records = [
      ...fiveRecords(),
      makeRecord('lga_hawkesbury', { name: 'No Growth', values: { am_peak_departures_per_1000: { value: 1 } } }),
    ];
    expect(quadrantInsights(assess(['lga_hawkesbury'], 'separate', 'nsw', records))).toEqual([]);
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
    const growth = find('quadrant:combined:growth-service', combined);
    expect(growth.areaId).toBe('combined');
    expect(growth.text).toBe(
      'The combined area is in the high-growth, low-service group: population growth to 2041 of 45.0% (median 20.0%) '
      + 'and 33.0 AM-peak departures per 1,000 residents (median 70.0) among non-metropolitan LGAs.',
    );
  });

  test('uses each area\'s own comparison group', () => {
    const peers = assess(['lga_camden', 'lga_campbelltown', 'lga_singleton'], 'separate', 'peer');
    const insights = quadrantInsights(peers);
    expect(new Set(insights.map(i => i.areaId)).size).toBeGreaterThan(1);
    for (const insight of insights) {
      const area = peers.areas.find(x => x.areaId === insight.areaId)!;
      expect(insight.text.endsWith(` among ${area.universeLabel}.`)).toBe(true);
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
    expect(quadrantInsights(assess(['lga_blacktown', 'lga_penrith'], 'separate', 'gsyd')).length).toBeGreaterThan(0);
  });
});

describe('quadrant shading and findings always agree (R51)', () => {
  const metroIds = metroRecords().map(r => r.areaId);
  const allIds = NEEDS_SNAPSHOT.records.map(r => r.areaId);
  const selections: Array<[string, string[], NeedsMode, Universe, boolean]> = [
    ['Blacktown + Penrith, NSW', ['lga_blacktown', 'lga_penrith'], 'separate', 'nsw', true],
    ['metropolitan + regional, NSW', ['lga_blacktown', 'lga_newcastle', 'lga_penrith', 'lga_wollongong'], 'separate', 'nsw', true],
    ['every NSW LGA, NSW', allIds, 'separate', 'nsw', true],
    ['Greater Sydney LGAs, gsyd', metroIds, 'separate', 'gsyd', true],
    ['metropolitan + regional, gsyd', ['lga_blacktown', 'lga_newcastle', 'lga_camden'], 'separate', 'gsyd', true],
    ['one LGA per region, region', onePerGroup('region', 3), 'separate', 'region', false],
    ['Camden, Singleton, Muswellbrook and Snowy Monaro, region', ['lga_camden', 'lga_singleton', 'lga_muswellbrook', 'lga_snowy_monaro'], 'separate', 'region', true],
    ['Camden, Strathfield, Singleton and Snowy Monaro, peer', ['lga_camden', 'lga_strathfield', 'lga_singleton', 'lga_snowy_monaro'], 'separate', 'peer', true],
    ['LGAs of mixed regions, region', allIds.filter((_, i) => i % 5 === 0), 'separate', 'region', true],
    ['one LGA per peer group, peer', onePerGroup('peerGroup', 3), 'separate', 'peer', false],
    ['LGAs of mixed peer groups, peer', allIds.filter((_, i) => i % 7 === 0), 'separate', 'peer', true],
    ['combined metropolitan, NSW', ['lga_blacktown', 'lga_penrith'], 'combined', 'nsw', true],
    ['combined metropolitan + regional, NSW', ['lga_blacktown', 'lga_newcastle'], 'combined', 'nsw', false],
    ['combined regional, NSW', ['lga_newcastle', 'lga_wollongong'], 'combined', 'nsw', false],
    ['combined, peer', ['lga_blacktown', 'lga_penrith'], 'combined', 'peer', false],
    ['combined spanning peer groups, peer (falls back to NSW)', ['lga_blacktown', 'lga_newcastle'], 'combined', 'peer', false],
    ['combined, region', ['lga_blacktown', 'lga_penrith'], 'combined', 'region', true],
  ];

  test.each(selections)('%s', (_name, ids, mode, universe, hasFindings) => {
    const a = assess(ids, mode, universe);
    const insights = quadrantInsights(a);
    let shaded = 0;
    for (const spec of QUADRANT_SCATTERS) {
      const [xDef, yDef] = [INDICATOR_BY_ID[spec.x], INDICATOR_BY_ID[spec.y]];
      for (const { group, data } of quadrantPanels(a, spec).panels) {
        for (const s of data.selected) {
          const insight = insights.find(i => i.id === `quadrant:${s.areaId}:${spec.id}`);
          // the chart puts the area in the quadrant exactly when there is a finding about it
          expect(insight !== undefined).toBe(s.inNeedQuadrant);
          if (!insight) continue;
          shaded++;
          // ... which names the panel's group and quotes its medians
          expect(insight.text.endsWith(` among ${group.label}.`)).toBe(true);
          expect(insight.text).toContain(`(median ${formatValue(xDef, data.medians.x)})`);
          expect(insight.text).toContain(`(median ${data.medians.y.toFixed(yDef.decimals)})`);
          // ... and the values it states are the point the chart draws
          expect(insight.text).toContain(`of ${formatValue(xDef, s.x!)} (median`);
          expect(insight.text).toContain(`and ${s.y!.toFixed(yDef.decimals)} AM-peak departures`);
        }
      }
    }
    // a selection with nothing in a quadrant would prove nothing
    if (hasFindings) expect(shaded).toBeGreaterThan(0);
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
