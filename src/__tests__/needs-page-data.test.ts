import * as fs from 'fs';
import * as path from 'path';
import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { runAssessment } from '@/lib/needs/assess';
import { partialBenchmarkNotes, partialBenchmarks } from '@/lib/needs/coverage';
import { CATCHMENT_NOTE, INDICATOR_BY_ID, INDICATORS, SOURCES } from '@/lib/needs/indicators';
import { buildInsights, WFH_CAVEAT_CITATION } from '@/lib/needs/insights';
import { buildNarrative } from '@/lib/needs/narrative';
import {
  CATCHMENT_TITLE, citationSegments, comparisonLabel, figureCaption, formatNeedsDate, indicatorCellText, indicatorTable,
  GROWTH_SERVICE_CAPTION, indicatorTableNote, JOBS_HOUSING_CAPTION, mismatchCaption, NEEDS_SOURCES, sameSelection,
  SA2_TABLE_SIZE, sa2Table, sourceNumber, stripIndicatorIds, trendsCaption,
} from '@/lib/needs/page-data';
import { rankSa2s } from '@/lib/needs/sa2';
import type { AreaAssessment, IndicatorId, IndicatorScore, NeedsMode, Sa2NeedsFile, Universe } from '@/lib/needs/types';
import { SA2_POCKETS_FILE } from './fixtures/sa2-pockets';

const score = (id: IndicatorId, overrides: Partial<IndicatorScore> = {}): IndicatorScore => ({
  id, value: 1, percentile: 50, rank: 64, ranked: 128, unranked: false, keyNeed: false, approximate: false, partial: false,
  ...overrides,
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
    // P2-R4: the metro predictor is the frequent-service catchment
    expect(mismatchCaption(assess(['lga_blacktown']))).toBe(short(SOURCES.g62, SOURCES.catchments));
    expect(mismatchCaption(assess(['lga_newcastle']))).toBe(short(SOURCES.g62, SOURCES.g01));
    expect(mismatchCaption(assess(['lga_blacktown', 'lga_newcastle'])))
      .toBe(short(SOURCES.g62, SOURCES.catchments, SOURCES.g01));
    // The same either way round; a combined area spanning both settings has no chart, only car dependency's source
    expect(mismatchCaption(assess(['lga_newcastle', 'lga_blacktown'])))
      .toBe(short(SOURCES.g62, SOURCES.catchments, SOURCES.g01));
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
    expect(trendsCaption(assess(['lga_blacktown']))).toBe(short(
      SOURCES.b46, SOURCES.g59, SOURCES.g62, SOURCES.crashes, SOURCES.erp, SOURCES.populationProjections,
    ));
    expect(GROWTH_SERVICE_CAPTION).toBe(short(SOURCES.gtfs, SOURCES.erp, SOURCES.populationProjections));
    expect(JOBS_HOUSING_CAPTION).toBe(short(SOURCES.employmentProjections, SOURCES.erp, SOURCES.populationProjections));
  });

  test('the trends figure cites the Census table of each car dependency year it draws (R59)', () => {
    // Canterbury-Bankstown was formed in 2016, so its car dependency starts then and the panel has no 2011 point
    const cb = assess(['lga_canterbury_bankstown']);
    expect(cb.records.find(r => r.areaId === 'lga_canterbury_bankstown')!.series.carDependencyByYear.map(p => p.year))
      .toEqual([2016, 2021]);
    expect(trendsCaption(cb)).toBe(short(
      SOURCES.g59, SOURCES.g62, SOURCES.crashes, SOURCES.erp, SOURCES.populationProjections,
    ));
  });

  test('every caption source is one of the page\'s numbered sources', () => {
    const shorts = new Set(NEEDS_SOURCES.map(s => s.short));
    const trends = trendsCaption(assess(['lga_blacktown']));
    for (const caption of [trends, GROWTH_SERVICE_CAPTION, JOBS_HOUSING_CAPTION, mismatchCaption(assess(['lga_blacktown', 'lga_newcastle']))]) {
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
    expect(indicatorCellText(def, score('car_dependency', { value: 83.84, percentile: 91.96 }), 'area')).toBe('83.8% (p91)');
  });

  test('a percentile just under a threshold is not rounded up to it', () => {
    expect(indicatorCellText(def, score('car_dependency', { value: 50, percentile: 79.99 }), 'area')).toBe('50.0% (p79)');
  });

  test('prefixes an approximate value with ≈', () => {
    expect(indicatorCellText(def, score('car_dependency', { value: 70, percentile: 60, approximate: true }), 'area'))
      .toBe('≈ 70.0% (p60)');
  });

  test('a missing value reads "No data", never 0', () => {
    expect(indicatorCellText(def, score('car_dependency', { value: null, percentile: null }), 'area')).toBe('No data');
    expect(indicatorCellText(def, undefined, 'benchmark')).toBe('No data');
  });

  test('benchmark columns show the value without a percentile', () => {
    expect(indicatorCellText(def, score('car_dependency', { value: 66.3, percentile: 40 }), 'benchmark')).toBe('66.3%');
    expect(indicatorCellText(def, score('car_dependency', { value: 66.3, percentile: 40, approximate: true }), 'benchmark'))
      .toBe('≈ 66.3%');
  });

  test('a benchmark value from only some of its LGAs is marked * (R58)', () => {
    expect(indicatorCellText(def, score('car_dependency', { value: 30.2, partial: true }), 'benchmark')).toBe('30.2%*');
    expect(indicatorCellText(def, score('car_dependency', { value: 15.9, approximate: true, partial: true }), 'benchmark'))
      .toBe('≈ 15.9%*');
    // A combined area's partial values have their own note (R16), not the benchmark mark
    expect(indicatorCellText(def, score('car_dependency', { value: 70, percentile: 60, partial: true }), 'area'))
      .toBe('70.0% (p60)');
  });

  test('a value with fewer than 5 LGAs with data in the group is "not ranked" with the count (R58)', () => {
    const unranked = score('car_dependency', { value: 12.34, percentile: null, rank: null, ranked: 2, unranked: true });
    expect(indicatorCellText(def, unranked, 'area')).toBe('12.3% (not ranked, n = 2)');
  });

  test('a percentile of 0 is still shown', () => {
    expect(indicatorCellText(def, score('car_dependency', { value: 5, percentile: 0.4 }), 'area')).toBe('5.0% (p0)');
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

  test('the context-only indicators are marked "(context)" and keep their percentile', () => {
    const table = indicatorTable(assess(['lga_blacktown']));
    for (const id of ['indigenous_share', 'frequent_stop_share'] as const) {
      const context = table.rows.find(r => r.id === id)!;
      expect(context.label).toBe(`${INDICATOR_BY_ID[id].label} (context)`);
      expect(context.cells[0]).toMatch(/\(p\d+\)$/);
    }
    expect(table.rows.filter(r => r.label.includes('(context)'))).toHaveLength(2);
  });

  test('rows carry the source and domain of their indicator', () => {
    const row = indicatorTable(assess(['lga_blacktown'])).rows.find(r => r.id === 'crash_rate')!;
    expect(row.source).toBe(INDICATOR_BY_ID.crash_rate.source.short);
    expect(row.domain).toBe('transport');
  });

  test('no areas: only the benchmark columns', () => {
    expect(indicatorTable(assess([])).columns).toEqual(['Greater Sydney', 'NSW']);
  });

  test('benchmark values from only some of their LGAs are marked *, with a note each (R58)', () => {
    const table = indicatorTable(assess(['lga_camden']));
    const cells = (id: IndicatorId) => table.rows.find(r => r.id === id)!.cells;
    expect(cells('job_growth_2041')[2]).toMatch(/^\d+\.\d%\*$/);     // NSW: 43 of 128
    expect(cells('job_growth_2041')[1]).toMatch(/^\d+\.\d%$/);        // Greater Sydney: all 34
    expect(cells('commute_distance_km')[1]).toMatch(/^≈ \d+\.\d km\*$/);
    expect(cells('car_dependency')[2]).not.toContain('*');
    expect(table.notes).toEqual([
      '* Average commuting distance, Greater Sydney: based on the 33 of 34 LGAs with data.',
      '* Average commuting distance, NSW: based on the 127 of 128 LGAs with data.',
      '* Job growth 2021–41, NSW: based on the 43 of 128 LGAs with data.',
    ]);
  });

  test('an area not ranked on an indicator shows the count of LGAs with data (R58)', () => {
    const newcastle = runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds: ['lga_newcastle'], mode: 'separate', universe: 'region' });
    const job = indicatorTable(newcastle).rows.find(r => r.id === 'job_growth_2041')!;
    expect(job.cells[0]).toMatch(/^\d+\.\d% \(not ranked, n = 2\)$/);
  });
});

describe('partialBenchmarks and their notes (R58)', () => {
  test('one marked value: the plain note', () => {
    const jobs = partialBenchmarks(assess(['lga_camden']), ['job_growth_2041']);
    expect(jobs).toEqual([{ key: 'nsw', name: 'NSW', id: 'job_growth_2041', withData: 43, members: 128 }]);
    expect(partialBenchmarkNotes(jobs)).toEqual(['* Based on the 43 of 128 LGAs with data.']);
  });

  test('none: no note', () => {
    expect(partialBenchmarkNotes(partialBenchmarks(assess(['lga_camden']), ['car_dependency']))).toEqual([]);
  });

  test('Greater Sydney as the universe: the benchmarks are still marked against their own LGAs', () => {
    const gsyd = runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds: ['lga_camden'], mode: 'separate', universe: 'gsyd' });
    expect(partialBenchmarks(gsyd).map(p => `${p.key}:${p.id}:${p.withData}/${p.members}`)).toEqual([
      'gsyd:commute_distance_km:33/34', 'nsw:commute_distance_km:127/128', 'nsw:job_growth_2041:43/128',
    ]);
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

  test('the 15 indicator sources come first, then ABS ERP, the 2011 and 2016 travel to work tables and the WFH caveat', () => {
    expect(NEEDS_SOURCES).toHaveLength(19);
    expect(NEEDS_SOURCES.slice(-4)).toEqual([SOURCES.erp, SOURCES.b46, SOURCES.g59, WFH_CAVEAT_CITATION]);
  });

  test('P2-R13: no short name contains "; ", the separator of a figure caption\'s sources', () => {
    expect(NEEDS_SOURCES.filter(s => s.short.includes('; ')).map(s => s.short)).toEqual([]);
    expect(SOURCES.catchments.short).toBe('ABS Mesh Block Counts 2021 + TfNSW GTFS (straight-line catchments)');
  });

  test('P2-R17: the catchment figure title says AM-peak and straight-line distance', () => {
    expect(CATCHMENT_TITLE).toBe('Residents near AM-peak public transport (straight-line distance)');
  });

  test('P2-R3: the straight-line catchment source has a citation number, after TfNSW GTFS', () => {
    expect(sourceNumber(SOURCES.catchments)).toBe(sourceNumber(SOURCES.gtfs) + 1);
    expect(NEEDS_SOURCES).toContain(SOURCES.catchments);
  });

  test('the 2011 B46 and 2016 G59 tables have citation numbers (R59)', () => {
    expect(sourceNumber(SOURCES.b46)).toBeGreaterThan(0);
    expect(sourceNumber(SOURCES.g59)).toBeGreaterThan(0);
    expect(SOURCES.b46).toMatchObject({
      short: 'ABS Census 2011 B46',
      full: 'Australian Bureau of Statistics, 2011 Census of Population and Housing: Method of travel to work (B46)',
    });
    expect(SOURCES.g59).toMatchObject({
      short: 'ABS Census 2016 G59',
      full: 'Australian Bureau of Statistics, 2016 Census of Population and Housing: Method of travel to work (G59)',
    });
  });

  test('every source an insight or a narrative paragraph cites has a number, and every number is cited', () => {
    const selections: [string[], NeedsMode, Universe][] = [
      [['lga_blacktown', 'lga_newcastle', 'lga_sydney', 'lga_brewarrina'], 'separate', 'nsw'],
      [['lga_camden', 'lga_hills'], 'combined', 'gsyd'],
      [['lga_broken_hill', 'lga_bourke'], 'separate', 'region'],
      [['lga_canterbury_bankstown'], 'separate', 'gsyd'],
    ];
    const cited = selections.flatMap(([areaIds, mode, universe]) => {
      const a = runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds, mode, universe });
      return [...buildInsights(a), ...buildNarrative(a).flatMap(s => s.paragraphs)].flatMap(p => p.citations);
    });
    for (const source of cited) expect(sourceNumber(source)).toBeGreaterThan(0);
    expect(new Set(cited.map(s => s.full))).toEqual(new Set(NEEDS_SOURCES.map(s => s.full)));
  });
});

describe('sa2Table', () => {
  const table = (areaIds: string[], mode: NeedsMode = 'separate') => sa2Table(SA2_POCKETS_FILE, assess(areaIds, mode));

  test('the ranked SA2s of the selection, highest overall need first, each once; low-population SA2s are named in a note', () => {
    const { rows, notes } = table(['lga_blacktown', 'lga_cumberland'], 'combined');
    expect(rows.map(r => r.name)).toEqual([
      'Mount Druitt - Whalan', 'Lethbridge Park - Tregear', 'Blackett - Dharruk', 'Bidwill - Hebersham - Emerton',
      'Toongabbie - West',
    ]);
    expect(rows[4].lgas).toBe('Blacktown (71%), Cumberland (29%)');
    expect(notes[0]).toMatch(/^All 5 ranked SA2s in the selection, by overall SA2 need score\./);
    expect(notes[0]).toContain('ranked against the 50 NSW SA2s with 100 or more residents');
    expect(notes[1]).toBe('Not ranked (fewer than 100 residents, or no score): Prospect Reservoir.');
  });

  test('a row: band and floored score, rank among NSW SA2s (R57), domain scores and the frequent catchment', () => {
    const [row] = table(['lga_blacktown']).rows;
    const { assessment } = rankSa2s(SA2_POCKETS_FILE).byCode.get('116031317')!;
    const domain = (d: string) => String(Math.floor(assessment.domains.find(x => x.domain === d)!.score!));
    expect(row).toEqual({
      code: '116031317',
      name: 'Mount Druitt - Whalan',
      lgas: 'Blacktown (100%)',
      overall: `${assessment.band} (${Math.floor(assessment.overall!)})`,
      rank: 'ranks in the highest-need 2% of NSW SA2s',
      transport: domain('transport'),
      socio: domain('socio'),
      frequent: '50.0%',
    });
  });

  test('at most 10 rows, and the notes say so; the catchment note says straight-line distance', () => {
    const file = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data/sa2-needs.json'), 'utf-8')) as Sa2NeedsFile;
    const { rows, notes } = sa2Table(file, assess(['lga_blacktown']));
    expect(SA2_TABLE_SIZE).toBe(10);
    expect(rows).toHaveLength(10);
    expect(notes[0]).toMatch(/^The 10 highest-need of the 23 ranked SA2s in the selection/);
    expect(notes[1]).toBe('Not ranked (fewer than 100 residents, or no score): Prospect Reservoir.');
    expect(notes[2]).toBe(CATCHMENT_NOTE);
    expect(notes[2]).toMatch(/straight-line distance/i);
    expect(rows.map(r => r.name)).not.toContain('Prospect Reservoir');
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
