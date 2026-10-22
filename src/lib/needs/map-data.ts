import { displayScore } from './format';
import { drillDownSa2s, lgaShareText, rankSa2s, sa2RankText } from './sa2';
import { assessRecord, universeRecords } from './scoring';
import type { NeedBand, NeedsAssessment, Sa2NeedsFile, Universe } from './types';

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

// The SA2 need map (Phase 2)

/** An SA2 with fewer than 100 residents, which is not ranked. */
export const LOW_POPULATION_REASON = 'Low population';

/**
 * What the SA2 map's shading is, shown with its legend: the rank (need percentile) among NSW SA2s, while the tooltip
 * and the table give the score's band (P2-R20).
 */
export const SA2_MAP_NOTE =
  'Shading shows where each SA2 ranks among NSW SA2s (its need percentile) on its overall SA2 need score, which covers '
  + 'the transport and socio-economic domains only (there are no growth indicators for SA2s); darker means more need. '
  + 'The tooltip and the SA2 table show the score and its band.';

/**
 * The SA2 map's legend, one label per step of the need scale (P2-R20): the shading is the percentile among NSW SA2s, so
 * the steps are percentile bands, not the score steps of the LGA map.
 */
export const SA2_PERCENTILE_BANDS = ['Lowest 20% of NSW SA2s', '20–40%', '40–60%', '60–80%', 'Highest 20%'];

export interface Sa2MapEntry {
  code: string;
  name: string;
  /** Need percentile of the overall score among the ranked NSW SA2s, unrounded; null when there is none. */
  percentile: number | null;
  lowPopulation: boolean;
  /** The tooltip: the name, then the score and rank (or why there is none), then the LGA shares. */
  lines: string[];
}

const sentenceStart = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Every SA2 in the drill-down of `lgaIds`, each once, with its overall need percentile for the shading and its tooltip:
 * the band, the score (floored) and the rank among NSW SA2s (R57), or "Low population" for an SA2 that is not ranked.
 */
export function sa2MapEntries(file: Sa2NeedsFile, lgaIds: string[], lgaNames: Map<string, string>): Sa2MapEntry[] {
  const ranking = rankSa2s(file);
  return drillDownSa2s(file, lgaIds).map(entry => {
    const { record, assessment } = entry;
    const rank = sa2RankText(entry, ranking);
    let status: string[];
    if (record.lowPopulation) {
      const residents = `${record.population} ${record.population === 1 ? 'resident' : 'residents'}`;
      status = [`${LOW_POPULATION_REASON} (${residents}): not ranked`];
    } else if (assessment.overall === null || assessment.band === null || rank === null) {
      status = [NO_DATA_REASON];
    } else {
      status = [`${assessment.band} need · score ${displayScore(assessment.overall)} / 100`, sentenceStart(rank)];
    }
    return {
      code: record.sa2Code,
      name: record.name,
      percentile: entry.overallPercentile,
      lowPopulation: record.lowPopulation,
      lines: [record.name, ...status, `Residents in ${lgaShareText(record, lgaNames)}`],
    };
  });
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
