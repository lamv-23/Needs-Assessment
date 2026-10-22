import { displayScore } from './format';
import { assessRecord, universeRecords } from './scoring';
import type { NeedBand, NeedsAssessment, Universe } from './types';

/** Pure data shaping for the need map; the component only draws what this returns. */

export const OUTSIDE_GSYD_REASON = 'Outside Greater Sydney';
export const NO_DATA_REASON = 'No data';

export interface MapScore {
  /** Overall need score, unrounded (show it with `displayScore`); null when the LGA has none. */
  score: number | null;
  band: NeedBand | null;
  /** Why `score` is null; null when it is not. */
  noScoreReason: string | null;
}

/**
 * The overall need score of every LGA in the snapshot, against the universe the assessment used.
 * For a region or peer-group universe each LGA is scored within its own region or peer group; for
 * NSW or Greater Sydney, against that universe. Under Greater Sydney, LGAs outside it have no
 * score. The selection does not matter: the map shows every LGA, the selection is only outlined.
 */
export function mapScores(assessment: Pick<NeedsAssessment, 'records' | 'universe'>): Map<string, MapScore> {
  const { records, universe } = assessment;
  const shared = universe === 'nsw' || universe === 'gsyd' ? universeRecords(records, universe) : null;
  const members = universe === 'gsyd' ? new Set(shared?.map(r => r.areaId)) : null;

  const scores = new Map<string, MapScore>();
  for (const record of records) {
    if (members && !members.has(record.areaId)) {
      scores.set(record.areaId, { score: null, band: null, noScoreReason: OUTSIDE_GSYD_REASON });
      continue;
    }
    const peers = shared ?? universeRecords(records, universe, record);
    const { overall, band } = assessRecord(record, universe, peers);
    scores.set(record.areaId, { score: overall, band, noScoreReason: overall === null ? NO_DATA_REASON : null });
  }
  return scores;
}

/** One line for a tooltip: the band and score, or why there is no score. */
export function describeMapScore(entry: MapScore | undefined): string {
  if (!entry || entry.score === null) return entry?.noScoreReason ?? NO_DATA_REASON;
  return `${entry.band} need · score ${displayScore(entry.score)} / 100`;
}

/** What every LGA on the map is scored against; shown with the legend. */
export function mapUniverseNote(universe: Universe): string {
  switch (universe) {
    case 'nsw':
      return 'Each LGA scored against all NSW LGAs.';
    case 'gsyd':
      return 'Each LGA scored against Greater Sydney LGAs; LGAs outside Greater Sydney are not scored.';
    case 'region':
      return 'Each LGA scored against the LGAs in its own region.';
    case 'peer':
      return 'Each LGA scored against the LGAs in its own peer group.';
  }
}
