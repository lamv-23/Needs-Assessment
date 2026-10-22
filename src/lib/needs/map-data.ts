import { displayScore } from './format';
import { assessRecord, universeRecords } from './scoring';
import type { NeedBand, NeedsAssessment, Universe } from './types';

/** Pure data shaping for the need map; the component only draws what this returns. */

export const OUTSIDE_GSYD_REASON = 'Outside Greater Sydney';
export const NO_DATA_REASON = 'No data';
/** A group of one has nothing to rank its LGA against. */
export const NO_COMPARISON_REASON = 'No comparison: only LGA in its group';
/** A group of 2-4 ranks no indicator (R58), so its LGAs have no score. */
export const SMALL_GROUP_REASON = 'Not scored: fewer than 5 LGAs in its group';

export interface MapScore {
  /** Overall need score, unrounded (show it with `displayScore`); null when the LGA has none. */
  score: number | null;
  band: NeedBand | null;
  /** Why `score` is null; null when it is not. */
  noScoreReason: string | null;
  /** LGAs in the comparison group the score is ranked against. */
  universeSize: number;
  /** The group has fewer than 5 LGAs, so it ranks no indicator and its LGAs have no score (R58). */
  smallGroup: boolean;
}

/**
 * The overall need score of every LGA in the snapshot, against the universe the assessment used.
 * For a region or peer-group universe each LGA is scored within its own region or peer group; for
 * NSW or Greater Sydney, against that universe. Under Greater Sydney, LGAs outside it have no
 * score, and neither does an LGA in a group of fewer than 5, which ranks no indicator (R58).
 * The selection does not matter: the map shows every LGA, the selection is only outlined.
 */
export function mapScores(assessment: Pick<NeedsAssessment, 'records' | 'universe'>): Map<string, MapScore> {
  const { records, universe } = assessment;
  const shared = universe === 'nsw' || universe === 'gsyd' ? universeRecords(records, universe) : null;
  const members = universe === 'gsyd' ? new Set(shared?.map(r => r.areaId)) : null;

  const scores = new Map<string, MapScore>();
  for (const record of records) {
    if (members && !members.has(record.areaId)) {
      scores.set(record.areaId, {
        score: null, band: null, noScoreReason: OUTSIDE_GSYD_REASON, universeSize: members.size, smallGroup: false,
      });
      continue;
    }
    const peers = shared ?? universeRecords(records, universe, record);
    const { overall, band, universeSize, smallGroup } = assessRecord(record, universe, peers);
    // An LGA with no data has nothing to rank; one in a group of fewer than 5 is not ranked (R58).
    let noScoreReason: string | null = null;
    if (smallGroup) noScoreReason = universeSize === 1 ? NO_COMPARISON_REASON : SMALL_GROUP_REASON;
    else if (overall === null) noScoreReason = NO_DATA_REASON;
    scores.set(record.areaId, {
      score: noScoreReason === null ? overall : null,
      band: noScoreReason === null ? band : null,
      noScoreReason,
      universeSize,
      smallGroup,
    });
  }
  return scores;
}

/** One line for a tooltip: the band and score, or why there is no score. */
export function describeMapScore(entry: MapScore | undefined): string {
  if (!entry || entry.score === null) return entry?.noScoreReason ?? NO_DATA_REASON;
  return `${entry.band} need · score ${displayScore(entry.score)} / 100`;
}

const SMALL_GROUP_NOTE = ' An LGA in a group of fewer than 5 LGAs is not scored.';

/** What every LGA on the map is scored against; shown with the legend. */
export function mapUniverseNote(universe: Universe): string {
  switch (universe) {
    case 'nsw':
      return 'Each LGA scored against all NSW LGAs.';
    case 'gsyd':
      return 'Each LGA scored against Greater Sydney LGAs; LGAs outside Greater Sydney are not scored.';
    case 'region':
      return `Each LGA scored against the LGAs in its own region.${SMALL_GROUP_NOTE}`;
    case 'peer':
      return `Each LGA scored against the LGAs in its own peer group.${SMALL_GROUP_NOTE}`;
  }
}
