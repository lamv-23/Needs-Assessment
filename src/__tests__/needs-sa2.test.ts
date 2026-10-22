import * as fs from 'fs';
import * as path from 'path';
import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { SA2_AREAS } from '@/lib/data/sa2-areas';
import { INDICATORS } from '@/lib/needs/indicators';
import {
  assessSa2s, extractSa2Indicators, isRankedSa2, rankSa2s, SA2_LOW_POPULATION, SA2_SHARE_THRESHOLD, sa2Pockets,
  sa2RankText, sa2sForLgas, topSa2s,
} from '@/lib/needs/sa2';
import { needPercentile } from '@/lib/needs/scoring';
import type { AreaAssessment, IndicatorId, Sa2Assessed, Sa2NeedsFile, Sa2Record } from '@/lib/needs/types';
import { SA2_POCKETS_FILE } from './fixtures/sa2-pockets';

const SA2_IDS = INDICATORS.filter(d => d.levels.includes('sa2')).map(d => d.id);

type Values = Partial<Record<IndicatorId, number | null>>;

function makeSa2(sa2Code: string, values: Values = {}, extra: Partial<Sa2Record> = {}): Sa2Record {
  return {
    sa2Code,
    name: `SA2 ${sa2Code}`,
    population: 5000,
    lowPopulation: false,
    nonSpatial: false,
    primaryLgaId: 'lga_a',
    lgaShares: [{ lgaId: 'lga_a', share: 1 }],
    values: Object.fromEntries(SA2_IDS.map(id => [id, { value: values[id] ?? null }])),
    ...extra,
  };
}

/** Six ranked SA2s whose every indicator takes the values 0..5. */
const ramp = (): Sa2Record[] =>
  Array.from({ length: 6 }, (_, i) => makeSa2(`1000000${i}`, Object.fromEntries(SA2_IDS.map(id => [id, i]))));

const file = (records: Sa2Record[]): Sa2NeedsFile => ({ generatedAt: '2026-10-23T00:00:00.000Z', records });
const byId = (a: AreaAssessment, id: IndicatorId) => a.indicators.find(s => s.id === id)!;

describe('assessSa2s', () => {
  test('SA2 assessments have no growth domain', () => {
    const [a] = assessSa2s(file(ramp()), ['10000005']);
    expect(a.domains.map(d => d.domain)).toEqual(['transport', 'socio']);
    expect(a.indicators.map(s => s.id)).toEqual(SA2_IDS);
    expect(a).toMatchObject({ areaId: '10000005', universe: 'nsw', universeLabel: 'NSW SA2s', universeSize: 6, peerGroup: null });
    expect(a.overall).not.toBeNull();
  });

  test('low-population SA2s are excluded from peers and get null percentiles', () => {
    const low = makeSa2('20000000', { car_dependency: 99, seifa_irsd: 1 }, { population: 40, lowPopulation: true });
    const [ranked, lowAssessed] = assessSa2s(file([...ramp(), low]), ['10000005', '20000000']);

    // 6 peers, not 7: the low-population SA2's extreme values do not move anyone's percentile
    expect(ranked.universeSize).toBe(6);
    expect(byId(ranked, 'car_dependency')).toMatchObject({ percentile: (5.5 * 100) / 6, rank: 1, ranked: 6 });

    // ranked is null too, so nothing can read "… of 623" for an SA2 that is not ranked
    expect(lowAssessed.indicators.every(s => s.percentile === null && s.rank === null && s.ranked === null && !s.keyNeed)).toBe(true);
    expect(byId(lowAssessed, 'car_dependency').value).toBe(99);   // the value is kept, only the ranking is withheld
    expect(lowAssessed.domains.every(d => d.score === null && d.band === null)).toBe(true);
    expect([lowAssessed.overall, lowAssessed.band]).toEqual([null, null]);
  });

  test('non-spatial SA2s are excluded from peers like low-population ones (P2-R7)', () => {
    const offshore = makeSa2('197979799', { car_dependency: 99 }, { nonSpatial: true, lgaShares: [], primaryLgaId: null });
    const [ranked, nonSpatial] = assessSa2s(file([...ramp(), offshore]), ['10000005', '197979799']);
    expect(ranked.universeSize).toBe(6);
    expect(nonSpatial.overall).toBeNull();
    expect(isRankedSa2(offshore)).toBe(false);
  });

  test('an SA2 with no LGA (Lord Howe Island) is ranked, with no region', () => {
    const lordHowe = makeSa2('108031161', { car_dependency: 2.5 }, { lgaShares: [], primaryLgaId: null });
    const [a] = assessSa2s(file([...ramp(), lordHowe]), ['108031161']);
    expect(a.universeSize).toBe(7);
    expect(byId(a, 'car_dependency').percentile).not.toBeNull();
    expect(a.region).toBe('');
  });

  test('the region is the primary LGA\'s; unknown and repeated codes are dropped', () => {
    const records = ramp().map(r => ({ ...r, primaryLgaId: 'lga_newcastle', lgaShares: [{ lgaId: 'lga_newcastle', share: 1 }] }));
    const assessed = assessSa2s(file(records), ['10000001', 'nope', '10000001']);
    expect(assessed.map(a => [a.areaId, a.region])).toEqual([['10000001', 'Hunter']]);
  });
});

describe('sa2sForLgas', () => {
  const split = makeSa2('30000001', {}, {
    name: 'Split', primaryLgaId: 'lga_a', lgaShares: [{ lgaId: 'lga_a', share: 0.85 }, { lgaId: 'lga_b', share: 0.15 }],
  });
  const sliver = makeSa2('30000002', {}, {
    name: 'Sliver', primaryLgaId: 'lga_a', lgaShares: [{ lgaId: 'lga_a', share: 0.95 }, { lgaId: 'lga_b', share: 0.05 }],
  });
  const onlyB = makeSa2('30000003', {}, { name: 'Bravo', primaryLgaId: 'lga_b', lgaShares: [{ lgaId: 'lga_b', share: 1 }] });
  const noLga = makeSa2('108031161', {}, { name: 'Lord Howe Island', primaryLgaId: null, lgaShares: [] });
  const low = makeSa2('30000004', {}, { name: 'Airport', population: 12, lowPopulation: true, primaryLgaId: 'lga_b', lgaShares: [{ lgaId: 'lga_b', share: 1 }] });
  const all = file([split, sliver, onlyB, noLga, low]);
  const codes = (records: Sa2Record[]) => records.map(r => r.sa2Code);

  test('sa2sForLgas applies the 10% share threshold and dedupes', () => {
    expect(SA2_SHARE_THRESHOLD).toBe(0.1);
    expect(codes(sa2sForLgas(all, ['lga_a', 'lga_b']))).toEqual(['30000004', '30000003', '30000002', '30000001']);
    expect(codes(sa2sForLgas(all, ['lga_b']))).toEqual(['30000004', '30000003', '30000001']);
    expect(codes(sa2sForLgas(all, ['lga_a']))).toEqual(['30000002', '30000001']);
    expect(codes(sa2sForLgas(all, ['lga_b'], 0.2))).toEqual(['30000004', '30000003']);
  });

  test('sorted by name; low-population SA2s are listed (shown as "Low population"), an SA2 with no LGA never is', () => {
    expect(sa2sForLgas(all, ['lga_a', 'lga_b']).map(r => r.name)).toEqual(['Airport', 'Bravo', 'Sliver', 'Split']);
    expect(sa2sForLgas(all, ['lga_a', 'lga_b', 'lga_lord_howe'])).not.toContainEqual(noLga);
    expect(sa2sForLgas(all, [])).toEqual([]);
  });
});

describe('rankSa2s', () => {
  test('ranks every ranked SA2 on its overall score: 1 is the highest need, ties share the better rank', () => {
    const tied = makeSa2('10000009', Object.fromEntries(SA2_IDS.map(id => [id, 5])), { name: 'Tied' });
    const ranking = rankSa2s(file([...ramp(), tied]));
    const overall = (code: string) => ranking.byCode.get(code)!.assessment.overall!;
    expect(ranking.ranked).toBe(7);
    expect(overall('10000009')).toBe(overall('10000005'));
    expect(ranking.byCode.get('10000005')!.overallRank).toBe(ranking.byCode.get('10000009')!.overallRank);
    const ranks = Array.from(ranking.byCode.values()).map(e => e.overallRank!).sort((a, b) => a - b);
    expect(ranks[0]).toBe(1);
    // The overall percentile is the mid-rank need percentile of the overall score among ranked SA2s
    for (const e of Array.from(ranking.byCode.values())) {
      const scores = Array.from(ranking.byCode.values()).map(x => x.assessment.overall!);
      expect(e.overallPercentile).toBeCloseTo(needPercentile(e.assessment.overall!, scores, 'higher'), 10);
    }
  });

  test('low-population and non-spatial SA2s have no overall rank or percentile and do not count', () => {
    const low = makeSa2('20000000', { car_dependency: 99 }, { population: 40, lowPopulation: true });
    const offshore = makeSa2('197979799', { car_dependency: 99 }, { nonSpatial: true, lgaShares: [], primaryLgaId: null });
    const ranking = rankSa2s(file([...ramp(), low, offshore]));
    expect(ranking.ranked).toBe(6);
    for (const code of ['20000000', '197979799']) {
      expect(ranking.byCode.get(code)).toMatchObject({ overallRank: null, overallPercentile: null });
    }
  });

  test('the pocket cut-off is floor(10% of ranked SA2s), and the ranking is worked out once per file', () => {
    const ranking = rankSa2s(SA2_POCKETS_FILE);
    expect(ranking).toMatchObject({ ranked: 50, pocketRank: 5 });
    expect(rankSa2s(SA2_POCKETS_FILE)).toBe(ranking);
    expect(ranking.byCode.get('116031317')!.overallRank).toBe(1);   // Mount Druitt - Whalan
    expect(ranking.byCode.get('124031458')!.overallRank).toBe(6);   // Colyton - Oxley Park
  });
});

describe('sa2Pockets and topSa2s', () => {
  const names = (entries: Sa2Assessed[]) => entries.map(e => e.record.name);

  test('pockets: an LGA\'s SA2s ranked in the highest-need 10%, highest first, at most 3', () => {
    expect(names(sa2Pockets(SA2_POCKETS_FILE, 'lga_blacktown')))
      .toEqual(['Mount Druitt - Whalan', 'Lethbridge Park - Tregear', 'Blackett - Dharruk']);
    expect(names(sa2Pockets(SA2_POCKETS_FILE, 'lga_blacktown', 10))).toHaveLength(4);
    expect(names(sa2Pockets(SA2_POCKETS_FILE, 'lga_penrith'))).toEqual(['St Marys - North St Marys']);
    expect(sa2Pockets(SA2_POCKETS_FILE, 'lga_mosman')).toEqual([]);
  });

  test('topSa2s: the ranked SA2s of the drill-down by overall score, each once; low-population SA2s left out', () => {
    const top = topSa2s(SA2_POCKETS_FILE, ['lga_blacktown', 'lga_cumberland'], 10);
    expect(names(top)).toEqual([
      'Mount Druitt - Whalan', 'Lethbridge Park - Tregear', 'Blackett - Dharruk', 'Bidwill - Hebersham - Emerton',
      'Toongabbie - West',
    ]);
    expect(names(topSa2s(SA2_POCKETS_FILE, ['lga_blacktown'], 2))).toEqual(['Mount Druitt - Whalan', 'Lethbridge Park - Tregear']);
  });

  test('sa2RankText follows R57: a share of NSW SA2s from 20 ranked, an ordinal below', () => {
    const ranking = rankSa2s(SA2_POCKETS_FILE);
    expect(sa2RankText(ranking.byCode.get('124031463')!, ranking)).toBe('ranks in the highest-need 10% of NSW SA2s');
    expect(sa2RankText(ranking.byCode.get('124031458')!, ranking)).toBe('ranks in the highest-need 12% of NSW SA2s');
    const small = rankSa2s(file(ramp()));
    expect(sa2RankText(small.byCode.get('10000005')!, small)).toBe('ranks 1st of 6 NSW SA2s');
    expect(sa2RankText(ranking.byCode.get('116031316')!, ranking)).toBeNull();   // Prospect Reservoir: low population
  });
});

describe('extractSa2Indicators', () => {
  /**
   * Blacktown LGA's decoded Census tables as cached (data/cache.db abs_cache, code 10750), trimmed to the fields the
   * indicators read, and its CATCHMENT_COVERAGE row. The SA2 tables have the same shapes, so running the SA2 extractor
   * over them must give the LGA snapshot's values: the SA2 indicators reuse the LGA formulas.
   */
  const BLACKTOWN: Record<string, unknown> = {
    G01: {
      totalPopulation: 396776, malePopulation: 197876, femalePopulation: 198905,
      ageGroups: {
        '0_4': 29907, '5_14': 60217, '15_19': 24375, '20_24': 26427, '25_34': 59261, '35_44': 67391, '45_54': 47563,
        '55_64': 37873, '65_74': 27022, '75_84': 12432, GE85: 4304,
      },
      indigenousPopulation: 11812,
    },
    G13: { englishOnly: 188793, limitedEnglish: 20903, total: 396776 },
    G18: { needsAssistance: 21032, doesNotNeedAssistance: 351271, notStated: 24477, total: 396776, rate: 5.3 },
    G33_INCOME: {
      incomeRanges: [2081, 549, 1151, 2244, 4942, 3373, 5469, 5649, 7037, 7950, 6668, 6588, 15526, 11214, 10053, 6838, 16720]
        .map((count, i) => ({ label: `band ${i + 1}`, count })),
      lowIncomeHouseholds: 10967, highIncomeHouseholds: 60351, total: 121337,
    },
    G34: { noCar: 8045, oneCar: 43133, twoCars: 46060, threePlusCars: 22171, totalDwellings: 119420 },
    LABOUR: { unemploymentRate: 5.822880215343203, employed: 174929, unemployed: 10816, labourForce: 185750 },
    G62: {
      car_driver: 69985, car_passenger: 6123, train: 8069, bus: 1886, ferry: 11, tram: 19, bicycle: 201, walked: 1231,
      worked_home: 57975, other: 3330, did_not_go_to_work: 25253, not_stated: 849, total: 174929,
    },
    SEIFA: { irsd: 987, irsad: 1006, ier: 1020, ieo: 993 },
    CATCHMENT: { persons: 396703, frequentPersons: 235572, anyPersons: 376789, frequentShare: 59.3825, anyShare: 94.9801 },
  };

  test('returns exactly the SA2 indicators', () => {
    expect(Object.keys(extractSa2Indicators(BLACKTOWN))).toEqual(SA2_IDS);
  });

  test('the LGA formulas: Blacktown\'s LGA tables give its snapshot values', () => {
    const lga = NEEDS_SNAPSHOT.records.find(r => r.areaId === 'lga_blacktown')!;
    const values = extractSa2Indicators(BLACKTOWN);
    for (const id of SA2_IDS) {
      expect([id, values[id]!.value]).toEqual([id, expect.closeTo(lga.values[id].value!, 4)]);
      expect(values[id]!.numerator).toBe(lga.values[id].numerator);
      expect(values[id]!.denominator).toBe(lga.values[id].denominator);
    }
    expect(values.frequent_service_catchment).toEqual({ value: (235572 * 100) / 396703, numerator: 235572, denominator: 396703 });
  });

  test('missing tables give null, never 0', () => {
    const values = extractSa2Indicators({});
    expect(SA2_IDS.map(id => values[id])).toEqual(SA2_IDS.map(() => ({ value: null })));
    const noSeifa = extractSa2Indicators({ ...BLACKTOWN, SEIFA: undefined, CATCHMENT: undefined });
    expect(noSeifa.seifa_irsd).toEqual({ value: null });
    expect(noSeifa.frequent_service_catchment).toEqual({ value: null });
  });

  test('an SA2 with no residents, workers or labour force has no values (decoded zeros are not data, P2-R9)', () => {
    const empty = extractSa2Indicators({
      G01: { totalPopulation: 0, malePopulation: 0, femalePopulation: 0, ageGroups: {}, indigenousPopulation: 0 },
      G13: { englishOnly: 0, limitedEnglish: 0, total: 0 },
      G18: { needsAssistance: 0, doesNotNeedAssistance: 0, notStated: 0, total: 0, rate: 0 },
      G33_INCOME: { incomeRanges: [], lowIncomeHouseholds: 0, highIncomeHouseholds: 0, total: 0 },
      G34: { noCar: 0, oneCar: 0, twoCars: 0, threePlusCars: 0, totalDwellings: 0 },
      LABOUR: { unemploymentRate: 0, employed: 0, unemployed: 0, labourForce: 0 },
      G62: { car_driver: 0, car_passenger: 0, worked_home: 0, did_not_go_to_work: 0, not_stated: 0, total: 0 },
      SEIFA: { irsd: 0 },
      CATCHMENT: { persons: 0, frequentPersons: 0, anyPersons: 0, frequentShare: null, anyShare: null },
    });
    expect(SA2_IDS.filter(id => empty[id]!.value !== null)).toEqual([]);
  });
});

describe('LGA snapshot', () => {
  test('snapshot: catchment coverage for all LGAs', () => {
    expect(NEEDS_SNAPSHOT.records).toHaveLength(128);
    expect(NEEDS_SNAPSHOT.records.filter(r => r.values.frequent_service_catchment.value === null)).toEqual([]);
    expect(NEEDS_SNAPSHOT.records.filter(r => r.values.any_service_catchment.value === null)).toEqual([]);
    const blacktown = NEEDS_SNAPSHOT.records.find(r => r.areaId === 'lga_blacktown')!;
    expect(blacktown.values.frequent_service_catchment.value).toBeCloseTo(59.4, 1);
    expect(blacktown.values.any_service_catchment.value).toBeCloseTo(95.0, 1);
  });
});

describe('public/data/sa2-needs.json', () => {
  const FILE = path.join(__dirname, '../../public/data/sa2-needs.json');
  const sa2File = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as Sa2NeedsFile;
  const byCode = new Map(sa2File.records.map(r => [r.sa2Code, r]));

  test('644 SA2s, one per ASGS 2021 NSW SA2, under 600 KB', () => {
    expect(sa2File.records).toHaveLength(644);
    expect(sa2File.records.map(r => r.sa2Code)).toEqual(SA2_AREAS.map(a => a.code));
    expect(fs.statSync(FILE).size).toBeLessThan(600 * 1024);
  });

  test('every record has the SA2 indicators only, and a low-population flag below 100 persons', () => {
    for (const r of sa2File.records) {
      expect(Object.keys(r.values)).toEqual(SA2_IDS);
      expect(r.lowPopulation).toBe(r.population < SA2_LOW_POPULATION);
    }
    expect(byCode.get('116031317')!.population).toBe(22918);   // Mount Druitt - Whalan, ABS QuickStats
  });

  test('the two non-spatial SA2s have no LGA and are not ranked (P2-R7)', () => {
    for (const code of ['197979799', '199999499']) {
      expect(byCode.get(code)).toMatchObject({ nonSpatial: true, primaryLgaId: null, lgaShares: [] });
      expect(isRankedSa2(byCode.get(code)!)).toBe(false);
    }
    expect(sa2File.records.filter(r => r.nonSpatial).map(r => r.sa2Code)).toEqual(['197979799', '199999499']);
  });

  test('LGA shares sum to 1, largest first, and name the primary LGA', () => {
    for (const r of sa2File.records.filter(rec => rec.lgaShares.length > 0)) {
      expect(r.lgaShares.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 3);
      expect(r.lgaShares.every((s, i) => i === 0 || s.share <= r.lgaShares[i - 1].share)).toBe(true);
      expect(r.primaryLgaId).toBe(r.lgaShares[0].lgaId);
    }
  });

  test('every ranked SA2 but Lord Howe Island belongs to an LGA (P2-R10)', () => {
    const withoutLga = sa2File.records.filter(r => isRankedSa2(r) && r.lgaShares.length === 0).map(r => r.sa2Code);
    expect(withoutLga).toEqual(['108031161']);
  });

  test('Lord Howe Island is ranked against NSW SA2s but is in no LGA drill-down', () => {
    const lgaIds = NEEDS_SNAPSHOT.records.map(r => r.areaId);
    expect(sa2sForLgas(sa2File, lgaIds).map(r => r.sa2Code)).not.toContain('108031161');
    const [lordHowe] = assessSa2s(sa2File, ['108031161']);
    expect(lordHowe.overall).not.toBeNull();
  });

  test('every ranked SA2 with an LGA appears in some LGA drill-down', () => {
    const lgaIds = NEEDS_SNAPSHOT.records.map(r => r.areaId);
    const shown = new Set(sa2sForLgas(sa2File, lgaIds).map(r => r.sa2Code));
    expect(sa2File.records.filter(r => r.lgaShares.length > 0 && !shown.has(r.sa2Code))).toEqual([]);
  });

  test('Blacktown\'s drill-down includes Mount Druitt - Whalan, ranked among NSW SA2s', () => {
    const blacktown = sa2sForLgas(sa2File, ['lga_blacktown']);
    expect(blacktown.map(r => r.name)).toContain('Mount Druitt - Whalan');
    const [mountDruitt] = assessSa2s(sa2File, ['116031317']);
    const ranked = sa2File.records.filter(isRankedSa2).length;
    expect(mountDruitt).toMatchObject({ universeLabel: 'NSW SA2s', universeSize: ranked });
    expect(mountDruitt.domains.map(d => d.domain)).toEqual(['transport', 'socio']);
    expect(mountDruitt.indicators.every(s => !s.unranked)).toBe(true);
  });
});
