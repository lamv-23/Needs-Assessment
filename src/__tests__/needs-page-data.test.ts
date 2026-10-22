import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { runAssessment } from '@/lib/needs/assess';
import { INDICATOR_BY_ID, INDICATORS, SOURCES } from '@/lib/needs/indicators';
import { buildInsights, WFH_CAVEAT_CITATION } from '@/lib/needs/insights';
import { buildNarrative } from '@/lib/needs/narrative';
import {
  citationSegments, comparisonLabel, figureCaption, formatNeedsDate, indicatorCellText, indicatorExcelRows, indicatorTable,
  GROWTH_SERVICE_CAPTION, indicatorTableNote, JOBS_HOUSING_CAPTION, mismatchCaption, NEEDS_SOURCES, sameSelection,
  sourceNumber, stripIndicatorIds, TRENDS_CAPTION,
} from '@/lib/needs/page-data';
import type { AreaAssessment, IndicatorId, IndicatorScore, NeedsMode, Universe } from '@/lib/needs/types';

const score = (id: IndicatorId, overrides: Partial<IndicatorScore> = {}): IndicatorScore => ({
  id, value: 1, percentile: 50, rank: 64, ranked: 128, keyNeed: false, approximate: false, partial: false, ...overrides,
});

/** An area whose indicators carry the given percentiles (the rest have no data). */
function areaWith(percentiles: Partial<Record<IndicatorId, number | null>>): Pick<AreaAssessment, 'indicators'> {
  return {
    indicators: INDICATORS.map(def => {
      const percentile = percentiles[def.id];
      return percentile === undefined || percentile === null
        ? score(def.id, { value: null, percentile: null })
        : score(def.id, { percentile });
    }),
  };
}

const assess = (areaIds: string[], mode: 'separate' | 'combined' = 'separate') => (
  runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds, mode, universe: 'nsw' })
);

describe('figureCaption', () => {
  test('lists the distinct short source names in registry order, joined by "; "', () => {
    expect(figureCaption(['car_dependency', 'zero_car_households', 'frequent_stop_share', 'am_peak_departures_per_1000']))
      .toBe('ABS Census 2021 G62; ABS Census 2021 G34; TfNSW GTFS');
  });

  test('indicators that share a source are listed once', () => {
    expect(figureCaption(['older_residents', 'indigenous_share'])).toBe('ABS Census 2021 G01');
  });

  test('with no argument it covers every indicator', () => {
    const shorts = Array.from(new Set(INDICATORS.map(d => d.source.short)));
    expect(figureCaption()).toBe(shorts.join('; '));
  });
});

describe('insight figure captions', () => {
  const short = (...sources: Array<{ short: string }>) => sources.map(s => s.short).join('; ');

  test('the mismatch figure cites car dependency and the predictor of each setting drawn', () => {
    expect(mismatchCaption(assess(['lga_blacktown']))).toBe(short(SOURCES.g62, SOURCES.gtfs));
    expect(mismatchCaption(assess(['lga_newcastle']))).toBe(short(SOURCES.g62, SOURCES.g01));
    expect(mismatchCaption(assess(['lga_blacktown', 'lga_newcastle']))).toBe(short(SOURCES.g62, SOURCES.gtfs, SOURCES.g01));
    // The same either way round; a combined area spanning both settings has no chart, only car dependency's source
    expect(mismatchCaption(assess(['lga_newcastle', 'lga_blacktown']))).toBe(short(SOURCES.g62, SOURCES.gtfs, SOURCES.g01));
    expect(mismatchCaption(assess(['lga_blacktown', 'lga_newcastle'], 'combined'))).toBe(short(SOURCES.g62));
  });

  test('the mismatch caption covers the sources the mismatch findings cite', () => {
    for (const ids of [['lga_blacktown', 'lga_newcastle'], ['lga_camden', 'lga_hills'], ['lga_broken_hill', 'lga_bourke']]) {
      const a = assess(ids);
      const caption = mismatchCaption(a).split('; ');
      for (const insight of buildInsights(a).filter(i => i.kind === 'mismatch')) {
        for (const citation of insight.citations) expect(caption).toContain(citation.short);
      }
    }
  });

  test('the trends, growth and jobs figures name their sources once each', () => {
    expect(TRENDS_CAPTION).toBe(short(
      SOURCES.g62, SOURCES.crashes, SOURCES.erp, SOURCES.populationProjections,
    ));
    expect(GROWTH_SERVICE_CAPTION).toBe(short(SOURCES.gtfs, SOURCES.erp, SOURCES.populationProjections));
    expect(JOBS_HOUSING_CAPTION).toBe(short(SOURCES.employmentProjections, SOURCES.erp, SOURCES.populationProjections));
  });

  test('every caption source is one of the page\'s numbered sources', () => {
    const shorts = new Set(NEEDS_SOURCES.map(s => s.short));
    for (const caption of [TRENDS_CAPTION, GROWTH_SERVICE_CAPTION, JOBS_HOUSING_CAPTION, mismatchCaption(assess(['lga_blacktown', 'lga_newcastle']))]) {
      for (const name of caption.split('; ')) expect(shorts).toContain(name);
    }
  });
});

describe('stripIndicatorIds', () => {
  test('picks the scored indicators with the highest maximum percentile, highest first', () => {
    const a = areaWith({ car_dependency: 90, crash_rate: 20, seifa_irsd: 70 });
    const b = areaWith({ car_dependency: 10, crash_rate: 95, unemployment_rate: 60, older_residents: 30 });
    expect(stripIndicatorIds([a, b], 3)).toEqual(['crash_rate', 'car_dependency', 'seifa_irsd']);
  });

  test('ties keep the registry order', () => {
    const a = areaWith({ older_residents: 50, car_dependency: 50, pop_growth_2041: 50, crash_rate: 50 });
    expect(stripIndicatorIds([a], 3)).toEqual(['car_dependency', 'crash_rate', 'older_residents']);
  });

  test('the context-only indicator never headlines, however high its percentile', () => {
    const a = areaWith({ indigenous_share: 99, car_dependency: 1 });
    const ids = stripIndicatorIds([a], 6);
    expect(ids).not.toContain('indigenous_share');
    expect(ids[0]).toBe('car_dependency');
  });

  test('indicators with no percentile anywhere rank last but still fill the count', () => {
    const a = areaWith({ crash_rate: 40 });
    const ids = stripIndicatorIds([a], 6);
    expect(ids).toHaveLength(6);
    expect(ids[0]).toBe('crash_rate');
    expect(new Set(ids).size).toBe(6);
  });

  test('defaults to six indicators', () => {
    expect(stripIndicatorIds([areaWith({ crash_rate: 40 })])).toHaveLength(6);
  });
});

describe('indicatorCellText', () => {
  const def = INDICATOR_BY_ID.car_dependency;

  test('shows the value with the floored percentile', () => {
    expect(indicatorCellText(def, score('car_dependency', { value: 83.84, percentile: 91.96 }), true)).toBe('83.8% (p91)');
  });

  test('a percentile just under a threshold is not rounded up to it', () => {
    expect(indicatorCellText(def, score('car_dependency', { value: 50, percentile: 79.99 }), true)).toBe('50.0% (p79)');
  });

  test('prefixes an approximate value with ≈', () => {
    expect(indicatorCellText(def, score('car_dependency', { value: 70, percentile: 60, approximate: true }), true))
      .toBe('≈ 70.0% (p60)');
  });

  test('a missing value reads "No data", never 0', () => {
    expect(indicatorCellText(def, score('car_dependency', { value: null, percentile: null }), true)).toBe('No data');
    expect(indicatorCellText(def, undefined, false)).toBe('No data');
  });

  test('benchmark columns show the value without a percentile', () => {
    expect(indicatorCellText(def, score('car_dependency', { value: 66.3, percentile: 40 }), false)).toBe('66.3%');
    expect(indicatorCellText(def, score('car_dependency', { value: 66.3, percentile: 40, approximate: true }), false))
      .toBe('≈ 66.3%');
  });

  test('a percentile of 0 is still shown', () => {
    expect(indicatorCellText(def, score('car_dependency', { value: 5, percentile: 0.4 }), true)).toBe('5.0% (p0)');
  });
});

describe('indicatorTable', () => {
  test('separate mode: one column per area, then Greater Sydney, then NSW', () => {
    const table = indicatorTable(assess(['lga_blacktown', 'lga_penrith']));
    expect(table.columns).toEqual(['Blacktown', 'Penrith', 'Greater Sydney', 'NSW']);
    expect(table.rows).toHaveLength(INDICATORS.length);
    for (const row of table.rows) expect(row.cells).toHaveLength(4);
  });

  test('area cells carry a percentile, benchmark cells do not', () => {
    const table = indicatorTable(assess(['lga_blacktown']));
    const row = table.rows.find(r => r.id === 'car_dependency')!;
    expect(row.cells[0]).toMatch(/^\d+\.\d% \(p\d+\)$/);
    expect(row.cells[1]).toMatch(/^≈? ?\d+\.\d%$/);
    expect(row.cells[2]).toMatch(/^≈? ?\d+\.\d%$/);
  });

  test('combined mode: one column named for the selection, with ≈ on SEIFA', () => {
    const table = indicatorTable(assess(['lga_blacktown', 'lga_penrith'], 'combined'));
    expect(table.columns).toEqual(['Blacktown + Penrith', 'Greater Sydney', 'NSW']);
    const seifa = table.rows.find(r => r.id === 'seifa_irsd')!;
    expect(seifa.cells[0].startsWith('≈ ')).toBe(true);
  });

  test('the context-only indicator is marked "(context)" and keeps its percentile', () => {
    const table = indicatorTable(assess(['lga_blacktown']));
    const context = table.rows.find(r => r.id === 'indigenous_share')!;
    expect(context.label).toBe(`${INDICATOR_BY_ID.indigenous_share.label} (context)`);
    expect(context.cells[0]).toMatch(/\(p\d+\)$/);
    expect(table.rows.filter(r => r.label.includes('(context)'))).toHaveLength(1);
  });

  test('rows carry the source and domain of their indicator', () => {
    const row = indicatorTable(assess(['lga_blacktown'])).rows.find(r => r.id === 'crash_rate')!;
    expect(row.source).toBe(INDICATOR_BY_ID.crash_rate.source.short);
    expect(row.domain).toBe('transport');
  });

  test('no areas: only the benchmark columns', () => {
    expect(indicatorTable(assess([])).columns).toEqual(['Greater Sydney', 'NSW']);
  });
});

describe('indicatorExcelRows', () => {
  test('one record per indicator: indicator, a key per column, source', () => {
    const table = indicatorTable(assess(['lga_blacktown']));
    const rows = indicatorExcelRows(table);
    expect(rows).toHaveLength(INDICATORS.length);
    expect(Object.keys(rows[0])).toEqual(['indicator', 'Blacktown', 'Greater Sydney', 'NSW', 'source']);
    expect(rows[0].indicator).toBe(table.rows[0].label);
    expect(rows[0].Blacktown).toBe(table.rows[0].cells[0]);
    expect(rows[0].source).toBe(table.rows[0].source);
  });
});

describe('sources', () => {
  test('are unique on the full reference, in registry order, numbered from 1', () => {
    expect(new Set(NEEDS_SOURCES.map(s => s.full)).size).toBe(NEEDS_SOURCES.length);
    expect(NEEDS_SOURCES[0].full).toBe(INDICATORS[0].source.full);
    expect(sourceNumber(INDICATORS[0].source)).toBe(1);
    expect(sourceNumber(NEEDS_SOURCES[NEEDS_SOURCES.length - 1])).toBe(NEEDS_SOURCES.length);
  });

  test('every indicator source has a number', () => {
    for (const def of INDICATORS) expect(sourceNumber(def.source)).toBeGreaterThan(0);
  });

  test('the 14 indicator sources come first, then ABS ERP and the WFH caveat', () => {
    expect(NEEDS_SOURCES).toHaveLength(16);
    expect(NEEDS_SOURCES.slice(-2)).toEqual([SOURCES.erp, WFH_CAVEAT_CITATION]);
  });

  test('every source an insight or a narrative paragraph cites has a number, and every number is cited', () => {
    const selections: [string[], NeedsMode, Universe][] = [
      [['lga_blacktown', 'lga_newcastle', 'lga_sydney', 'lga_brewarrina'], 'separate', 'nsw'],
      [['lga_camden', 'lga_hills'], 'combined', 'gsyd'],
      [['lga_broken_hill', 'lga_bourke'], 'separate', 'region'],
    ];
    const cited = selections.flatMap(([areaIds, mode, universe]) => {
      const a = runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds, mode, universe });
      return [...buildInsights(a), ...buildNarrative(a).flatMap(s => s.paragraphs)].flatMap(p => p.citations);
    });
    for (const source of cited) expect(sourceNumber(source)).toBeGreaterThan(0);
    expect(new Set(cited.map(s => s.full))).toEqual(new Set(NEEDS_SOURCES.map(s => s.full)));
  });
});

describe('citationSegments', () => {
  const span = (from: number, to = from) => ({ from, to });

  test('a run of three or more consecutive numbers becomes a range', () => {
    expect(citationSegments([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])).toEqual([span(1, 14)]);
    expect(citationSegments([1, 2, 3, 5])).toEqual([span(1, 3), span(5)]);
  });

  test('a pair of consecutive numbers stays two numbers', () => {
    expect(citationSegments([4, 5])).toEqual([span(4), span(5)]);
  });

  test('numbers are sorted ascending and de-duplicated', () => {
    expect(citationSegments([12, 10, 7, 10])).toEqual([span(7), span(10), span(12)]);
  });

  test('no numbers, no segments', () => {
    expect(citationSegments([])).toEqual([]);
  });
});

describe('comparisonLabel, indicatorTableNote and formatNeedsDate', () => {
  test('the comparison label lists each distinct universe label once', () => {
    expect(comparisonLabel([{ universeLabel: 'NSW LGAs' }, { universeLabel: 'NSW LGAs' }])).toBe('NSW LGAs');
    expect(comparisonLabel([{ universeLabel: 'NSW LGAs' }, { universeLabel: 'regional cities' }])).toBe('NSW LGAs, regional cities');
    expect(comparisonLabel([])).toBe('');
  });

  test('the table note names the comparison group and explains p80, the benchmarks and the approximation sign', () => {
    expect(indicatorTableNote('NSW LGAs')).toBe(
      "pNN is an area's need percentile within its comparison group (NSW LGAs): higher means more need, and p80 or above is a key need. "
      + 'Greater Sydney and NSW are shown as values only. ≈ marks a population-weighted estimate.',
    );
  });

  test('dates are shown in Sydney, day month year', () => {
    expect(formatNeedsDate('2026-10-22T11:41:24.610Z')).toBe('22 October 2026');
    // 14:00 UTC on 22 October is already 23 October in Sydney (AEDT).
    expect(formatNeedsDate('2026-10-22T14:00:00.000Z')).toBe('23 October 2026');
  });
});

describe('sameSelection', () => {
  const pick = (areaIds: string[], mode: 'separate' | 'combined' = 'separate', universe: 'nsw' | 'gsyd' | 'region' | 'peer' = 'nsw') => (
    runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds, mode, universe })
  );

  test('the same selection is the same even when it is a fresh assessment object', () => {
    const a = pick(['lga_blacktown', 'lga_penrith'], 'combined', 'peer');
    const b = pick(['lga_blacktown', 'lga_penrith'], 'combined', 'peer');
    expect(a).not.toBe(b);
    expect(sameSelection(a, b)).toBe(true);
  });

  test('an LGA added, removed or reordered is a different selection', () => {
    const base = pick(['lga_blacktown', 'lga_penrith']);
    expect(sameSelection(base, pick(['lga_blacktown', 'lga_penrith', 'lga_camden']))).toBe(false);
    expect(sameSelection(base, pick(['lga_blacktown']))).toBe(false);
    expect(sameSelection(base, pick(['lga_penrith', 'lga_blacktown']))).toBe(false);
    expect(sameSelection(base, pick([]))).toBe(false);
  });

  test('a different mode or comparison universe is a different selection', () => {
    const base = pick(['lga_blacktown', 'lga_penrith'], 'separate', 'nsw');
    expect(sameSelection(base, pick(['lga_blacktown', 'lga_penrith'], 'combined', 'nsw'))).toBe(false);
    expect(sameSelection(base, pick(['lga_blacktown', 'lga_penrith'], 'separate', 'gsyd'))).toBe(false);
  });

  test('the universe that was asked for counts, not the one a combined fallback used', () => {
    // Blacktown (outer metro) + Newcastle (regional city) span two peer groups, so "peer" falls back to NSW.
    const peer = pick(['lga_blacktown', 'lga_newcastle'], 'combined', 'peer');
    const nsw = pick(['lga_blacktown', 'lga_newcastle'], 'combined', 'nsw');
    expect(peer.universe).toBe('nsw');
    expect(sameSelection(peer, nsw)).toBe(false);
  });

  test('ids the page does not recognise are not part of the selection', () => {
    expect(sameSelection(pick(['lga_blacktown']), pick(['lga_blacktown', 'lga_nowhere']))).toBe(true);
  });
});
