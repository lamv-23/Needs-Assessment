import { displayScore } from './format';
import { assessRecord, universeRecords } from './scoring';
import type { NeedBand, NeedsAssessment, Universe } from './types';

/** Pure data shaping for the need map; the component only draws what this returns. */

export const OUTSIDE_GSYD_REASON = 'Outside Greater Sydney';
export const NO_DATA_REASON = 'No data';
/** A group of one ranks its LGA mid-scale (percentile 50) on every indicator: an artefact, not a measurement. */
export const NO_COMPARISON_REASON = 'No comparison: only LGA in its group';

export interface MapScore {
  /** Overall need score, unrounded (show it with `displayScore`); null when the LGA has none. */
  score: number | null;
  band: NeedBand | null;
  /** Why `score` is null; null when it is not. */
  noScoreReason: string | null;
  /** LGAs in the comparison group the score is ranked against. */
  universeSize: number;
  /** The group has fewer than 5 LGAs, so its percentiles are coarse. */
  smallGroup: boolean;
}

/**
 * The overall need score of every LGA in the snapshot, against the universe the assessment used.
 * For a region or peer-group universe each LGA is scored within its own region or peer group; for
 * NSW or Greater Sydney, against that universe. Under Greater Sydney, LGAs outside it have no
 * score, and neither does an LGA that is alone in its group (a group of one is not a comparison).
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
    // An LGA with no data has nothing to rank; one alone in its group has nothing to be ranked against.
    const scored = overall !== null && universeSize > 1;
    scores.set(record.areaId, {
      score: scored ? overall : null,
      band: scored ? band : null,
      noScoreReason: scored ? null : overall === null ? NO_DATA_REASON : NO_COMPARISON_REASON,
      universeSize,
      smallGroup,
    });
  }
  return scores;
}

/** One line for a tooltip: the band and score (with a caution for a small comparison group), or why there is no score. */
export function describeMapScore(entry: MapScore | undefined): string {
  if (!entry || entry.score === null) return entry?.noScoreReason ?? NO_DATA_REASON;
  const line = `${entry.band} need · score ${displayScore(entry.score)} / 100`;
  return entry.smallGroup ? `${line} (compared with only ${entry.universeSize} LGAs — read with caution)` : line;
}

const SMALL_GROUP_NOTE = ' LGAs in groups of fewer than 5 should be read with caution, and a group of one is not scored.';

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
