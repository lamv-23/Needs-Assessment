import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { GREATER_SYDNEY_GCCSA_AREA_IDS } from '@/lib/data/sample-areas';
import { runAssessment } from '@/lib/needs/assess';
import { AREA_PALETTE_SIZE, MAX_LABELLED, areaColor } from '@/lib/needs/colors';
import { INDICATORS } from '@/lib/needs/indicators';
import {
  areaRecords, carDependencyMismatch, crashRate, growthVsService, jobsHousing, trends,
} from '@/lib/needs/insights';
import {
  LOCKDOWN_NOTE, MEDIAN_CHANGE_NOTE, TREND_FIGURE_SUBTITLE, clipLine, formatTrendValue, growthServiceChartData, jobsHousingChartData, labelGeometry, mismatchChartData,
  nameList, noDataNote, placePointLabels, populationAxis, populationTickLabel, predictorTickLabel, tickDecimals, trendData,
  type LabelAnchor, type LabelPlacement,
} from '@/lib/needs/insight-chart-data';
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

function assess(
  areaIds: string[], mode: NeedsMode = 'separate', universe: Universe = 'nsw', records = NEEDS_SNAPSHOT.records,
): NeedsAssessment {
  return runAssessment({ snapshot: { generatedAt: '2026-10-23T00:00:00.000Z', records }, areaIds, mode, universe });
}

const record = (id: string) => NEEDS_SNAPSHOT.records.find(r => r.areaId === id)!;
const GSYD_REGION = NEEDS_SNAPSHOT.records.filter(r => r.region === 'Greater Sydney').map(r => r.areaId);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Name placement

/** A label's rectangle in plot coordinates, for a placement. */
function labelRect(anchor: LabelAnchor & { width: number }, placement: LabelPlacement) {
  const g = labelGeometry(placement, anchor.width, anchor.radius);
  return { x0: anchor.x + g.rect.x0, x1: anchor.x + g.rect.x1, y0: anchor.y + g.rect.y0, y1: anchor.y + g.rect.y1 };
}
const overlap = (a: ReturnType<typeof labelRect>, b: ReturnType<typeof labelRect>) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const dotRect = (a: LabelAnchor) => ({ x0: a.x - a.radius, x1: a.x + a.radius, y0: a.y - a.radius, y1: a.y + a.radius });

describe('placePointLabels', () => {
  const plot = { width: 800, height: 400 };
  const anchor = (x: number, y: number, width: number | null = 80, radius = 7): LabelAnchor => ({ x, y, width, radius });

  test('an isolated point is named to its right', () => {
    expect(placePointLabels([anchor(300, 200)], plot)).toEqual(['right']);
  });

  test('a point near the right edge is named to its left', () => {
    expect(placePointLabels([anchor(780, 200)], plot)).toEqual(['left']);
  });

  test('a point in the top-right corner is named below-left, inside the plot', () => {
    const [placement] = placePointLabels([anchor(790, 4)], plot);
    expect(placement).not.toBeNull();
    const rect = labelRect(anchor(790, 4) as LabelAnchor & { width: number }, placement!);
    expect(rect.x1).toBeLessThanOrEqual(plot.width);
    expect(rect.y0).toBeGreaterThanOrEqual(0);
  });

  test('a point with no width (not to be named) gets null but still keeps names off its dot', () => {
    const placements = placePointLabels([anchor(300, 200, null), anchor(240, 200)], plot);
    expect(placements[0]).toBeNull();
    expect(placements[1]).not.toBeNull();
    const named = anchor(240, 200) as LabelAnchor & { width: number };
    expect(overlap(labelRect(named, placements[1]!), dotRect(anchor(300, 200)))).toBe(false);
  });

  test('a point that has no free place is left unnamed rather than overprinted', () => {
    // a plot too small for the name anywhere
    expect(placePointLabels([anchor(30, 15, 120)], { width: 60, height: 30 })).toEqual([null]);
  });

  test('no name overprints another name or a dot, across a crowded plot', () => {
    // a deterministic scatter of 40 points, 12 of them named
    const anchors = Array.from({ length: 40 }, (_, i) =>
      anchor(40 + ((i * 197) % 720), 20 + ((i * 89) % 360), i < 12 ? 70 + (i % 4) * 15 : null));
    const placements = placePointLabels(anchors, plot);
    const boxes = anchors.flatMap((a, i) => (placements[i] === null ? [] : [{ i, rect: labelRect(a as LabelAnchor & { width: number }, placements[i]!) }]));
    expect(boxes.length).toBeGreaterThanOrEqual(8);
    for (const { i, rect } of boxes) {
      expect(rect.x0).toBeGreaterThanOrEqual(0); expect(rect.x1).toBeLessThanOrEqual(plot.width);
      expect(rect.y0).toBeGreaterThanOrEqual(0); expect(rect.y1).toBeLessThanOrEqual(plot.height);
      anchors.forEach((other, j) => { if (j !== i) expect(overlap(rect, dotRect(other))).toBe(false); });
      boxes.forEach(({ i: j, rect: otherRect }) => { if (j !== i) expect(overlap(rect, otherRect)).toBe(false); });
    }
  });

  test('names are placed in selection order, so earlier names win a contested spot', () => {
    const placements = placePointLabels([anchor(300, 200), anchor(300, 200)], plot);
    expect(placements[0]).toBe('right');
    expect(placements[1]).not.toBe('right');
  });
});

// Axes

describe('populationAxis', () => {
  test('ticks at 1, 2 and 5 times a power of ten covering the populations, in ln units', () => {
    const axis = populationAxis(Math.log(1300), Math.log(215000));
    const populations = axis.ticks.map(t => Math.round(Math.exp(t)));
    expect(populations).toEqual([1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000]);
    expect(axis.lo).toBeLessThan(Math.log(1300));
    expect(axis.hi).toBeGreaterThan(Math.log(215000));
    expect(axis.ticks[0]).toBeGreaterThanOrEqual(axis.lo);
    expect(axis.ticks[axis.ticks.length - 1]).toBeLessThanOrEqual(axis.hi);
  });

  test('a single value still gives a usable axis', () => {
    const axis = populationAxis(Math.log(50000), Math.log(50000));
    expect(axis.hi).toBeGreaterThan(axis.lo);
    expect(axis.ticks.length).toBeGreaterThanOrEqual(2);
  });

  test('tick labels', () => {
    expect(populationTickLabel(Math.log(500))).toBe('500');
    expect(populationTickLabel(Math.log(2000))).toBe('2k');
    expect(populationTickLabel(Math.log(50000))).toBe('50k');
    expect(populationTickLabel(Math.log(200000))).toBe('200k');
    expect(populationTickLabel(Math.log(1000000))).toBe('1m');
  });
});

describe('predictorTickLabel', () => {
  test('a share on the metropolitan axis, a population on the ln axis', () => {
    expect(predictorTickLabel('metro', 20)).toBe('20%');
    expect(predictorTickLabel('non_metro', Math.log(50000))).toBe('50k');
  });
});

describe('tickDecimals', () => {
  test('enough decimal places to show every tick alike', () => {
    expect(tickDecimals([0, 20, 40])).toBe(0);
    expect(tickDecimals([0, 1, 2])).toBe(0);
    expect(tickDecimals([0, 0.5, 1])).toBe(1);
    expect(tickDecimals([0, 0.2, 0.4])).toBe(1);
    expect(tickDecimals([0, 0.1, 0.2])).toBe(1);
    expect(tickDecimals([0, 0.05, 0.1])).toBe(2);
    expect(tickDecimals([5])).toBe(0);
  });
});

describe('clipLine', () => {
  test('a line inside the box keeps the x range', () => {
    expect(clipLine(10, 2, [0, 10], [0, 100])).toEqual([{ x: 0, y: 10 }, { x: 10, y: 30 }]);
  });

  test('a line leaving the box is cut where it crosses the edge', () => {
    const [a, b] = clipLine(0, 10, [0, 20], [0, 100])!;
    expect(a).toEqual({ x: 0, y: 0 });
    expect(b.x).toBeCloseTo(10, 10); expect(b.y).toBeCloseTo(100, 10);
  });

  test('a falling line leaving the bottom is cut too', () => {
    const [a, b] = clipLine(100, -10, [0, 20], [0, 100])!;
    expect(a).toEqual({ x: 0, y: 100 });
    expect(b.x).toBeCloseTo(10, 10); expect(b.y).toBeCloseTo(0, 10);
  });

  test('a flat line is kept or dropped as a whole', () => {
    expect(clipLine(50, 0, [0, 10], [0, 100])).toEqual([{ x: 0, y: 50 }, { x: 10, y: 50 }]);
    expect(clipLine(150, 0, [0, 10], [0, 100])).toBeNull();
  });

  test('a line wholly outside the box is null', () => {
    expect(clipLine(200, 1, [0, 10], [0, 100])).toBeNull();
  });
});

// Mismatch scatter

describe('mismatchChartData', () => {
  const a = assess(['lga_blacktown', 'lga_newcastle']);
  const data = mismatchChartData(a, 900);

  test('one chart per setting of the selection, metropolitan first, each with its model', () => {
    expect(data.message).toBeNull();
    expect(data.charts.map(c => c.setting)).toEqual(['metro', 'non_metro']);
    const [metro, nonMetro] = data.charts;
    expect(metro.subtitle).toBe('R² 0.63 · n = 34');   // P2-R4: the frequent-service catchment model
    expect(nonMetro.subtitle).toBe('R² 0.52 · n = 94');
    expect(metro.heading).toBe('Metropolitan LGAs');
    expect(nonMetro.heading).toBe('Non-metropolitan LGAs');
    expect(metro.xTitle).toBe('Residents near frequent public transport (%, straight-line distance)');
    expect(nonMetro.xTitle).toBe('Population (log scale)');
    expect(metro.weakMessage).toBeNull();
  });

  test('every other LGA of the setting is a grey dot, and the selected ones are not among them', () => {
    const [metro, nonMetro] = data.charts;
    expect(metro.others).toHaveLength(33);
    expect(nonMetro.others).toHaveLength(93);
    expect(metro.others.some(d => d.id === 'lga_blacktown')).toBe(false);
    expect(nonMetro.others.some(d => d.id === 'lga_newcastle')).toBe(false);
    expect(metro.others.every(d => GREATER_SYDNEY_GCCSA_AREA_IDS.includes(d.id))).toBe(true);
  });

  test('a selected dot sits at its predictor and actual value, with the residual from the engine', () => {
    for (const chart of data.charts) {
      const [dot] = chart.selected;
      const result = carDependencyMismatch(record(dot.id), a.records)!;
      expect(dot.y).toBe(result.actual);
      expect(dot.x).toBe(result.x);
      expect(dot.expected).toBe(result.expected);
      expect(dot.z).toBe(result.z);
      expect(dot.residual).toBe(result.residual);
      // and so the residual is its vertical distance from the fitted line
      expect(chart.fit.intercept + chart.fit.slope * dot.x - dot.expected).toBeCloseTo(0, 9);
    }
  });

  test('colours follow the selection order; points with |z| >= 1 are flagged', () => {
    const [metro, nonMetro] = data.charts;
    expect(metro.selected[0]).toMatchObject({ name: 'Blacktown', color: areaColor(0), flagged: false });   // z 0.69
    expect(nonMetro.selected[0]).toMatchObject({ name: 'Newcastle', color: areaColor(1), flagged: true });  // z -2.05
    expect(nonMetro.flaggedCount).toBe(1);
    expect(metro.flaggedCount).toBe(0);
  });

  test('the fitted line and the lines one residual SD either side run through the plot', () => {
    for (const chart of data.charts) {
      const { intercept, slope, residualSd } = chart.fit;
      expect(chart.fitLine).not.toBeNull();
      for (const p of chart.fitLine!) expect(p.y).toBeCloseTo(intercept + slope * p.x, 9);
      expect(chart.bandLines).toHaveLength(2);
      for (const [lineIndex, offset] of [residualSd, -residualSd].entries()) {
        for (const p of chart.bandLines[lineIndex]) {
          expect(p.y).toBeCloseTo(intercept + slope * p.x + offset, 9);
          expect(p.y).toBeGreaterThanOrEqual(chart.yAxis.lo - 1e-9); expect(p.y).toBeLessThanOrEqual(chart.yAxis.hi + 1e-9);
        }
      }
    }
  });

  test('the axes cover every dot and the line', () => {
    for (const chart of data.charts) {
      for (const d of [...chart.others, ...chart.selected]) {
        expect(d.x).toBeGreaterThanOrEqual(chart.xAxis.lo); expect(d.x).toBeLessThanOrEqual(chart.xAxis.hi);
        expect(d.y).toBeGreaterThanOrEqual(chart.yAxis.lo); expect(d.y).toBeLessThanOrEqual(chart.yAxis.hi);
      }
      for (const p of chart.fitLine!) {
        expect(p.x).toBeGreaterThanOrEqual(chart.xAxis.lo); expect(p.x).toBeLessThanOrEqual(chart.xAxis.hi);
      }
    }
    expect(data.charts[0].yAxis.hi).toBeLessThanOrEqual(100);
  });

  test('the selected areas are named', () => {
    for (const chart of data.charts) {
      expect(chart.selected[0].placement).not.toBeNull();
      expect(chart.unnamedCount).toBe(0);
    }
  });

  test('tooltip lines state the actual value, the expected value and the residual', () => {
    const [metro, nonMetro] = data.charts;
    expect(metro.selected[0].tooltip).toEqual([
      'Blacktown', 'Car dependency 83.8%', 'Expected 79.2%', '+4.5 pp above expected (z = +0.6)',
    ]);
    expect(nonMetro.selected[0].tooltip[3]).toBe('−6.8 pp below expected (z = −2.0)');
    expect(metro.others[0].tooltip).toHaveLength(2);
    expect(metro.others[0].tooltip[1]).toMatch(/^Car dependency \d+\.\d%$/);
  });

  test('the non-metropolitan x axis is ln(population) with population tick labels', () => {
    const nonMetro = data.charts[1];
    const newcastle = nonMetro.selected[0];
    expect(newcastle.x).toBeCloseTo(Math.log(record('lga_newcastle').population), 9);
    expect(nonMetro.xAxis.ticks.map(t => populationTickLabel(t))).toContain('100k');
  });

  test('at most MAX_LABELLED areas are named, flagged ones first; the rest are unnamed and counted', () => {
    const big = mismatchChartData(assess(GSYD_REGION), 900);
    expect(big.charts).toHaveLength(1);
    const [chart] = big.charts;
    expect(chart.selected).toHaveLength(GSYD_REGION.length);
    const named = chart.selected.filter(d => d.placement !== null);
    expect(named.length).toBeLessThanOrEqual(MAX_LABELLED);
    expect(named.length).toBeGreaterThan(4);
    expect(chart.unnamedCount).toBe(chart.selected.length - named.length);
    // the order names are given in: flagged dots, the largest |z| first, then the rest in selection order
    const priority = chart.selected
      .map((d, i) => ({ d, i }))
      .sort((x, y) => (y.d.flagged ? Math.abs(y.d.z) : 0) - (x.d.flagged ? Math.abs(x.d.z) : 0) || x.i - y.i);
    expect(priority.slice(MAX_LABELLED).every(({ d }) => d.placement === null)).toBe(true);
    expect(chart.flaggedCount).toBeGreaterThan(3);
    expect(priority[0].d.placement).not.toBeNull();
    // colours repeat past the palette
    expect(chart.selected[AREA_PALETTE_SIZE].color).toBe(areaColor(0));
    // the one metropolitan LGA outside the region is the only grey dot
    expect(chart.others.map(d => d.name)).toEqual(['Central Coast']);
  });

  test('a combined area is one dot at the weighted mean predictor; its members stay grey', () => {
    const combined = mismatchChartData(assess(['lga_blacktown', 'lga_penrith'], 'combined'), 900);
    expect(combined.charts).toHaveLength(1);
    const [chart] = combined.charts;
    expect(chart.selected).toHaveLength(1);
    const [dot] = chart.selected;
    const [bt, pn] = [record('lga_blacktown'), record('lga_penrith')];
    const weighted = (v: (r: LgaIndicatorRecord) => number) =>
      (v(bt) * bt.population + v(pn) * pn.population) / (bt.population + pn.population);
    expect(dot.x).toBeCloseTo(weighted(r => r.values.frequent_service_catchment.value!), 9);
    expect(dot.y).toBeCloseTo(weighted(r => r.values.car_dependency.value!), 9);
    expect(chart.fit.intercept + chart.fit.slope * dot.x).toBeCloseTo(dot.expected, 9);
    expect(chart.others.map(d => d.id)).toEqual(expect.arrayContaining(['lga_blacktown', 'lga_penrith']));
    expect(chart.others).toHaveLength(34);
  });

  test('a combined area spanning both settings has no single model: a message, no chart', () => {
    const spanning = mismatchChartData(assess(['lga_blacktown', 'lga_newcastle'], 'combined'), 900);
    expect(spanning.charts).toEqual([]);
    expect(spanning.message).toBe(
      'The combined area spans metropolitan and non-metropolitan LGAs, which have separate models, so no expected car dependency is shown.',
    );
  });

  test('a model too weak to use gives the sentence instead of a plot, with its R² and n', () => {
    const records = GREATER_SYDNEY_GCCSA_AREA_IDS.slice(0, 25).map((id, i) => makeRecord(id, {
      name: `Metro ${i}`, region: 'Greater Sydney', peerGroup: 'metro_middle',
      values: {
        frequent_service_catchment: { value: i === 24 ? 48 : i * 4 },
        car_dependency: { value: i === 24 ? 95 : 70 + (i % 2 === 0 ? 5 : -5) },
      },
    }));
    const [chart] = mismatchChartData(assess([records[24].areaId], 'separate', 'nsw', records), 900).charts;
    expect(chart.weakMessage).toBe('The relationship in metropolitan LGAs is too weak to estimate an expected value.');
    expect(chart.subtitle).toMatch(/^R² 0\.\d\d · n = 25$/);
    expect(chart.selected).toEqual([]);
    expect(chart.others).toEqual([]);
    expect(chart.fitLine).toBeNull();
  });

  test('a selected area without car dependency is listed, not plotted', () => {
    const records = [
      ...NEEDS_SNAPSHOT.records,
      makeRecord('lga_test_nodata', { name: 'Nodataville', region: 'Hunter', population: 20000 }),
    ];
    const withGap = mismatchChartData(assess(['lga_blacktown', 'lga_test_nodata'], 'separate', 'nsw', records), 900);
    expect(withGap.noData).toEqual(['Nodataville']);
    expect(withGap.charts).toHaveLength(1);
    expect(withGap.charts[0].selected.map(d => d.name)).toEqual(['Blacktown']);
    // colours still follow the selection position
    const reversed = mismatchChartData(assess(['lga_test_nodata', 'lga_blacktown'], 'separate', 'nsw', records), 900);
    expect(reversed.charts[0].selected[0].color).toBe(areaColor(1));
  });

  test('nothing to plot gives a message', () => {
    const records = [makeRecord('lga_test_nodata', { name: 'Nodataville' })];
    const none = mismatchChartData(assess(['lga_test_nodata'], 'separate', 'nsw', records), 900);
    expect(none.charts).toEqual([]);
    expect(none.message).toBe('No car dependency data for the selected areas.');
  });
});

// Trend small multiples

describe('trendData', () => {
  const a = assess(['lga_blacktown', 'lga_newcastle']);
  const data = trendData(a);
  const panel = (id: string) => data.panels.find(p => p.id === id)!;
  const keyOf = (p: ReturnType<typeof panel>, name: string, kind: string) =>
    p.series.find(s => s.name === name && s.kind === kind)!.key;
  const valueAt = (p: ReturnType<typeof panel>, key: string, x: number) => p.rows.find(r => r.x === x)?.[key];

  test('one panel per metric with data, in a fixed order', () => {
    expect(data.panels.map(p => p.id)).toEqual(['car_dependency', 'crash_rate', 'population']);
    expect(data.message).toBeNull();
  });

  test('car dependency: each Census year, from the area series', () => {
    const p = panel('car_dependency');
    expect(p.xTicks).toEqual([2011, 2016, 2021]);
    const blacktown = keyOf(p, 'Blacktown', 'actual');
    expect([2011, 2016, 2021].map(x => valueAt(p, blacktown, x))).toEqual([75.1279, 73.6626, 83.7705]);
    expect(p.series.find(s => s.name === 'Blacktown')!.color).toBe(areaColor(0));
    expect(p.series.find(s => s.name === 'Newcastle')!.color).toBe(areaColor(1));
  });

  test('a dotted median line per comparison group, over the LGAs that have a value in every year shown', () => {
    const p = panel('car_dependency');
    const years = [2011, 2016, 2021] as const;
    const at = (r: LgaIndicatorRecord, year: number) => r.series.carDependencyByYear.find(c => c.year === year)?.value;
    const fixed = NEEDS_SNAPSHOT.records.filter(r => years.every(y => at(r, y) !== undefined));
    expect(fixed.length).toBeGreaterThan(100);
    expect(fixed.length).toBeLessThan(NEEDS_SNAPSHOT.records.length);   // 2011 lacks the LGAs amalgamated in 2016
    const m = p.series.find(s => s.kind === 'median')!;
    expect(m.name).toBe('Median of NSW LGAs in each year');
    for (const y of years) expect(valueAt(p, m.key, y)).toBeCloseTo(median(fixed.map(r => at(r, y)!)), 9);
    expect(p.series.filter(s => s.kind === 'median')).toHaveLength(1);
  });

  test('the median line holds its LGAs fixed: one missing 2011 is left out of every point', () => {
    const car = (values: [number, number, number] | [number, number]) => ({
      carDependencyByYear: values.length === 3
        ? [{ year: 2011 as const, value: values[0] }, { year: 2016 as const, value: values[1] }, { year: 2021 as const, value: values[2] }]
        : [{ year: 2016 as const, value: values[0] }, { year: 2021 as const, value: values[1] }],
    });
    const records = [
      makeRecord('lga_test_a', { name: 'A', series: car([50, 52, 54]) }),
      makeRecord('lga_test_b', { name: 'B', series: car([60, 62, 64]) }),
      makeRecord('lga_test_c', { name: 'C', series: car([70, 72, 74]) }),
      makeRecord('lga_test_d', { name: 'D', series: car([99, 99]) }),   // no 2011
    ];
    const p = trendData(assess(['lga_test_a'], 'separate', 'nsw', records)).panels.find(x => x.id === 'car_dependency')!;
    const m = p.series.find(s => s.kind === 'median')!;
    // medians of A, B and C: D would make 2016 and 2021 the medians of four values (67 and 69)
    expect([2011, 2016, 2021].map(y => valueAt(p, m.key, y))).toEqual([60, 62, 64]);

    // with the selected area not measured in 2011 the panel does not show 2011, so D is back in the set
    const noEarly = records.map(r => (r.areaId === 'lga_test_a' ? { ...r, series: { ...r.series, ...car([52, 54]) } } : r));
    const q = trendData(assess(['lga_test_a'], 'separate', 'nsw', noEarly)).panels.find(x => x.id === 'car_dependency')!;
    expect(q.xTicks).toEqual([2016, 2021]);
    const mq = q.series.find(s => s.kind === 'median')!;
    expect([2016, 2021].map(y => valueAt(q, mq.key, y))).toEqual([67, 69]);
  });

  test('the legend names the comparison group and says the line is a median in each year', () => {
    expect(data.medianLegend).toEqual([{ name: 'Median of NSW LGAs in each year' }]);
    const regions = trendData(assess(['lga_blacktown', 'lga_newcastle'], 'separate', 'region'));
    expect(regions.medianLegend.map(m => m.name)).toEqual([
      'Median of LGAs in the Greater Sydney region in each year', 'Median of LGAs in the Hunter region in each year',
    ]);
    for (const p of data.panels) {
      for (const s of p.series.filter(x => x.kind === 'median' || x.kind === 'median-projected')) {
        expect(s.name).toBe('Median of NSW LGAs in each year');
      }
    }
  });

  test('the car dependency and crash panels say the line is not the median change in the findings; car adds the lockdown', () => {
    const median = "The findings quote the median of each LGA's own change, which can differ from the change in this line.";
    const lockdown = "The 2021 Census was held during Sydney's COVID-19 lockdown, so 2021 car dependency is not directly comparable with earlier years.";
    expect(panel('car_dependency').notes).toEqual([lockdown, median]);
    expect(panel('crash_rate').notes).toEqual([median]);
    expect(panel('population').notes).toEqual([]);
    expect(MEDIAN_CHANGE_NOTE).toBe(median);
    expect(LOCKDOWN_NOTE).toBe(lockdown);
  });

  test('the figure subtitle is exported for the page', () => {
    expect(TREND_FIGURE_SUBTITLE).toBe('Selected LGAs against the median of the comparison group.');
  });

  test('crashes per 10,000: every year on its own ERP, matching the trend endpoints', () => {
    const p = panel('crash_rate');
    expect(p.xTicks).toEqual([2020, 2021, 2022, 2023, 2024]);
    const blacktown = keyOf(p, 'Blacktown', 'actual');
    // 832 crashes in 2022 ÷ the 2022 ERP of 411,634 (not the 2021 Census count)
    expect(valueAt(p, blacktown, 2022)).toBeCloseTo((832 * 10000) / 411634, 9);
    for (const id of ['lga_blacktown', 'lga_newcastle']) {
      const crash = trends(record(id), NEEDS_SNAPSHOT.records).find(t => t.metric === 'crash_rate')!;
      const key = keyOf(p, record(id).name, 'actual');
      expect(valueAt(p, key, 2020)).toBeCloseTo(crash.from.value, 9);
      expect(valueAt(p, key, 2024)).toBeCloseTo(crash.to.value, 9);
    }
    // 2020 has no ERP: the 2021 figure stands in (crashRate, as the indicator and the trend)
    expect(valueAt(p, blacktown, 2020)).toBe(crashRate(record('lga_blacktown').series, 2020));
  });

  test('population: an index of 2021 = 100, ERP years solid and the projection to 2041 dashed', () => {
    const p = panel('population');
    expect(p.xDomain).toEqual([2021, 2041]);
    expect(p.xTicks).toEqual([2021, 2025, 2030, 2035, 2041]);
    const actual = keyOf(p, 'Blacktown', 'actual');
    const projected = keyOf(p, 'Blacktown', 'projected');
    expect(valueAt(p, actual, 2021)).toBe(100);
    expect(valueAt(p, actual, 2025)).toBeCloseTo((449385 / 399925) * 100, 9);
    expect(valueAt(p, actual, 2041)).toBeUndefined();
    expect(valueAt(p, projected, 2021)).toBe(100);
    expect(valueAt(p, projected, 2041)).toBeCloseTo((563350 / 399925) * 100, 9);
    expect(valueAt(p, projected, 2025)).toBeUndefined();
    // the same projected growth as the trend sentence (R39)
    const growth = trends(record('lga_blacktown'), NEEDS_SNAPSHOT.records).find(t => t.metric === 'population_growth')!;
    expect((Math.pow(valueAt(p, projected, 2041)! / 100, 1 / 20) - 1) * 100).toBeCloseTo(growth.to.value, 9);
    expect(data.hasProjection).toBe(true);
  });

  test('the median of the population index has its own actual and projected parts, over LGAs with every year', () => {
    const p = panel('population');
    const years = [2021, 2022, 2023, 2024, 2025];
    const complete = NEEDS_SNAPSHOT.records.filter(r =>
      years.every(y => r.series.populationHistory.some(h => h.year === y && h.population > 0))
      && r.series.population2041 !== null && r.series.population2041 > 0);
    const base = (r: LgaIndicatorRecord) => r.series.populationHistory.find(h => h.year === 2021)!.population;
    const m = p.series.find(s => s.kind === 'median-projected')!;
    expect(valueAt(p, m.key, 2041)).toBeCloseTo(median(complete.map(r => (r.series.population2041! / base(r)) * 100)), 9);
    expect(valueAt(p, m.key, 2021)).toBe(100);
    const actual = p.series.find(s => s.kind === 'median')!;
    expect(valueAt(p, actual.key, 2025)).toBeCloseTo(
      median(complete.map(r => (r.series.populationHistory.find(h => h.year === 2025)!.population / base(r)) * 100)), 9,
    );
  });

  test('few areas are told apart by colour in a legend; many are drawn in one colour', () => {
    expect(data.areaLegend).toEqual([
      { name: 'Blacktown', color: areaColor(0) }, { name: 'Newcastle', color: areaColor(1) },
    ]);
    const many = trendData(assess(GSYD_REGION));
    expect(many.areaLegend).toBeNull();
    const colours = new Set(many.panels[0].series.filter(s => s.kind === 'actual').map(s => s.color));
    expect(colours.size).toBe(1);
  });

  test('a combined area is one line built from the roll-up of its members', () => {
    const combined = trendData(assess(['lga_blacktown', 'lga_penrith'], 'combined'));
    const p = combined.panels.find(x => x.id === 'crash_rate')!;
    const [{ record: rolled }] = areaRecords(assess(['lga_blacktown', 'lga_penrith'], 'combined'));
    expect(p.series.filter(s => s.kind === 'actual')).toHaveLength(1);
    expect(p.rows.find(r => r.x === 2023)![p.series[0].key]).toBeCloseTo(crashRate(rolled.series, 2023)!, 9);
  });

  test('each distinct comparison group gets a median line, at most three', () => {
    const regions = assess(['lga_blacktown', 'lga_newcastle', 'lga_wollongong', 'lga_cessnock', 'lga_tamworth'], 'separate', 'region');
    const labels = new Set(regions.areas.map(x => x.universeLabel));
    expect(labels.size).toBeGreaterThan(3);
    const d = trendData(regions);
    expect(d.medianLegend).toHaveLength(3);
    expect(d.omittedMedians).toBe(labels.size - 3);
    expect(d.panels[0].series.filter(s => s.kind === 'median')).toHaveLength(3);
  });

  test('an area without a trend is listed under the metric, and a metric no area has is left out', () => {
    const records = [
      ...NEEDS_SNAPSHOT.records,
      makeRecord('lga_test_pop_only', {
        name: 'Poponly', population: 50000,
        series: {
          populationHistory: [{ year: 2021, population: 50000 }, { year: 2022, population: 51000 }],
          population2041: 60000,
        },
      }),
    ];
    const only = trendData(assess(['lga_test_pop_only'], 'separate', 'nsw', records));
    expect(only.panels.map(p => p.id)).toEqual(['population']);
    const mixed = trendData(assess(['lga_blacktown', 'lga_test_pop_only'], 'separate', 'nsw', records));
    expect(mixed.panels.find(p => p.id === 'car_dependency')!.noData).toEqual(['Poponly']);
    expect(mixed.panels.find(p => p.id === 'population')!.noData).toEqual([]);
  });

  test('nothing to show gives a message', () => {
    const records = [makeRecord('lga_test_empty', { name: 'Emptyville' })];
    const none = trendData(assess(['lga_test_empty'], 'separate', 'nsw', records));
    expect(none.panels).toEqual([]);
    expect(none.message).toBe('No trend data for the selected areas.');
  });

  test('values are formatted as the indicators are', () => {
    expect(formatTrendValue('car_dependency', 83.77)).toBe('83.8%');
    expect(formatTrendValue('crash_rate', 20.384)).toBe('20.4 per 10,000');
    expect(formatTrendValue('population', 112.38)).toBe('112.4');
  });
});

// Growth against service

describe('growthServiceChartData', () => {
  test('a row per area with departures per 1,000 today and in 2041, the larger today first', () => {
    const data = growthServiceChartData(assess(['lga_blacktown', 'lga_newcastle']));
    expect(data.rows.map(r => r.name)).toEqual(['Newcastle', 'Blacktown']);
    for (const row of data.rows) {
      const g = growthVsService(record(row.id))!;
      expect(row.now).toBe(g.per1000Now);
      expect(row.in2041).toBe(g.per1000In2041);
    }
    expect(data.rows[1].nowText).toBe('32.5');
    expect(data.rows[1].in2041Text).toBe('25.9');
    expect(data.nowLabel).toBe('Today (2025 population)');
    expect(data.axis.lo).toBe(0);
    expect(data.axis.hi).toBeGreaterThanOrEqual(42.7);
    expect(data.noData).toEqual([]);
    expect(data.message).toBeNull();
  });

  test('areas without the data are listed; the rest keep their rows', () => {
    const records = [...NEEDS_SNAPSHOT.records, makeRecord('lga_test_gap', { name: 'Gapville' })];
    const data = growthServiceChartData(assess(['lga_test_gap', 'lga_blacktown'], 'separate', 'nsw', records));
    expect(data.rows.map(r => r.name)).toEqual(['Blacktown']);
    expect(data.noData).toEqual(['Gapville']);
  });

  test('a combined area is one row', () => {
    const data = growthServiceChartData(assess(['lga_blacktown', 'lga_penrith'], 'combined'));
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].name).toBe('Blacktown + Penrith');
  });

  test('no data at all gives a message', () => {
    const records = [makeRecord('lga_test_gap', { name: 'Gapville' })];
    const data = growthServiceChartData(assess(['lga_test_gap'], 'separate', 'nsw', records));
    expect(data.rows).toEqual([]);
    expect(data.message).toBe('No AM-peak service or 2041 population projection data for the selected LGAs.');
  });

  test('the chart grows with the number of rows', () => {
    const one = growthServiceChartData(assess(['lga_blacktown'])).height;
    const many = growthServiceChartData(assess(GSYD_REGION)).height;
    expect(many).toBeGreaterThan(one + 20 * 30);
  });

  test('when areas differ in their latest ERP year the label says so', () => {
    const base = { amPeakDepartures: 1000, population2041: 120000 };
    const records = [
      makeRecord('lga_test_a', { name: 'A', series: { ...base, populationHistory: [{ year: 2025, population: 100000 }] } }),
      makeRecord('lga_test_b', { name: 'B', series: { ...base, populationHistory: [{ year: 2024, population: 100000 }] } }),
    ];
    expect(growthServiceChartData(assess(['lga_test_a', 'lga_test_b'], 'separate', 'nsw', records)).nowLabel)
      .toBe('Today (latest population estimate)');
  });
});

// Jobs-housing balance

describe('jobsHousingChartData', () => {
  const withJobs = NEEDS_SNAPSHOT.records.filter(r => jobsHousing(r) !== null);
  const withoutJobs = NEEDS_SNAPSHOT.records.filter(r => jobsHousing(r) === null);

  test('rows for areas with TZP24 data, the highest 2021 ratio first, with a row position each', () => {
    const data = jobsHousingChartData(assess(['lga_blacktown', 'lga_newcastle']));
    expect(data.rows.map(r => r.name)).toEqual(['Newcastle', 'Blacktown']);
    expect(data.rows.map(r => r.index)).toEqual([0, 1]);
    const j = jobsHousing(record('lga_newcastle'))!;
    expect(data.rows[0]).toMatchObject({ y2021: j.jobsPerResident2021, y2041: j.jobsPerResident2041, text2021: '0.75', text2041: '0.74' });
    expect(data.xAxis.lo).toBe(0);
    expect(data.xAxis.hi).toBeGreaterThanOrEqual(0.75);
    expect(data.noData).toEqual([]);
    expect(data.note).toBeNull();
  });

  test('the footnote counts the selected areas without TZP24 data', () => {
    expect(withoutJobs.length).toBeGreaterThan(3);
    const gap = withoutJobs.slice(0, 3).map(r => r.areaId);
    const data = jobsHousingChartData(assess(['lga_blacktown', ...gap]));
    expect(data.rows.map(r => r.name)).toEqual(['Blacktown']);
    expect(data.noData).toHaveLength(3);
    expect(data.note).toBe(
      `3 of 4 selected LGAs have no TZP24 job projections and are not shown: ${nameList(data.noData)}.`,
    );
  });

  test('no TZP24 data for any selected area gives the message', () => {
    const data = jobsHousingChartData(assess([withoutJobs[0].areaId]));
    expect(data.rows).toEqual([]);
    expect(data.message).toBe('No TZP24 job projections for the selected LGAs.');
  });

  test('every row has both values and the axis covers them', () => {
    const data = jobsHousingChartData(assess(withJobs.slice(0, 30).map(r => r.areaId)));
    expect(data.rows.length).toBe(30);
    for (const r of data.rows) {
      expect(r.y2021).toBeLessThanOrEqual(data.xAxis.hi); expect(r.y2041).toBeLessThanOrEqual(data.xAxis.hi);
    }
    // sorted descending by the 2021 ratio
    expect(data.rows.map(r => r.y2021)).toEqual([...data.rows.map(r => r.y2021)].sort((x, y) => y - x));
    expect(data.height).toBeGreaterThan(30 * 20);
  });

  test('a combined area is one row, or no row when a member has no data', () => {
    const [a, b] = withJobs.map(r => r.areaId);
    expect(jobsHousingChartData(assess([a, b], 'combined')).rows).toHaveLength(1);
    expect(jobsHousingChartData(assess([a, withoutJobs[0].areaId], 'combined')).rows).toEqual([]);
  });
});

// Shared text helpers

describe('nameList', () => {
  test('joins names the way a sentence does, and counts the rest past the limit', () => {
    expect(nameList(['A'])).toBe('A');
    expect(nameList(['A', 'B'])).toBe('A and B');
    expect(nameList(['A', 'B', 'C'])).toBe('A, B and C');
    expect(nameList(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], 6)).toBe('A, B, C, D, E, F and 2 more');
  });
});

describe('noDataNote', () => {
  test('counts the areas without data and names them', () => {
    expect(noDataNote(['A'], 3, 'TZP24 job projections')).toBe('1 of 3 selected LGAs has no TZP24 job projections and is not shown: A.');
    expect(noDataNote(['A', 'B'], 3, 'TZP24 job projections')).toBe('2 of 3 selected LGAs have no TZP24 job projections and are not shown: A and B.');
    expect(noDataNote([], 3, 'x')).toBeNull();
  });
});
