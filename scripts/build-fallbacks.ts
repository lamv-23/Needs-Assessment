#!/usr/bin/env tsx
/**
 * Rebuild bundled fallbacks from data/cache.db.
 *
 *   1. src/lib/data/official-fallback-data.ts — for every LGA, refreshes each
 *      field the fallback already carries from what the live data layer returns
 *      (getLive*Data), so it cannot drift from the corrected live figures. The
 *      file ships to the browser, so its shape is kept: series it deliberately
 *      leaves empty stay empty and no new fields are added. Non-LGA entries
 *      (suburbs, benchmarks) are left as they are.
 *   2. src/lib/data/greater-sydney-benchmark.ts — Greater Sydney (ABS GCCSA)
 *      benchmark for /compare, summed from its 34 LGAs. Only additive counts
 *      (population, journey-to-work, labour force) are aggregated; medians and
 *      SEIFA cannot be summed and are left null.
 *
 * Run after `npm run seed:g62` / `seed:abs`:  npm run build:fallbacks
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDb } from '../src/lib/db';
import { LGA_CODE_MAP, type G01Data, type JourneyToWorkData, type LabourData } from '../src/lib/abs-fetchers';
import { GREATER_SYDNEY_GCCSA_AREA_IDS } from '../src/lib/data/sample-areas';
import {
  journeyToWorkShares,
  getLiveDemographicsData, getLiveTransportData, getLiveEconomyData,
  getLiveEducationData, getLiveHousingData, getLiveGrowthData,
} from '../src/lib/data/live-data';

// Census year used by the pages' default selectedYear; the live builders ignore it
// for Census fields.
const YEAR = 2021;

const FALLBACK_PATH = path.join(process.cwd(), 'src/lib/data/official-fallback-data.ts');
const BENCHMARK_PATH = path.join(process.cwd(), 'src/lib/data/greater-sydney-benchmark.ts');
const DECLARATION = 'export const OFFICIAL_FALLBACKS = ';

const statement = getDb().prepare('SELECT data_json FROM abs_cache WHERE lga_code = ? AND dataset = ?');
function cached<T>(lgaCode: string, dataset: string): T | null {
  const row = statement.get(lgaCode, dataset) as { data_json: string } | undefined;
  return row ? JSON.parse(row.data_json) as T : null;
}

async function rebuildFallbacks(): Promise<void> {
  const source = fs.readFileSync(FALLBACK_PATH, 'utf-8');
  const start = source.indexOf(DECLARATION);
  const end = source.lastIndexOf('} as const;');
  if (start < 0 || end < 0) throw new Error('Unexpected official-fallback-data.ts layout');

  type Section = Record<string, unknown>;
  const fallbacks = JSON.parse(source.slice(start + DECLARATION.length, end + 1)) as Record<string, Record<string, Section>>;
  const refresh = (current: Section, live: object): Section => Object.fromEntries(
    Object.entries(current).map(([key, value]) => {
      const keepEmpty = Array.isArray(value) && value.length === 0;
      const next = (live as Section)[key];
      return [key, keepEmpty || next === undefined ? value : next];
    }),
  );
  let updated = 0;
  for (const areaId of Object.keys(fallbacks)) {
    if (!areaId.startsWith('lga_') || !LGA_CODE_MAP[areaId]) continue;
    const [demographics, transport, economy, education, housing, growth] = await Promise.all([
      getLiveDemographicsData(areaId, YEAR),
      getLiveTransportData(areaId, YEAR),
      getLiveEconomyData(areaId, YEAR),
      getLiveEducationData(areaId, YEAR),
      getLiveHousingData(areaId, YEAR),
      getLiveGrowthData(areaId),
    ]);
    const entry = fallbacks[areaId];
    fallbacks[areaId] = {
      demographics: refresh(entry.demographics, demographics.data),
      transport: refresh(entry.transport, transport.data),
      economy: refresh(entry.economy, economy.data),
      education: refresh(entry.education, education.data),
      housing: refresh(entry.housing, housing.data),
      growth: refresh(entry.growth, growth.data),
    };
    updated++;
  }

  fs.writeFileSync(
    FALLBACK_PATH,
    `${source.slice(0, start)}${DECLARATION}${JSON.stringify(fallbacks, null, 2)} as const;\n`,
  );
  console.log(`  ✓ official-fallback-data.ts: ${updated} LGAs refreshed from live data`);
}

const JTW_KEYS: Array<keyof JourneyToWorkData> = [
  'car_driver', 'car_passenger', 'train', 'bus', 'ferry', 'tram', 'bicycle', 'walked',
  'worked_home', 'other', 'did_not_go_to_work', 'not_stated', 'total',
];

function buildGreaterSydneyBenchmark(): void {
  const codes = Array.from(new Set(GREATER_SYDNEY_GCCSA_AREA_IDS.map((id) => LGA_CODE_MAP[id])));

  let population = 0;
  let unemployed = 0;
  let labourForce = 0;
  const jtw = Object.fromEntries(JTW_KEYS.map((k) => [k, 0])) as Record<keyof JourneyToWorkData, number>;
  for (const code of codes) {
    const g01 = cached<G01Data>(code, 'G01');
    const g62 = cached<JourneyToWorkData>(code, 'G62');
    const labour = cached<LabourData>(code, 'LABOUR');
    if (!g01 || !g62 || labour?.labourForce === undefined) {
      throw new Error(`Missing G01/G62/LABOUR counts for LGA ${code} — run npm run seed:abs`);
    }
    population += g01.totalPopulation;
    unemployed += labour.unemployed ?? 0;
    labourForce += labour.labourForce;
    for (const k of JTW_KEYS) jtw[k] += g62[k] ?? 0;
  }

  const benchmark = {
    definition: `ABS Greater Sydney (GCCSA): sum of ${codes.length} LGAs — 33 metropolitan LGAs plus Central Coast`,
    censusYear: 2021,
    totalPopulation: population,
    journeyToWork: journeyToWorkShares(jtw),
    unemploymentRate: Math.round((unemployed / labourForce) * 1000) / 10,
    // Not additive across LGAs — no official Greater Sydney value is bundled.
    medianAge: null,
    seifaScore: null,
    medianWeeklyIncome: null,
    lgaCodes: codes,
  };

  fs.writeFileSync(BENCHMARK_PATH, `// Auto-generated by scripts/build-fallbacks.ts from ABS Census 2021 data in data/cache.db.
// Do not edit by hand — run \`npm run build:fallbacks\`.

export interface GreaterSydneyBenchmark {
  definition: string;
  censusYear: number;
  totalPopulation: number;
  journeyToWork: { name: string; value: number }[];
  medianAge: number | null;
  seifaScore: number | null;
  medianWeeklyIncome: number | null;
  unemploymentRate: number | null;
  lgaCodes: string[];
}

export const GREATER_SYDNEY_BENCHMARK_DATA: GreaterSydneyBenchmark = ${JSON.stringify(benchmark, null, 2)};
`);
  console.log(`  ✓ greater-sydney-benchmark.ts: ${codes.length} LGAs, population ${population.toLocaleString()}`);
}

rebuildFallbacks()
  .then(buildGreaterSydneyBenchmark)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
