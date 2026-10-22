import { aggregateRecords, combinedName, MULTIPLE_REGIONS } from './aggregate';
import { assessRecord, universeRecords } from './scoring';
import type {
  AggregatedRecord, AreaAssessment, LgaIndicatorRecord, NeedsAssessment, NeedsMode, NeedsSnapshot, Universe,
} from './types';

const COMBINED_AREA_ID = 'combined';

// Same ids as the app's benchmark areas (GREATER_SYDNEY_BENCHMARK, LGA_CODE_MAP).
const GSYD_BENCHMARK = { areaId: 'benchmark_gsy', name: 'Greater Sydney' };
const NSW_BENCHMARK = { areaId: 'benchmark_nsw', name: 'NSW' };

/**
 * A combined selection has no single region or peer group when its members differ, so those
 * universes fall back to NSW. Never returns a universe that `universeRecords` would throw for.
 */
function combinedUniverse(universe: Universe, combined: AggregatedRecord): { universe: Universe; fallback: boolean } {
  const unavailable =
    (universe === 'region' && combined.region === MULTIPLE_REGIONS) ||
    (universe === 'peer' && combined.peerGroup === null);
  return unavailable ? { universe: 'nsw', fallback: true } : { universe, fallback: false };
}

/**
 * The universes benchmarks are ranked in. A figure that sets a benchmark's scores beside the areas' draws it only when
 * the areas are ranked in one of these too; against a region or peer group the scales differ.
 */
export const BENCHMARK_UNIVERSES: readonly Universe[] = ['nsw', 'gsyd'];

/** Benchmarks are assessed against NSW or Greater Sydney only: they belong to no region or peer group. */
function benchmarkUniverse(universe: Universe): Universe {
  return universe === 'gsyd' ? 'gsyd' : 'nsw';
}

/** Scores an aggregated record, carrying over which of its values are approximate or partial. */
function assessAggregate(record: AggregatedRecord, universe: Universe, peers: LgaIndicatorRecord[]): AreaAssessment {
  return assessRecord(record, universe, peers, { approximate: record.approximate, partial: record.partial });
}

/**
 * Assesses the selected LGAs against `universe`, either one by one or as a single combined area,
 * with Greater Sydney and NSW benchmarks. Unknown ids are reported in `invalidIds`; repeated ids
 * count once. The snapshot is not modified.
 */
export function runAssessment(input: {
  snapshot: NeedsSnapshot;
  areaIds: string[];
  mode: NeedsMode;
  universe: Universe;
}): NeedsAssessment {
  const { snapshot, mode, universe } = input;
  const { records } = snapshot;

  const byId = new Map(records.map(r => [r.areaId, r]));
  const uniqueIds = Array.from(new Set(input.areaIds));
  const members = uniqueIds.flatMap(id => byId.get(id) ?? []);
  const invalidIds = uniqueIds.filter(id => !byId.has(id));

  let areas: AreaAssessment[] = [];
  let effectiveUniverse = universe;
  let universeFallback = false;

  if (mode === 'separate') {
    areas = members.map(m => assessRecord(m, universe, universeRecords(records, universe, m)));
  } else if (members.length > 0) {
    const combined = aggregateRecords(members, combinedName(members.map(m => m.name)), COMBINED_AREA_ID);
    const used = combinedUniverse(universe, combined);
    effectiveUniverse = used.universe;
    universeFallback = used.fallback;
    areas = [assessAggregate(combined, used.universe, universeRecords(records, used.universe, combined))];
  }

  // Each benchmark aggregates its own LGAs, then is ranked against the individual LGAs of the benchmark universe.
  const benchmark = benchmarkUniverse(universe);
  const benchmarkPeers = universeRecords(records, benchmark);
  const gsydRecord: AggregatedRecord = {
    ...aggregateRecords(universeRecords(records, 'gsyd'), GSYD_BENCHMARK.name, GSYD_BENCHMARK.areaId),
    peerGroup: null,
  };
  const nswRecord: AggregatedRecord = {
    ...aggregateRecords(records, NSW_BENCHMARK.name, NSW_BENCHMARK.areaId),
    peerGroup: null,
  };

  return {
    mode,
    requestedUniverse: universe,
    universe: effectiveUniverse,
    universeFallback,
    areas,
    memberIds: members.map(m => m.areaId),
    invalidIds,
    benchmarks: {
      gsyd: assessAggregate(gsydRecord, benchmark, benchmarkPeers),
      nsw: assessAggregate(nswRecord, benchmark, benchmarkPeers),
    },
    benchmarkRecords: { gsyd: gsydRecord, nsw: nswRecord },
    records,
    generatedAt: snapshot.generatedAt,
  };
}
