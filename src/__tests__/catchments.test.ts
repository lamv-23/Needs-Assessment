import {
  CATCHMENT_RADIUS_M,
  distanceM,
  buildStopIndex,
  coverage,
  catchmentShares,
  poolShares,
  type CatchmentStop,
} from '../lib/catchments';
import { FREQUENT_DEPARTURES_THRESHOLD } from '../lib/gtfs-frequency';

// One degree of latitude is 111,195 m on the haversine sphere (R = 6,371,008.8 m).
const M_PER_DEG_LAT = (Math.PI / 180) * 6371008.8;
const BASE = { lat: -33.8688, lng: 151.2093 };

/** A point `metres` due north of BASE. */
function northOf(metres: number): { lat: number; lng: number } {
  return { lat: BASE.lat + metres / M_PER_DEG_LAT, lng: BASE.lng };
}

function stop(mode: CatchmentStop['mode'], amPeakDepartures: number): CatchmentStop {
  return { ...BASE, mode, amPeakDepartures };
}

describe('distanceM', () => {
  it('is zero for the same point', () => {
    expect(distanceM(-33.8688, 151.2093, -33.8688, 151.2093)).toBe(0);
  });

  it('is about 1,000.8 m for 0.009 degrees of latitude', () => {
    expect(distanceM(-33.8688, 151.2093, -33.8778, 151.2093)).toBeCloseTo(1000.8, 0);
  });

  it('is symmetric', () => {
    const a = distanceM(-33.8688, 151.2093, -32.9283, 151.7817);
    const b = distanceM(-32.9283, 151.7817, -33.8688, 151.2093);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('CATCHMENT_RADIUS_M', () => {
  it('uses 800 m for train, metro and ferry and 400 m for bus and light rail', () => {
    expect(CATCHMENT_RADIUS_M).toEqual({ train: 800, metro: 800, ferry: 800, lightRail: 400, bus: 400 });
  });
});

describe('coverage', () => {
  it('frequent bus stop: 390 m in, 410 m out', () => {
    const index = buildStopIndex([stop('bus', FREQUENT_DEPARTURES_THRESHOLD)]);
    const inside = northOf(390);
    const outside = northOf(410);
    expect(coverage(index, inside.lat, inside.lng)).toEqual({ frequent: true, any: true });
    expect(coverage(index, outside.lat, outside.lng)).toEqual({ frequent: false, any: false });
  });

  it('frequent train stop: 790 m in', () => {
    const index = buildStopIndex([stop('train', 20)]);
    const inside = northOf(790);
    const outside = northOf(810);
    expect(coverage(index, inside.lat, inside.lng)).toEqual({ frequent: true, any: true });
    expect(coverage(index, outside.lat, outside.lng)).toEqual({ frequent: false, any: false });
  });

  it('applies each mode radius: 600 m reaches metro and ferry but not light rail', () => {
    const point = northOf(600);
    for (const mode of ['metro', 'ferry'] as const) {
      const index = buildStopIndex([stop(mode, 10)]);
      expect(coverage(index, point.lat, point.lng).frequent).toBe(true);
    }
    const lightRail = buildStopIndex([stop('lightRail', 10)]);
    expect(coverage(lightRail, point.lat, point.lng)).toEqual({ frequent: false, any: false });
  });

  it('a stop with 7 departures counts for any-service but not frequent', () => {
    const index = buildStopIndex([stop('bus', FREQUENT_DEPARTURES_THRESHOLD - 1)]);
    expect(coverage(index, BASE.lat, BASE.lng)).toEqual({ frequent: false, any: true });
  });

  it('a stop with 0 departures counts for neither', () => {
    const index = buildStopIndex([stop('train', 0)]);
    expect(coverage(index, BASE.lat, BASE.lng)).toEqual({ frequent: false, any: false });
  });

  it('a nearby low-frequency stop does not mask a frequent stop further away', () => {
    const far = northOf(300);
    const index = buildStopIndex([
      stop('bus', 2),
      { lat: far.lat, lng: far.lng, mode: 'bus', amPeakDepartures: 12 },
    ]);
    expect(coverage(index, BASE.lat, BASE.lng)).toEqual({ frequent: true, any: true });
  });

  it('finds a stop across a cell boundary', () => {
    // Cell size 0.01 deg; put the stop and the point either side of a cell edge.
    const index = buildStopIndex([{ lat: -33.8601, lng: 151.2099, mode: 'bus', amPeakDepartures: 9 }]);
    expect(coverage(index, -33.8604, 151.2101)).toEqual({ frequent: true, any: true });
  });

  it('returns false for an empty index', () => {
    expect(coverage(buildStopIndex([]), BASE.lat, BASE.lng)).toEqual({ frequent: false, any: false });
  });
});

describe('catchmentShares', () => {
  const index = buildStopIndex([stop('bus', 10)]);
  const covered = northOf(100);
  const uncovered = northOf(5000);

  it('stops from any LGA count: coverage ignores area keys', () => {
    // The block belongs to a Sydney-side SA2 ("lga_a"); the only stop sits across the border in lga_b.
    const shares = catchmentShares(
      [{ key: 'sa2_in_lga_a', persons: 120, ...covered }],
      index,
    );
    expect(shares.get('sa2_in_lga_a')).toEqual({
      persons: 120,
      frequentPersons: 120,
      anyPersons: 120,
      frequentShare: 100,
      anyShare: 100,
    });
  });

  it('shares are persons-weighted, in percent, grouped by key', () => {
    const shares = catchmentShares(
      [
        { key: 'a', persons: 100, ...covered },
        { key: 'a', persons: 300, ...uncovered },
        { key: 'b', persons: 50, ...uncovered },
      ],
      index,
    );
    expect(shares.get('a')).toEqual({
      persons: 400,
      frequentPersons: 100,
      anyPersons: 100,
      frequentShare: 25,
      anyShare: 25,
    });
    expect(shares.get('b')).toEqual({
      persons: 50,
      frequentPersons: 0,
      anyPersons: 0,
      frequentShare: 0,
      anyShare: 0,
    });
    expect(shares.size).toBe(2);
  });

  it('separates frequent from any service', () => {
    const lowIndex = buildStopIndex([stop('bus', 3)]);
    const shares = catchmentShares([{ key: 'a', persons: 10, ...covered }], lowIndex);
    expect(shares.get('a')).toMatchObject({ frequentPersons: 0, anyPersons: 10, frequentShare: 0, anyShare: 100 });
  });

  it('shares are null when persons = 0', () => {
    const shares = catchmentShares([{ key: 'empty', persons: 0, ...covered }], index);
    expect(shares.get('empty')).toEqual({
      persons: 0,
      frequentPersons: 0,
      anyPersons: 0,
      frequentShare: null,
      anyShare: null,
    });
  });

  it('rounds shares to 4 decimal places', () => {
    const shares = catchmentShares(
      [
        { key: 'a', persons: 1, ...covered },
        { key: 'a', persons: 2, ...uncovered },
      ],
      index,
    );
    expect(shares.get('a')?.frequentShare).toBe(33.3333);
  });
});

describe('poolShares', () => {
  it('sums person counts and recomputes the shares', () => {
    const pooled = poolShares([
      { persons: 100, frequentPersons: 100, anyPersons: 100, frequentShare: 100, anyShare: 100 },
      { persons: 300, frequentPersons: 0, anyPersons: 150, frequentShare: 0, anyShare: 50 },
    ]);
    expect(pooled).toEqual({
      persons: 400,
      frequentPersons: 100,
      anyPersons: 250,
      frequentShare: 25,
      anyShare: 62.5,
    });
  });

  it('gives null shares for nothing to pool', () => {
    expect(poolShares([])).toEqual({
      persons: 0,
      frequentPersons: 0,
      anyPersons: 0,
      frequentShare: null,
      anyShare: null,
    });
  });
});

describe('stop index', () => {
  /** mulberry32: small seeded generator so the test is reproducible. */
  function seeded(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const MODES = Object.keys(CATCHMENT_RADIUS_M) as CatchmentStop['mode'][];

  function bruteForce(stops: CatchmentStop[], lat: number, lng: number): { frequent: boolean; any: boolean } {
    let frequent = false;
    let any = false;
    for (const s of stops) {
      if (s.amPeakDepartures < 1) continue;
      if (distanceM(lat, lng, s.lat, s.lng) > CATCHMENT_RADIUS_M[s.mode]) continue;
      any = true;
      if (s.amPeakDepartures >= FREQUENT_DEPARTURES_THRESHOLD) frequent = true;
    }
    return { frequent, any };
  }

  // Stops and points scattered over a ~6 km box so some points are covered and some are not,
  // at two latitudes (the longitude span of 800 m changes with latitude).
  for (const originLat of [-33.9, -37.4]) {
    for (const cellDeg of [0.01, 0.003]) {
      test(`index search matches a brute-force scan on 500 random points (origin ${originLat}, cell ${cellDeg})`, () => {
        const rand = seeded(20261027);
        const stops: CatchmentStop[] = Array.from({ length: 40 }, () => ({
          lat: originLat + (rand() - 0.5) * 0.06,
          lng: 151 + (rand() - 0.5) * 0.06,
          mode: MODES[Math.floor(rand() * MODES.length)],
          amPeakDepartures: Math.floor(rand() * 14),
        }));
        const index = buildStopIndex(stops, cellDeg);
        let covered = 0;
        let frequent = 0;
        for (let i = 0; i < 500; i++) {
          const lat = originLat + (rand() - 0.5) * 0.06;
          const lng = 151 + (rand() - 0.5) * 0.06;
          const expected = bruteForce(stops, lat, lng);
          expect(coverage(index, lat, lng)).toEqual(expected);
          if (expected.any) covered++;
          if (expected.frequent) frequent++;
        }
        // Guard against a degenerate scenario where everything, or nothing, is in range.
        expect(covered).toBeGreaterThan(50);
        expect(covered).toBeLessThan(450);
        expect(frequent).toBeGreaterThan(20);
        expect(frequent).toBeLessThan(covered);
      });
    }
  }
});
