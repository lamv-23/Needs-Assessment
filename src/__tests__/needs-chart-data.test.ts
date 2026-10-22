import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { runAssessment } from '@/lib/needs/assess';
import {
  CATCHMENT_PANELS, HEATMAP_CATCHMENT_NOTE, HEATMAP_LABEL_CHARS, LABEL_LEVELS, assignLabelLevels,
  catchmentChartData, domainChartData, heatmapRowLabel, heatmapRowName, labelSide,
  axisFraction, niceAxis, stripData, wrapLabel,
} from '@/lib/needs/chart-data';
import { GREATER_SYDNEY_GCCSA_AREA_IDS } from '@/lib/data/sample-areas';
import { AREA_PALETTE_SIZE, DOMAIN_COLORS, areaColor, labelledIds } from '@/lib/needs/colors';
import { CATCHMENT_NOTE, DOMAIN_LABELS, INDICATORS, INDICATOR_BY_ID, NEED_DOMAINS } from '@/lib/needs/indicators';
import { CHART_COLORS } from '@/lib/utils';
import type { AreaAssessment, NeedsAssessment, NeedsMode, Universe } from '@/lib/needs/types';

const NSW_LGAS = NEEDS_SNAPSHOT.records.map(r => r.areaId);

function assess(areaIds: string[], mode: NeedsMode = 'separate'): NeedsAssessment {
  return runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds, mode, universe: 'nsw' });
}

/** The assessment with domain scores of one area replaced, as for an LGA with too little data. */
function withDomainScore(a: NeedsAssessment, index: number, domain: 'transport' | 'socio' | 'growth', score: number | null) {
  const areas: AreaAssessment[] = a.areas.map((area, i) => (i !== index ? area : {
    ...area,
    domains: area.domains.map(d => (d.domain === domain ? { ...d, score } : d)),
  }));
  return { ...a, areas };
}

describe('wrapLabel', () => {
  test('breaks at spaces and after hyphens', () => {
    expect(wrapLabel('Canterbury-Bankstown', 14, 3)).toEqual(['Canterbury-', 'Bankstown']);
    expect(wrapLabel('Blacktown + Penrith + Parramatta', 16, 3)).toEqual(['Blacktown +', 'Penrith +', 'Parramatta']);
  });

  test('keeps text that fits on one line', () => {
    expect(wrapLabel('Penrith', 14, 3)).toEqual(['Penrith']);
  });

  test('splits a word longer than a line', () => {
    expect(wrapLabel('Unincorporatedxyz', 8, 3)).toEqual(['Unincorp', 'oratedxy', 'z']);
  });

  test('ends the last line with an ellipsis when the text does not fit', () => {
    expect(wrapLabel('Alpha Bravo Charlie Delta Echo Foxtrot', 12, 2)).toEqual(['Alpha Bravo', 'Charlie…']);
    // the ellipsis never pushes the line past the limit
    expect(wrapLabel('Alpha Bravocharlie Delta', 12, 2)).toEqual(['Alpha', 'Bravocharli…']);
  });

  test('empty text gives no lines', () => {
    expect(wrapLabel('   ', 10, 2)).toEqual([]);
  });
});

describe('assignLabelLevels', () => {
  const box = (at: number, width = 80) => ({ at, width });

  test('well-separated names all sit on the first level', () => {
    expect(assignLabelLevels([box(100), box(300), box(500), box(640)])).toEqual([0, 0, 0, 0]);
  });

  test('names that would overprint move to different levels, and a level is reused once clear', () => {
    // 100, 130 and 160 all overlap; 260 starts (220) after the first name ends (140) plus padding
    expect(assignLabelLevels([box(100), box(130), box(160), box(260)])).toEqual([0, 1, 2, 0]);
  });

  test('a name needs a small gap, not just no overlap, to share a level', () => {
    // the first name ends at 140; the second starts at 146 (exactly the 6px padding) or at 145
    expect(assignLabelLevels([box(100), box(186)])).toEqual([0, 0]);
    expect(assignLabelLevels([box(100), box(185)])).toEqual([0, 1]);
  });

  test('narrow names pack closer than wide ones', () => {
    expect(assignLabelLevels([box(100, 40), box(150, 40)])).toEqual([0, 0]);
    expect(assignLabelLevels([box(100, 80), box(150, 80)])).toEqual([0, 1]);
  });

  test('a name that fits on no level is null, never overprinted', () => {
    expect(assignLabelLevels([box(100), box(100), box(100)], 2)).toEqual([0, 1, null]);
  });

  test('returns levels in the input order, not sorted order', () => {
    expect(assignLabelLevels([box(500), box(100), box(520)])).toEqual([0, 0, 1]);
  });

  test('empty input', () => {
    expect(assignLabelLevels([])).toEqual([]);
  });

  test('there are enough levels for six overlapping names', () => {
    expect(LABEL_LEVELS).toBeGreaterThanOrEqual(6);
    expect(assignLabelLevels(Array.from({ length: LABEL_LEVELS }, () => box(100)))).toEqual(
      Array.from({ length: LABEL_LEVELS }, (_, i) => i),
    );
  });
});

describe('niceAxis', () => {
  test('rounds out to steps of 1, 2 or 5 times a power of ten and lists every tick', () => {
    expect(niceAxis(2.2, 39.3)).toEqual({ lo: 0, hi: 40, ticks: [0, 10, 20, 30, 40] });
    expect(niceAxis(5, 5)).toEqual({ lo: 4.8, hi: 5.2, ticks: [4.8, 5, 5.2] }); // one value
  });

  test('stays within the limits it is given, so a share does not run past 0% or 100%', () => {
    expect(niceAxis(0, 99.5, { floor: 0, cap: 100 })).toEqual({ lo: 0, hi: 100, ticks: [0, 20, 40, 60, 80, 100] });
    expect(niceAxis(0, 1).lo).toBeLessThan(0); // without limits it leaves room below the data
  });

  test('always covers the data, with room at both ends', () => {
    for (const [min, max] of [[919, 1124], [15.2, 70.4], [-3.1, 8.8], [0.004, 0.019], [5, 5]]) {
      const { lo, hi, ticks } = niceAxis(min, max);
      expect(lo).toBeLessThan(min);
      expect(hi).toBeGreaterThan(max);
      expect(ticks[0]).toBe(lo);
      expect(ticks[ticks.length - 1]).toBe(hi);
      expect(ticks.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('ticks are free of floating-point noise', () => {
    expect(niceAxis(0.1, 0.7).ticks.every(t => String(t).length <= 4)).toBe(true);
  });
});

describe('axisFraction', () => {
  const axis = { lo: 0, hi: 40, ticks: [0, 10, 20, 30, 40] };
  test('is the position across the plot, mirrored when reversed', () => {
    expect(axisFraction(axis, false, 10)).toBe(0.25);
    expect(axisFraction(axis, true, 10)).toBe(0.75);
  });
});

describe('heatmapRowLabel', () => {
  test('every indicator fits the two-line row, without truncation', () => {
    for (const def of INDICATORS) {
      const { lines, hint } = heatmapRowLabel(def);
      expect(lines.length + (hint ? 1 : 0)).toBeLessThanOrEqual(2);
      expect(lines.some(l => l.endsWith('…'))).toBe(false);
      expect(lines.every(l => l.length <= HEATMAP_LABEL_CHARS)).toBe(true);
      expect(lines.join(' ').replace(/ \(context\)$/, '').replace(/- /g, '-')).toBe(heatmapRowName(def));
    }
  });

  test('a hint line appears exactly for scored indicators where a lower value means more need', () => {
    expect(heatmapRowLabel(INDICATOR_BY_ID.am_peak_departures_per_1000).hint).toBe('(lower value = more need)');
    expect(heatmapRowLabel(INDICATOR_BY_ID.car_dependency).hint).toBeNull();
    // A context row is unshaded, so its colour never runs against the number
    expect(heatmapRowLabel(INDICATOR_BY_ID.frequent_stop_share)).toEqual({
      lines: ['Stops with frequent AM-peak service', '(context)'], hint: null,
    });
  });

  test('the catchment rows have short names that keep AM-peak (P2-R17); the heatmap notes define them', () => {
    expect(heatmapRowLabel(INDICATOR_BY_ID.frequent_service_catchment)).toEqual({
      lines: ['Near frequent AM-peak public transport'], hint: '(lower value = more need)',
    });
    expect(heatmapRowName(INDICATOR_BY_ID.any_service_catchment)).toBe('Near any AM-peak public transport');
    expect(heatmapRowName(INDICATOR_BY_ID.car_dependency)).toBe('Car dependency');
    // The heatmap notes are the shared catchment note, wrapped to the legend
    expect(HEATMAP_CATCHMENT_NOTE.join(' ').replace(/- /g, '-')).toBe(CATCHMENT_NOTE);
    expect(HEATMAP_CATCHMENT_NOTE.join(' ')).toContain('straight-line');
    // Each note line fits the 700 px legend at 11 px
    for (const line of HEATMAP_CATCHMENT_NOTE) expect(line.length).toBeLessThanOrEqual(110);
  });

  test('an unscored indicator is marked as context', () => {
    expect(heatmapRowLabel(INDICATOR_BY_ID.indigenous_share).lines.join(' ')).toMatch(/\(context\)$/);
    expect(heatmapRowLabel(INDICATOR_BY_ID.unemployment_rate).lines.join(' ')).not.toMatch(/context/);
  });
});

describe('labelSide', () => {
  test('the left-hand line labels to its left and the right-hand line to its right, away from each other', () => {
    expect(labelSide(0.3, 0.5)).toBe('left');
    expect(labelSide(0.5, 0.3)).toBe('right');
  });

  test('a label that would run off the near edge goes the other way', () => {
    expect(labelSide(0.05, 0.5)).toBe('right');
    expect(labelSide(0.95, 0.5)).toBe('left');
  });

  test('a lone line labels toward the middle of the plot', () => {
    expect(labelSide(0.2, null)).toBe('right');
    expect(labelSide(0.8, null)).toBe('left');
  });
});

describe('domainChartData', () => {
  const a = assess(['lga_blacktown', 'lga_sydney']);
  const { rows, series, height } = domainChartData(a);

  test('one row per domain, labelled with the domain name, in domain order', () => {
    expect(rows.map(r => r.name)).toEqual(NEED_DOMAINS.map(d => DOMAIN_LABELS[d]));
  });

  test('one series per area in selection order, in the shared area colours, then Greater Sydney', () => {
    expect(series.map(s => s.name)).toEqual(['Blacktown', 'City of Sydney', 'Greater Sydney']);
    expect(series.map(s => s.color).slice(0, 2)).toEqual([areaColor(0), areaColor(1)]);
    expect(new Set(series.map(s => s.key)).size).toBe(3);
  });

  test('row values are the unrounded domain scores (labels floor them at render time)', () => {
    const blacktown = a.areas[0];
    NEED_DOMAINS.forEach((domain, i) => {
      expect(rows[i][series[0].key]).toBe(blacktown.domains.find(d => d.domain === domain)!.score);
      expect(rows[i][series[2].key]).toBe(a.benchmarks.gsyd.domains.find(d => d.domain === domain)!.score);
    });
  });

  test('a missing domain score stays null, never 0', () => {
    const gap = withDomainScore(a, 0, 'growth', null);
    const growthRow = domainChartData(gap).rows[2];
    expect(growthRow[series[0].key]).toBeNull();
  });

  test('taller with more areas', () => {
    expect(domainChartData(assess(NSW_LGAS.slice(0, 5))).height).toBeGreaterThan(height);
  });

  test('up to the palette size every area keeps its own colour, grouped by domain', () => {
    const ten = domainChartData(assess(NSW_LGAS.slice(0, AREA_PALETTE_SIZE)));
    expect(ten.layout).toBe('by-domain');
    expect(ten.rows).toHaveLength(NEED_DOMAINS.length);
    // ten areas, ten different colours, then the Greater Sydney reference
    expect(new Set(ten.series.slice(0, AREA_PALETTE_SIZE).map(s => s.color)).size).toBe(AREA_PALETTE_SIZE);
    expect(domainChartData(a).layout).toBe('by-domain');
  });
});

describe('domainChartData: Greater Sydney only where it is ranked in the same group (R61)', () => {
  const inUniverse = (areaIds: string[], universe: Universe) =>
    runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds, mode: 'separate', universe });
  const names = (a: NeedsAssessment) => domainChartData(a).series.map(s => s.name);

  test('drawn against NSW and Greater Sydney', () => {
    expect(names(inUniverse(['lga_blacktown'], 'nsw'))).toEqual(['Blacktown', 'Greater Sydney']);
    expect(names(inUniverse(['lga_blacktown'], 'gsyd'))).toEqual(['Blacktown', 'Greater Sydney']);
  });

  test('left out against a region or peer group, whose scores are not on the benchmark\'s NSW scale', () => {
    expect(names(inUniverse(['lga_blacktown'], 'region'))).toEqual(['Blacktown']);
    expect(names(inUniverse(['lga_blacktown', 'lga_newcastle'], 'peer'))).toEqual(['Blacktown', 'Newcastle']);
  });

  test('the by-area layout has no Greater Sydney row then', () => {
    const many = domainChartData(inUniverse(NSW_LGAS.slice(0, AREA_PALETTE_SIZE + 1), 'region'));
    expect(many.layout).toBe('by-area');
    expect(many.rows.map(r => r.name)).not.toContain('Greater Sydney');
    expect(many.rows).toHaveLength(AREA_PALETTE_SIZE + 1);
    expect(many.benchmarkName).toBeNull();
  });
});

describe('domainChartData for more areas than colours', () => {
  const eleven = assess(NSW_LGAS.slice(0, AREA_PALETTE_SIZE + 1));
  const sydney34 = assess(GREATER_SYDNEY_GCCSA_AREA_IDS);

  test('switches to one row per area, named, with Greater Sydney last', () => {
    const d = domainChartData(eleven);
    expect(d.layout).toBe('by-area');
    expect(d.rows.map(r => r.name)).toEqual([...eleven.areas.map(x => x.name), 'Greater Sydney']);
    expect(d.benchmarkName).toBe('Greater Sydney');
  });

  test('a bar per domain, coloured by domain (three distinct palette colours), in domain order', () => {
    const { series } = domainChartData(eleven);
    expect(series.map(s => s.key)).toEqual(NEED_DOMAINS);
    expect(series.map(s => s.name)).toEqual(NEED_DOMAINS.map(d => DOMAIN_LABELS[d]));
    expect(series.map(s => s.color)).toEqual(NEED_DOMAINS.map(d => DOMAIN_COLORS[d]));
    expect(new Set(series.map(s => s.color)).size).toBe(3);
    expect(series.every(s => CHART_COLORS.includes(s.color))).toBe(true);
  });

  test('row values are the unrounded domain scores, null where there is none', () => {
    const gap = withDomainScore(eleven, 2, 'socio', null);
    const { rows } = domainChartData(gap);
    NEED_DOMAINS.forEach(domain => {
      if (domain === 'socio') return;
      expect(rows[2][domain]).toBe(gap.areas[2].domains.find(d => d.domain === domain)!.score);
    });
    expect(rows[2].socio).toBeNull();
    expect(rows[eleven.areas.length].transport).toBe(
      eleven.benchmarks.gsyd.domains.find(d => d.domain === 'transport')!.score,
    );
  });

  test('all of Greater Sydney: 34 named rows plus the benchmark, about 1,700 px not 2,300', () => {
    expect(GREATER_SYDNEY_GCCSA_AREA_IDS.length).toBeGreaterThan(30);
    const d = domainChartData(sydney34);
    expect(d.layout).toBe('by-area');
    expect(d.rows).toHaveLength(sydney34.areas.length + 1);
    const names = d.rows.map(r => r.name);
    expect(new Set(names).size).toBe(names.length); // the axis keys rows by name
    expect(d.height).toBeLessThan(1800);
    expect(d.height).toBeGreaterThan(d.rows.length * 30);
  });

  test('area names are unique across NSW, which the by-area axis relies on', () => {
    const names = NEEDS_SNAPSHOT.records.map(r => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('stripData', () => {
  const a = assess(['lga_blacktown', 'lga_sydney']);

  test('selected areas are coloured by selection position and excluded from the grey dots', () => {
    const s = stripData(a, 'zero_car_households');
    expect(s.selected.map(p => p.name)).toEqual(['Blacktown', 'City of Sydney']);
    expect(s.selected.map(p => p.color)).toEqual([areaColor(0), areaColor(1)]);
    expect(s.others.map(p => p.id)).not.toContain('lga_blacktown');
    expect(s.others.length + 2).toBe(NEEDS_SNAPSHOT.records.filter(r => r.values.zero_car_households.value !== null).length);
  });

  test('more need is always to the right: only indicators where lower means more need are reversed', () => {
    expect(stripData(a, 'zero_car_households').reversed).toBe(false);
    expect(stripData(a, 'frequent_stop_share').reversed).toBe(true);
    for (const id of ['car_dependency', 'seifa_irsd', 'am_peak_departures_per_1000'] as const) {
      expect(stripData(a, id).reversed).toBe(INDICATOR_BY_ID[id].direction === 'lower');
    }
  });

  test('only the first 12 selected areas are named', () => {
    const many = assess(NSW_LGAS.slice(0, 20));
    const s = stripData(many, 'zero_car_households', 100000); // wide enough that no name collides
    expect(s.selected).toHaveLength(20);
    const named = s.selected.filter(p => p.level !== null).map(p => p.id);
    expect(named).toEqual(labelledIds(many.areas.map(x => x.areaId)));
    expect(s.unnamedCount).toBe(8);
  });

  test('the axis covers every dot and reference line', () => {
    const s = stripData(assess(['lga_blacktown', 'lga_sydney']), 'car_dependency');
    const xs = [...s.others, ...s.selected, ...s.references].map(p => p.x);
    expect(s.axis.lo).toBeLessThan(Math.min(...xs));
    expect(s.axis.hi).toBeGreaterThan(Math.max(...xs));
  });

  test('benchmark lines carry the aggregate value, flagged approximate for weighted indicators', () => {
    const s = stripData(a, 'car_dependency');
    expect(s.references.map(r => r.key)).toEqual(['gsyd', 'nsw']);
    expect(s.references[0].x).toBe(a.benchmarks.gsyd.indicators.find(i => i.id === 'car_dependency')!.value);
    expect(s.references[0].text).toMatch(/^≈ /);
    expect(stripData(a, 'zero_car_households').references[0].text).not.toMatch(/≈/);
  });

  test('a benchmark line from only some of its LGAs is marked *, with the note under the plot (R58)', () => {
    const a = runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds: ['lga_camden'], mode: 'separate', universe: 'nsw' });
    const jobs = stripData(a, 'job_growth_2041');
    expect(jobs.references.map(r => r.text.endsWith('*'))).toEqual([false, true]);
    expect(jobs.notes).toEqual(['* Based on the 43 of 128 LGAs with data.']);
    const commute = stripData(a, 'commute_distance_km');
    expect(commute.references.every(r => r.text.endsWith('*'))).toBe(true);
    expect(commute.notes).toEqual([
      '* Average commuting distance, Greater Sydney: based on the 33 of 34 LGAs with data.',
      '* Average commuting distance, NSW: based on the 127 of 128 LGAs with data.',
    ]);
    expect(stripData(a, 'car_dependency').notes).toEqual([]);
  });

  test('combined mode plots the one combined area, with its approximate value marked', () => {
    const s = stripData(assess(['lga_blacktown', 'lga_sydney'], 'combined'), 'car_dependency');
    expect(s.selected).toHaveLength(1);
    expect(s.selected[0].name).toBe('Blacktown + City of Sydney');
    expect(s.selected[0].text).toMatch(/^≈ /);
    // member LGAs stay in the grey cloud
    expect(s.others.map(p => p.id)).toEqual(expect.arrayContaining(['lga_blacktown', 'lga_sydney']));
  });

  test('a selected area with no value is listed, not plotted at 0', () => {
    const base = assess(['lga_blacktown', 'lga_sydney']);
    const areas = base.areas.map((area, i) => (i !== 1 ? area : {
      ...area,
      indicators: area.indicators.map(ind => (ind.id === 'crash_rate' ? { ...ind, value: null, percentile: null } : ind)),
    }));
    const s = stripData({ ...base, areas }, 'crash_rate');
    expect(s.selected.map(p => p.name)).toEqual(['Blacktown']);
    expect(s.noData).toEqual(['City of Sydney']);
  });

  test('names that cannot be placed without overprinting are left unnamed', () => {
    const base = assess(['lga_blacktown']);
    const copies: AreaAssessment[] = Array.from({ length: LABEL_LEVELS + 1 }, (_, i) => ({ ...base.areas[0], areaId: `c${i}`, name: `Copy ${i}` }));
    const s = stripData({ ...base, areas: copies }, 'unemployment_rate');
    expect(s.selected).toHaveLength(LABEL_LEVELS + 1);
    expect(s.selected.filter(p => p.level !== null)).toHaveLength(LABEL_LEVELS);
    expect(s.unnamedCount).toBe(1);
  });

  test('a narrower plot leaves less room for names', () => {
    const two = assess(['lga_blacktown', 'lga_sydney']);
    const wide = stripData(two, 'zero_car_households', 2000).selected.map(p => p.level);
    const narrow = stripData(two, 'zero_car_households', 60).selected.map(p => p.level);
    expect(wide).toEqual([0, 0]);
    expect(narrow[0]).not.toBe(narrow[1]);
  });

  test('names whose values coincide are put on different levels so they do not overprint', () => {
    const base = assess(['lga_blacktown']);
    const twin: AreaAssessment = { ...base.areas[0], areaId: 'twin', name: 'Twin' };
    const s = stripData({ ...base, areas: [base.areas[0], twin] }, 'unemployment_rate');
    expect(s.selected.map(p => p.x)[0]).toBe(s.selected.map(p => p.x)[1]);
    expect(s.selected[0].level).not.toBe(s.selected[1].level);
  });
});

describe('catchmentChartData', () => {
  test('one panel per measure, a bar per selected LGA, Greater Sydney and NSW as reference lines', () => {
    const data = catchmentChartData(assess(['lga_blacktown', 'lga_penrith']));
    expect(data.panels.map(p => p.id)).toEqual(['frequent_service_catchment', 'any_service_catchment']);
    expect(data.panels.map(p => p.title)).toEqual(CATCHMENT_PANELS.map(p => p.title));
    const [frequent, any] = data.panels;
    expect(frequent.bars.map(b => [b.name, b.text])).toEqual([['Blacktown', '59.4%'], ['Penrith', '40.7%']]);
    expect(any.bars.map(b => b.text)).toEqual(['95.0%', '90.2%']);
    expect(frequent.references.map(r => [r.key, r.name, r.text])).toEqual([
      ['gsyd', 'Greater Sydney', '67.2%'], ['nsw', 'NSW', '46.8%'],
    ]);
    expect(any.references.map(r => r.text)).toEqual(['93.5%', '81.2%']);
    expect(data.axis).toEqual({ lo: 0, hi: 100, ticks: [0, 20, 40, 60, 80, 100] });
    expect(data.noData).toEqual([]);
    expect(data.notes).toEqual([]);
  });

  test('a combined selection is one bar, its residents summed', () => {
    const data = catchmentChartData(assess(['lga_blacktown', 'lga_penrith'], 'combined'));
    expect(data.panels[0].bars.map(b => b.name)).toEqual(['Blacktown + Penrith']);
    const value = data.panels[0].bars[0].value!;
    expect(value).toBeGreaterThan(40.7);
    expect(value).toBeLessThan(59.4);
  });

  test('a missing share is "No data", never 0', () => {
    const a = assess(['lga_blacktown']);
    const areas = a.areas.map(area => ({
      ...area,
      indicators: area.indicators.map(s => (s.id === 'frequent_service_catchment' ? { ...s, value: null } : s)),
    }));
    const data = catchmentChartData({ ...a, areas });
    expect(data.panels[0].bars[0]).toMatchObject({ value: null, text: 'No data' });
    expect(data.noData).toEqual(['Blacktown']);
  });

  test('the panels say what frequent and any service are: weekday 7-9am departures', () => {
    expect(CATCHMENT_PANELS.map(panel => panel.title)).toEqual([
      'Near frequent service (8+ weekday 7-9am departures)', 'Near any service (1+ weekday 7-9am departures)',
    ]);
  });
});
