import { GREATER_SYDNEY_GCCSA_AREA_IDS } from '@/lib/data/sample-areas';
import { INDICATORS, NEED_DOMAINS } from './indicators';
import { PEER_GROUP_PLURALS } from './peer-groups';
import type {
  AreaAssessment, AssessableRecord, DomainScore, IndicatorId, IndicatorScore, LgaIndicatorRecord, NeedBand,
  PeerGroup, Universe,
} from './types';

export const KEY_NEED_PERCENTILE = 80;
/** A comparison group with fewer LGAs than this is too small to rank in or to take a median of. */
export const SMALL_GROUP_SIZE = 5;

type UniverseTarget = { region: string; peerGroup: PeerGroup | null };

/**
 * Mid-rank need percentile of `value` within `distribution`, 0-100 with 100 = most need:
 * (countLess + 0.5 x countEqual) / n x 100, where "less" means less need (so a lower value ranks
 * higher when `direction` is 'lower'). Unrounded. `distribution` must not be empty.
 */
export function needPercentile(value: number, distribution: number[], direction: 'higher' | 'lower'): number {
  let less = 0;
  let equal = 0;
  for (const other of distribution) {
    if (other === value) equal++;
    else if (direction === 'higher' ? other < value : other > value) less++;
  }
  // Multiply before dividing so that exact ranks (e.g. 4.5 / 5) stay exact.
  return ((less + 0.5 * equal) * 100) / distribution.length;
}

/**
 * Place of `value` in need order among `distribution`: 1 + the number of values with more need, so ties share the
 * better rank, and a value that is not one of the distribution's takes the place it would have among them.
 */
export function needRank(value: number, distribution: number[], direction: 'higher' | 'lower'): number {
  return 1 + distribution.filter(other => (direction === 'higher' ? other > value : other < value)).length;
}

export function bandFor(score: number): NeedBand {
  if (score >= 80) return 'Very high';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Moderate';
  return 'Lower';
}

function requirePeerGroup(universe: Universe, target?: UniverseTarget): PeerGroup {
  if (!target?.peerGroup) throw new Error(`Universe '${universe}' needs a target with a peer group`);
  return target.peerGroup;
}

function requireRegion(universe: Universe, target?: UniverseTarget): string {
  if (!target) throw new Error(`Universe '${universe}' needs a target region`);
  return target.region;
}

export function universeRecords(
  records: LgaIndicatorRecord[],
  universe: Universe,
  target?: UniverseTarget,
): LgaIndicatorRecord[] {
  switch (universe) {
    case 'nsw':
      return records;
    case 'gsyd':
      return records.filter(r => GREATER_SYDNEY_GCCSA_AREA_IDS.includes(r.areaId));
    case 'region': {
      const region = requireRegion(universe, target);
      return records.filter(r => r.region === region);
    }
    case 'peer': {
      const peerGroup = requirePeerGroup(universe, target);
      return records.filter(r => r.peerGroup === peerGroup);
    }
  }
}

/** Plural noun phrase, used verbatim in sentences. */
export function universeLabelFor(universe: Universe, target?: UniverseTarget): string {
  switch (universe) {
    case 'nsw':
      return 'NSW LGAs';
    case 'gsyd':
      return 'Greater Sydney LGAs';
    case 'region':
      return `LGAs in the ${requireRegion(universe, target)} region`;
    case 'peer':
      return PEER_GROUP_PLURALS[requirePeerGroup(universe, target)];
  }
}

const mean = (xs: number[]): number => xs.reduce((sum, x) => sum + x, 0) / xs.length;

/**
 * Scores `target` against `peers` (the records of the chosen universe, which may or may not include
 * the target itself). Equal weights throughout: every scored indicator within a domain, and every
 * domain within the overall score. Context (unscored) indicators get a percentile only. An indicator with fewer than
 * 5 values in the universe is not ranked (R58), so it has no percentile and counts towards no score.
 */
export function assessRecord(
  target: AssessableRecord,
  universe: Universe,
  peers: LgaIndicatorRecord[],
  flags: { approximate?: IndicatorId[]; partial?: IndicatorId[] } = {},
): AreaAssessment {
  const indicators: IndicatorScore[] = INDICATORS.map(def => {
    const value = target.values[def.id]?.value ?? null;
    const distribution = peers
      .map(p => p.values[def.id]?.value ?? null)
      .filter((v): v is number => v !== null);
    // R58: with fewer than 5 values in the universe a percentile is a handful of points, so the value is not ranked
    const unranked = value !== null && distribution.length < SMALL_GROUP_SIZE;
    const ranks = value !== null && !unranked;
    const percentile = ranks ? needPercentile(value, distribution, def.direction) : null;
    return {
      id: def.id,
      value,
      percentile,
      rank: ranks ? needRank(value, distribution, def.direction) : null,
      ranked: value !== null ? distribution.length : null,
      unranked,
      keyNeed: def.scored && percentile !== null && percentile >= KEY_NEED_PERCENTILE,
      approximate: flags.approximate?.includes(def.id) ?? false,
      partial: flags.partial?.includes(def.id) ?? false,
    };
  });

  const domains: DomainScore[] = NEED_DOMAINS.map(domain => {
    const scoredIds = INDICATORS.filter(def => def.domain === domain && def.scored).map(def => def.id);
    const percentiles = indicators
      .filter(score => scoredIds.includes(score.id))
      .map(score => score.percentile)
      .filter((p): p is number => p !== null);
    // A domain needs at least half of its scored indicators to be meaningful.
    const score = percentiles.length > 0 && percentiles.length * 2 >= scoredIds.length ? mean(percentiles) : null;
    return {
      domain,
      score,
      band: score === null ? null : bandFor(score),
      available: percentiles.length,
      total: scoredIds.length,
    };
  });

  const domainScores = domains.map(d => d.score).filter((s): s is number => s !== null);
  const overall = domainScores.length > 0 ? mean(domainScores) : null;

  return {
    areaId: target.areaId,
    name: target.name,
    region: target.region,
    population: target.population,
    peerGroup: target.peerGroup,
    universe,
    universeLabel: universeLabelFor(universe, { region: target.region, peerGroup: target.peerGroup }),
    universeSize: peers.length,
    smallGroup: peers.length < SMALL_GROUP_SIZE,
    indicators,
    domains,
    overall,
    band: overall === null ? null : bandFor(overall),
  };
}
