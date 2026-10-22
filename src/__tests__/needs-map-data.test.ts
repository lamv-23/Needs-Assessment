import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { GREATER_SYDNEY_GCCSA_AREA_IDS } from '@/lib/data/sample-areas';
import { runAssessment } from '@/lib/needs/assess';
import { NO_DATA_REASON, OUTSIDE_GSYD_REASON, describeMapScore, mapScores, mapUniverseNote } from '@/lib/needs/map-data';
import { assessRecord, bandFor, universeRecords } from '@/lib/needs/scoring';
import type { NeedsAssessment, NeedsMode, Universe } from '@/lib/needs/types';

const { records } = NEEDS_SNAPSHOT;
const byId = (id: string) => records.find(r => r.areaId === id)!;

function assess(universe: Universe, areaIds = ['lga_blacktown'], mode: NeedsMode = 'separate'): NeedsAssessment {
  return runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds, mode, universe });
}

describe('mapScores', () => {
  test('has one entry per LGA in the snapshot', () => {
    const scores = mapScores(assess('nsw'));
    expect(scores.size).toBe(records.length);
    expect(Array.from(scores.keys()).sort()).toEqual(records.map(r => r.areaId).sort());
  });

  test('NSW: each LGA is scored against every NSW LGA, with the band of that score', () => {
    const scores = mapScores(assess('nsw'));
    for (const id of ['lga_blacktown', 'lga_sydney', 'lga_broken_hill']) {
      const expected = assessRecord(byId(id), 'nsw', records).overall!;
      const entry = scores.get(id)!;
      expect(entry.score).toBe(expected);
      expect(entry.band).toBe(bandFor(expected));
      expect(entry.noScoreReason).toBeNull();
    }
  });

  test('does not depend on which LGAs are selected', () => {
    const one = mapScores(assess('nsw', ['lga_blacktown']));
    const many = mapScores(assess('nsw', ['lga_penrith', 'lga_sydney'], 'combined'));
    expect(Array.from(many.entries())).toEqual(Array.from(one.entries()));
  });

  test('Greater Sydney: scored against Greater Sydney LGAs only; other LGAs say why they have no score', () => {
    const scores = mapScores(assess('gsyd'));
    const peers = universeRecords(records, 'gsyd');
    expect(scores.get('lga_blacktown')!.score).toBe(assessRecord(byId('lga_blacktown'), 'gsyd', peers).overall);
    expect(scores.get('lga_blacktown')!.score).not.toBe(mapScores(assess('nsw')).get('lga_blacktown')!.score);

    const outside = records.filter(r => !GREATER_SYDNEY_GCCSA_AREA_IDS.includes(r.areaId));
    expect(outside.length).toBeGreaterThan(0);
    for (const r of outside) {
      expect(scores.get(r.areaId)).toEqual({ score: null, band: null, noScoreReason: OUTSIDE_GSYD_REASON });
    }
    for (const id of GREATER_SYDNEY_GCCSA_AREA_IDS.filter(id => byId(id))) {
      expect(scores.get(id)!.score).not.toBeNull();
    }
  });

  test('region: each LGA is scored within its own region', () => {
    const scores = mapScores(assess('region'));
    for (const id of ['lga_blacktown', 'lga_broken_hill', 'lga_newcastle']) {
      const r = byId(id);
      const expected = assessRecord(r, 'region', universeRecords(records, 'region', r)).overall;
      expect(scores.get(id)!.score).toBe(expected);
    }
    expect(scores.get('lga_blacktown')!.score).not.toBe(mapScores(assess('nsw')).get('lga_blacktown')!.score);
  });

  test('peer group: each LGA is scored within its own peer group', () => {
    const scores = mapScores(assess('peer'));
    for (const id of ['lga_blacktown', 'lga_broken_hill', 'lga_newcastle']) {
      const r = byId(id);
      const expected = assessRecord(r, 'peer', universeRecords(records, 'peer', r)).overall;
      expect(scores.get(id)!.score).toBe(expected);
    }
    expect(scores.get('lga_blacktown')!.score).not.toBe(mapScores(assess('nsw')).get('lga_blacktown')!.score);
  });

  test('follows the universe actually used: a combined selection that fell back to NSW maps NSW scores', () => {
    const fallback = assess('region', ['lga_blacktown', 'lga_broken_hill'], 'combined');
    expect(fallback.universe).toBe('nsw');
    expect(Array.from(mapScores(fallback).entries())).toEqual(Array.from(mapScores(assess('nsw')).entries()));
  });

  test('an LGA with no values has no score and says "No data", not 0', () => {
    const base = assess('nsw');
    const emptyValues = Object.fromEntries(
      Object.keys(byId('lga_blacktown').values).map(k => [k, { value: null }]),
    ) as typeof records[number]['values'];
    const blanked = { ...base, records: records.map(r => (r.areaId === 'lga_blacktown' ? { ...r, values: emptyValues } : r)) };
    const entry = mapScores(blanked).get('lga_blacktown')!;
    expect(entry).toEqual({ score: null, band: null, noScoreReason: NO_DATA_REASON });
  });

  test('does not modify the assessment', () => {
    const a = assess('region');
    const before = JSON.stringify(a);
    mapScores(a);
    expect(JSON.stringify(a)).toBe(before);
  });
});

describe('describeMapScore', () => {
  test('gives the band and the score rounded down, so it never contradicts the band', () => {
    expect(describeMapScore({ score: 59.9, band: 'Moderate', noScoreReason: null })).toBe('Moderate need · score 59 / 100');
    expect(describeMapScore({ score: 83.8, band: 'Very high', noScoreReason: null })).toBe('Very high need · score 83 / 100');
  });

  test('says why there is no score, never 0', () => {
    expect(describeMapScore({ score: null, band: null, noScoreReason: OUTSIDE_GSYD_REASON })).toBe('Outside Greater Sydney');
    expect(describeMapScore({ score: null, band: null, noScoreReason: NO_DATA_REASON })).toBe('No data');
    expect(describeMapScore(undefined)).toBe('No data');
  });
});

describe('mapUniverseNote', () => {
  test('says what each LGA is scored against', () => {
    expect(mapUniverseNote('nsw')).toMatch(/all NSW LGAs/);
    expect(mapUniverseNote('gsyd')).toMatch(/Greater Sydney LGAs/);
    expect(mapUniverseNote('region')).toMatch(/own region/);
    expect(mapUniverseNote('peer')).toMatch(/own peer group/);
  });
});
