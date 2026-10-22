import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { GREATER_SYDNEY_GCCSA_AREA_IDS } from '@/lib/data/sample-areas';
import { runAssessment } from '@/lib/needs/assess';
import { areaColor, MAX_LABELLED } from '@/lib/needs/colors';
import { axisFraction } from '@/lib/needs/chart-data';
import { INDICATORS } from '@/lib/needs/indicators';
import { labelGeometry, scatterPlotSize, SELECTED_RADIUS } from '@/lib/needs/insight-chart-data';
import { QUADRANT_SCATTERS, quadrantData, type QuadrantSpec } from '@/lib/needs/project-need';
import { quadrantChartData } from '@/lib/needs/project-need-chart';
import type {
  IndicatorId, IndicatorValue, LgaIndicatorRecord, NeedsAssessment, NeedsMode, Universe,
} from '@/lib/needs/types';
import { EMPTY_SERIES } from './fixtures/needs';

const GROWTH_SERVICE = QUADRANT_SCATTERS.find(s => s.id === 'growth-service')!;
const DISADVANTAGE_SERVICE = QUADRANT_SCATTERS.find(s => s.id === 'disadvantage-service')!;

function assess(
  areaIds: string[],
  mode: NeedsMode = 'separate',
  universe: Universe = 'nsw',
  records: LgaIndicatorRecord[] = NEEDS_SNAPSHOT.records,
): NeedsAssessment {
  return runAssessment({ snapshot: { generatedAt: '2026-10-23T00:00:00.000Z', records }, areaIds, mode, universe });
}

function makeRecord(areaId: string, name: string, growth: number | null, departures: number | null, seifa = 1000): LgaIndicatorRecord {
  const values = {} as Record<IndicatorId, IndicatorValue>;
  for (const def of INDICATORS) values[def.id] = { value: null };
  values.pop_growth_2041 = { value: growth };
  values.am_peak_departures_per_1000 = { value: departures };
  values.seifa_irsd = { value: seifa };
  return {
    areaId, name, region: 'Hunter', population: 100000, densityPerKm2: 500, peerGroup: 'regional_city',
    values, series: { ...EMPTY_SERIES },
  };
}

/** Five complete non-metropolitan LGAs: the least a comparison group needs to be drawn. */
const FILLERS = [1, 2, 3, 4, 5].map(i => makeRecord(`lga_f${i}`, `F${i}`, i * 5, i));

/** The first panel of the figure, for the tests of one panel. */
const firstPanel = (a: NeedsAssessment, spec: QuadrantSpec, width?: number) => quadrantChartData(a, spec, width).panels[0];

describe('quadrantChartData: a panel', () => {
  const a = assess(['lga_blacktown', 'lga_penrith'], 'separate', 'gsyd');
  const chart = firstPanel(a, GROWTH_SERVICE);
  const data = quadrantData(a, GROWTH_SERVICE);

  test('holds the group in grey and the selected areas coloured in selection order', () => {
    expect(chart.others.map(d => d.id)).toEqual(data.points.map(p => p.areaId));
    expect(chart.selected.map(d => [d.name, d.color])).toEqual([['Blacktown', areaColor(0)], ['Penrith', areaColor(1)]]);
    expect(chart.groupLabel).toBe('Greater Sydney LGAs');
  });

  test('tooltips name the area and both values', () => {
    const blacktown = chart.selected[0];
    expect(blacktown.tooltip).toEqual([
      'Blacktown', 'Population growth 2021–41: 40.9%', 'AM-peak departures per 1,000 residents: 32.5',
    ]);
    expect(chart.others[0].tooltip).toHaveLength(3);
  });

  test('axes cover every dot, the medians and Greater Sydney, and y starts at 0', () => {
    const xs = [...chart.others, ...chart.selected].map(d => d.x).concat(chart.greaterSydney!.x, chart.medians!.x);
    const ys = [...chart.others, ...chart.selected].map(d => d.y).concat(chart.greaterSydney!.y, chart.medians!.y);
    expect(chart.xAxis.lo).toBeLessThanOrEqual(Math.min(...xs));
    expect(chart.xAxis.hi).toBeGreaterThanOrEqual(Math.max(...xs));
    expect(chart.yAxis.lo).toBe(0);
    expect(chart.yAxis.hi).toBeGreaterThanOrEqual(Math.max(...ys));
  });

  test('the medians are the group medians, as shown', () => {
    expect(chart.medians).toMatchObject({ x: data.medians.x, y: data.medians.y });
    expect(chart.medians!.xText).toBe(`${data.medians.x.toFixed(1)}%`);
    expect(chart.medians!.yText).toBe(data.medians.y.toFixed(1));
  });

  test('growth-service shades the area right of the median growth and below the median service', () => {
    const { x1, x2, y1, y2 } = chart.quadrant!;
    expect([x1, x2]).toEqual([chart.medians!.x, chart.xAxis.hi]);
    expect([y1, y2]).toEqual([chart.yAxis.lo, chart.medians!.y]);
    expect(chart.xReversed).toBe(false);
  });

  test('disadvantage-service reverses x and shades below the median IRSD, which is the right-hand side', () => {
    const d = firstPanel(a, DISADVANTAGE_SERVICE);
    expect(d.xReversed).toBe(true);
    const { x1, x2, y1, y2 } = d.quadrant!;
    expect([x1, x2]).toEqual([d.xAxis.lo, d.medians!.x]);
    expect([y1, y2]).toEqual([d.yAxis.lo, d.medians!.y]);
    expect(d.xTitle).toContain('more disadvantage');
  });

  test('Greater Sydney is a marker with the benchmark values', () => {
    expect(chart.greaterSydney).toMatchObject({ name: 'Greater Sydney', x: data.greaterSydney!.x, y: data.greaterSydney!.y });
    // a panel of non-metropolitan LGAs has no marker
    expect(firstPanel(assess(['lga_f1'], 'separate', 'nsw', FILLERS), GROWTH_SERVICE).greaterSydney).toBeNull();
  });

  test('says which selected areas are in the need quadrant', () => {
    const inside = data.selected.filter(s => s.inNeedQuadrant).map(s => s.name);
    expect(inside.length).toBeGreaterThan(0);
    expect(chart.inQuadrantText).toBe(
      inside.length === 1 ? `${inside[0]} is in the shaded group.` : `${inside.join(' and ')} are in the shaded group.`,
    );
    // otherwise it names the panel's own selected areas
    const none = firstPanel(assess(['lga_sydney'], 'separate', 'gsyd'), GROWTH_SERVICE);
    expect(none.inQuadrantText).toBe('City of Sydney is not in the shaded group.');
  });
});

describe('quadrantChartData: a panel\'s names', () => {
  test('every placed name lies inside the plot and clear of the other names', () => {
    const ids = NEEDS_SNAPSHOT.records.filter(r => GREATER_SYDNEY_GCCSA_AREA_IDS.includes(r.areaId)).map(r => r.areaId);
    const width = 900;
    const chart = firstPanel(assess(ids, 'separate', 'gsyd'), GROWTH_SERVICE, width);
    const plot = scatterPlotSize(width);
    const named = chart.selected.filter(d => d.placement !== null);
    expect(named.length).toBeGreaterThan(0);
    expect(named.length).toBeLessThanOrEqual(MAX_LABELLED);
    expect(chart.unnamedCount).toBe(chart.selected.length - named.length);
    for (const d of named) {
      const at = {
        x: axisFraction(chart.xAxis, chart.xReversed, d.x) * plot.width,
        y: (1 - (d.y - chart.yAxis.lo) / (chart.yAxis.hi - chart.yAxis.lo)) * plot.height,
      };
      const rect = labelGeometry(d.placement!, d.label.length * 6.6, SELECTED_RADIUS).rect;
      expect(at.x + rect.x0).toBeGreaterThanOrEqual(0);
      expect(at.x + rect.x1).toBeLessThanOrEqual(plot.width);
      expect(at.y + rect.y0).toBeGreaterThanOrEqual(0);
      expect(at.y + rect.y1).toBeLessThanOrEqual(plot.height);
    }
  });

  test('with more areas than names, the areas in the need quadrant are named first', () => {
    const records = [
      ...Array.from({ length: 14 }, (_, i) => makeRecord(`lga_s${i}`, `Spot ${i}`, 50 + i, 1 + i * 0.1)),
      ...Array.from({ length: 30 }, (_, i) => makeRecord(`lga_o${i}`, `Other ${i}`, 1 + i * 0.1, 80 + i)),
    ];
    // 14 selected areas in the need quadrant (high growth, low service) and 2 outside it; only 12 can be named
    const selected = [...records.slice(0, 14).map(r => r.areaId), 'lga_o0', 'lga_o1'];
    const chart = firstPanel(assess(selected, 'separate', 'nsw', records), GROWTH_SERVICE, 1600);
    expect(chart.selected.filter(d => d.inNeedQuadrant)).toHaveLength(14);
    const named = chart.selected.filter(d => d.placement !== null);
    expect(named.length).toBeLessThanOrEqual(MAX_LABELLED);
    for (const d of chart.selected.filter(d => !d.inNeedQuadrant)) expect(d.placement).toBeNull();
    expect(chart.unnamedCount).toBeGreaterThanOrEqual(chart.selected.length - MAX_LABELLED);
  });
});

describe('quadrantChartData: a panel with missing values', () => {
  const records = [
    makeRecord('lga_a', 'A', 10, 5),
    makeRecord('lga_b', 'B', 20, 6),
    makeRecord('lga_c', 'C', null, 7),
    makeRecord('lga_d', 'D', 30, null),
    ...FILLERS.slice(0, 3),
  ];

  test('selected areas without both values are listed in a note, not plotted', () => {
    const chart = firstPanel(assess(['lga_a', 'lga_c', 'lga_d'], 'separate', 'nsw', records), GROWTH_SERVICE);
    expect(chart.selected.map(d => d.name)).toEqual(['A']);
    expect(chart.noDataText).toBe(
      '2 of 3 selected LGAs have no population growth or AM-peak service data and are not shown: C and D.',
    );
    // colours keep the position in the selection
    expect(chart.selected[0].color).toBe(areaColor(0));
    const second = firstPanel(assess(['lga_c', 'lga_a'], 'separate', 'nsw', records), GROWTH_SERVICE);
    expect(second.selected[0].color).toBe(areaColor(1));
  });

  test('a group too small to have a median has no panel, only a note (R55)', () => {
    const c = [makeRecord('lga_c', 'C', null, 7)];
    expect(quadrantChartData(assess(['lga_c'], 'separate', 'nsw', c), GROWTH_SERVICE)).toEqual({
      panels: [],
      notes: ['Too few LGAs to compare against a median: non-metropolitan LGAs (n = 0).'],
    });
    expect(quadrantChartData(assess(['lga_c'], 'separate', 'nsw', c), DISADVANTAGE_SERVICE).notes)
      .toEqual(['Too few LGAs to compare against a median: non-metropolitan LGAs (n = 1).']);
  });

  test('a combined area marks a population-weighted value as approximate', () => {
    const combined = firstPanel(assess(['lga_blacktown', 'lga_penrith'], 'combined'), DISADVANTAGE_SERVICE);
    expect(combined.selected).toHaveLength(1);
    expect(combined.selected[0].tooltip[1]).toMatch(/^SEIFA disadvantage \(IRSD\): ≈ \d+$/);
    const growth = firstPanel(assess(['lga_blacktown', 'lga_penrith'], 'combined'), GROWTH_SERVICE);
    expect(growth.selected[0].tooltip[1]).toMatch(/^Population growth 2021–41: \d+\.\d%$/);
  });
});

describe('quadrantChartData: panels', () => {
  test('one panel per comparison group, headed with its group and n, metropolitan first', () => {
    const { panels, notes } = quadrantChartData(assess(['lga_newcastle', 'lga_blacktown']), GROWTH_SERVICE);
    expect(notes).toEqual([
      'Compared with metropolitan LGAs and non-metropolitan LGAs rather than all NSW LGAs, because NSW-wide service medians '
      + 'are set by rural LGAs with little or no public transport.',
    ]);
    expect(panels.map(p => p.key)).toEqual(['metro', 'non_metro']);
    expect(panels[0].heading).toBe('Metropolitan LGAs (n = 34)');
    expect(panels[1].heading).toMatch(/^Non-metropolitan LGAs \(n = \d+\)$/);
    expect(panels.map(p => p.groupLabel)).toEqual(['metropolitan LGAs', 'non-metropolitan LGAs']);
    expect(panels.map(p => p.selected.map(d => d.name))).toEqual([['Blacktown'], ['Newcastle']]);
  });

  test('each panel has its own medians, shaded quadrant and grey points', () => {
    const [metro, nonMetro] = quadrantChartData(assess(['lga_blacktown', 'lga_newcastle']), GROWTH_SERVICE).panels;
    expect(metro.medians!.y).toBeGreaterThan(nonMetro.medians!.y);
    expect(metro.quadrant!.y2).toBe(metro.medians!.y);
    expect(nonMetro.quadrant!.y2).toBe(nonMetro.medians!.y);
    expect(metro.others).toHaveLength(33);
    expect(nonMetro.others.map(d => d.id)).not.toContain('lga_newcastle');
    // Greater Sydney is marked on the metropolitan panel only
    expect(metro.greaterSydney).not.toBeNull();
    expect(nonMetro.greaterSydney).toBeNull();
  });

  test('a selected area keeps its colour from the selection, on whichever panel it is', () => {
    const [metro, nonMetro] = quadrantChartData(assess(['lga_newcastle', 'lga_blacktown']), GROWTH_SERVICE).panels;
    expect(nonMetro.selected[0].color).toBe(areaColor(0));
    expect(metro.selected[0].color).toBe(areaColor(1));
  });

  test('Blacktown and Penrith are in the need quadrant of the metropolitan panel', () => {
    const { panels } = quadrantChartData(assess(['lga_blacktown', 'lga_penrith']), GROWTH_SERVICE);
    expect(panels).toHaveLength(1);
    expect(panels[0].inQuadrantText).toBe('Blacktown and Penrith are in the shaded group.');
  });

  test('a panel says which of its own selected areas are not in the shaded group', () => {
    const [metro, nonMetro] = quadrantChartData(assess(['lga_blacktown', 'lga_newcastle']), GROWTH_SERVICE).panels;
    expect(metro.inQuadrantText).toBe('Blacktown is in the shaded group.');
    expect(nonMetro.inQuadrantText).toBe('Newcastle is not in the shaded group.');
    // Blacktown and Penrith are not past the medians of the outer metropolitan LGAs
    const outer = quadrantChartData(assess(['lga_blacktown', 'lga_penrith'], 'separate', 'peer'), GROWTH_SERVICE).panels[0];
    expect(outer.inQuadrantText).toBe('Blacktown and Penrith are not in the shaded group.');
  });

  test('an area with no data has nothing to say about the shaded group', () => {
    const records = [makeRecord('lga_c', 'C', null, 7), ...FILLERS];
    expect(firstPanel(assess(['lga_c'], 'separate', 'nsw', records), GROWTH_SERVICE).inQuadrantText).toBeNull();
  });

  test('the notes of the figure come from the panels', () => {
    expect(quadrantChartData(assess(['lga_blacktown', 'lga_newcastle'], 'combined'), GROWTH_SERVICE).notes)
      .toEqual(['Selected LGAs span metropolitan and non-metropolitan settings; medians are NSW-wide.']);
  });

  test('no areas: no panels', () => {
    expect(quadrantChartData(assess([]), GROWTH_SERVICE)).toEqual({ panels: [], notes: [] });
  });
});
