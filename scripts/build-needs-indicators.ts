#!/usr/bin/env tsx
/**
 * Build the bundled needs-assessment snapshot: the 16 indicator values for every
 * NSW LGA, plus the name, region, population, density and peer group the
 * percentile engine needs, and the time series the Part B insights draw on
 * (extractSeries(): car dependency by Census year, crashes, ERP history, 2041
 * population, AM-peak departures, 12-month approvals, jobs).
 *
 *   src/lib/data/needs-indicators-data.ts — NEEDS_SNAPSHOT
 *
 * Values come from the same live data layer the pages use (getLive*Data, backed
 * by data/cache.db), run through extractIndicators(). Density is Census
 * population ÷ boundary area (km²), with the area computed from
 * public/geo/lga-nsw.json, so it is not the bundled integer populationDensity
 * (which reads 0 for 34 rural LGAs, and is far below the real density for many
 * metro LGAs). The file is written one record per line with non-integer numbers
 * rounded to 4 dp, to stay under 400 KB.
 *
 * Provenance: a live result's meta.sampleFields lists the fields that fell back
 * to bundled official data (src/lib/data/official-fallback-data.ts). Fallback
 * values are kept (they are official figures), but the console shows, per
 * indicator, how many LGAs had any source field in meta.sampleFields and how many
 * had any source field that was not live. See INDICATOR_SOURCE_FIELDS.
 *
 * Run after `npm run build:fallbacks`:  npm run build:needs
 */

import * as fs from 'fs';
import * as path from 'path';
import area from '@turf/area';
import { SAMPLE_AREAS } from '../src/lib/data/sample-areas';
import { OFFICIAL_FALLBACKS } from '../src/lib/data/official-fallback-data';
import {
  getLiveDemographicsData, getLiveTransportData, getLiveEconomyData, getLiveGrowthData,
  type DataMeta,
} from '../src/lib/data/live-data';
import { extractIndicators, extractSeries } from '../src/lib/needs/extract';
import { INDICATORS } from '../src/lib/needs/indicators';
import { peerGroupFor } from '../src/lib/needs/peer-groups';
import type { IndicatorId, LgaIndicatorRecord, NeedsSnapshot, PeerGroup } from '../src/lib/needs/types';

// Census year used by the pages' default selectedYear; the live builders ignore it
// for Census fields.
const YEAR = 2021;

const GEO_PATH = path.join(process.cwd(), 'public/geo/lga-nsw.json');
const OUTPUT_PATH = path.join(process.cwd(), 'src/lib/data/needs-indicators-data.ts');
const SIZE_TARGET_BYTES = 400 * 1024;
// Non-integer values (percentages, densities) are written to this many decimals to keep the file small.
const DECIMALS = 4;

/** JSON.stringify replacer: integers pass through; other numbers are rounded to DECIMALS dp. */
const roundNumbers = (_key: string, value: unknown): unknown =>
  typeof value === 'number' && !Number.isInteger(value) ? Number(value.toFixed(DECIMALS)) : value;

type Bundle = 'demographics' | 'transport' | 'economy' | 'growth';

/**
 * The live-data fields each indicator reads, by result bundle. Two counts per
 * indicator, each over LGAs where any of its fields qualifies:
 *   sampleFields: the field is in that bundle's meta.sampleFields.
 *   not live:     the field is not in meta.liveFields. This is the stricter test:
 *                 some live builders never list a field in sampleFields when it
 *                 falls back (limitedEnglish, needsAssistance), and a field can be
 *                 in both lists when a later source replaced the fallback (the ERP
 *                 series replaces populationHistory), where "not live" is correct.
 */
const INDICATOR_SOURCE_FIELDS: Record<IndicatorId, Partial<Record<Bundle, string[]>>> = {
  car_dependency: { transport: ['journeyToWork'] },
  zero_car_households: { transport: ['vehicleOwnership'] },
  frequent_stop_share: { transport: ['ptFrequency'] },
  am_peak_departures_per_1000: { transport: ['ptFrequency'], growth: ['populationHistory'] },
  commute_distance_km: { transport: ['commuteDistance2016'] },
  crash_rate: { transport: ['crashTrend'], growth: ['populationHistory'] },
  seifa_irsd: { demographics: ['seifaScore'] },
  unemployment_rate: { economy: ['unemploymentRate'] },
  low_income_households: { economy: ['householdIncomeDistribution', 'lowIncomeHouseholds'] },
  needs_assistance: { demographics: ['needsAssistance', 'totalPopulation'] },
  limited_english: { demographics: ['limitedEnglish', 'totalPopulation'] },
  older_residents: { demographics: ['ageDistribution', 'totalPopulation'] },
  indigenous_share: { demographics: ['indigenousPopulation', 'totalPopulation'] },
  pop_growth_2041: { growth: ['populationHistory', 'populationProjections'] },
  job_growth_2041: { growth: ['employmentGrowth'] },
  approvals_per_1000: { growth: ['rollingAnnualApprovals'], demographics: ['totalPopulation'] },
};

const isNotLive = (meta: DataMeta, field: string): boolean => !meta.liveFields.includes(field);

interface GeoFeature { properties: { id: string }; geometry: Parameters<typeof area>[0] }

/** Boundary area in km² by LGA id. */
function loadAreasKm2(): Map<string, number> {
  const geo = JSON.parse(fs.readFileSync(GEO_PATH, 'utf-8')) as { features: GeoFeature[] };
  return new Map(geo.features.map(f => [f.properties.id, area(f.geometry) / 1e6]));
}

async function build(): Promise<void> {
  const lgas = SAMPLE_AREAS.filter(a => a.type === 'lga');

  // getAreaFallback() silently substitutes lga_sydney for an unknown id
  const noFallback = lgas.filter(a => !(a.id in OFFICIAL_FALLBACKS)).map(a => a.id);
  if (noFallback.length > 0) {
    throw new Error(`No OFFICIAL_FALLBACKS entry for ${noFallback.length} LGAs (would default to lga_sydney): ${noFallback.join(', ')}`);
  }

  const areasKm2 = loadAreasKm2();
  const noBoundary = lgas.filter(a => !((areasKm2.get(a.id) ?? 0) > 0)).map(a => a.id);
  if (noBoundary.length > 0) {
    throw new Error(`No boundary in public/geo/lga-nsw.json for ${noBoundary.length} LGAs: ${noBoundary.join(', ')}`);
  }

  const records: LgaIndicatorRecord[] = [];
  const sampleFieldCounts = Object.fromEntries(INDICATORS.map(def => [def.id, 0])) as Record<IndicatorId, number>;
  const notLiveCounts = { ...sampleFieldCounts };
  const fallbackValueCounts = { ...sampleFieldCounts };
  for (const lga of lgas) {
    const [demographics, transport, economy, growth] = await Promise.all([
      getLiveDemographicsData(lga.id, YEAR),
      getLiveTransportData(lga.id, YEAR),
      getLiveEconomyData(lga.id, YEAR),
      getLiveGrowthData(lga.id),
    ]);
    const metas: Record<Bundle, DataMeta> = {
      demographics: demographics.meta, transport: transport.meta, economy: economy.meta, growth: growth.meta,
    };
    const bundle = {
      demographics: demographics.data,
      transport: transport.data,
      economy: economy.data,
      growth: growth.data,
    };
    const values = extractIndicators(bundle);
    const series = extractSeries(bundle);
    for (const def of INDICATORS) {
      const fields = Object.entries(INDICATOR_SOURCE_FIELDS[def.id]) as [Bundle, string[]][];
      const any = (test: (meta: DataMeta, field: string) => boolean) =>
        fields.some(([bundle, names]) => names.some(name => test(metas[bundle], name)));
      if (any((meta, field) => meta.sampleFields.includes(field))) sampleFieldCounts[def.id]++;
      if (any(isNotLive)) {
        notLiveCounts[def.id]++;
        if (values[def.id].value !== null) fallbackValueCounts[def.id]++;
      }
    }

    const population = demographics.data.totalPopulation;
    const densityPerKm2 = population / areasKm2.get(lga.id)!;
    records.push({
      areaId: lga.id,
      name: lga.name,
      region: lga.region ?? '',
      population,
      densityPerKm2,
      peerGroup: peerGroupFor({ areaId: lga.id, population, densityPerKm2 }),
      values,
      series,
    });
  }

  const snapshot: NeedsSnapshot = { generatedAt: new Date().toISOString(), records };
  const output = `// Auto-generated by scripts/build-needs-indicators.ts from data/cache.db and public/geo/lga-nsw.json.
// Do not edit by hand — run \`npm run build:needs\` (after \`npm run build:fallbacks\`).
// One record per line; non-integer numbers are rounded to ${DECIMALS} dp.

import type { NeedsSnapshot } from '@/lib/needs/types';

export const NEEDS_SNAPSHOT: NeedsSnapshot = {
  "generatedAt": ${JSON.stringify(snapshot.generatedAt)},
  "records": [
${snapshot.records.map(record => `    ${JSON.stringify(record, roundNumbers)}`).join(',\n')}
  ]
};
`;
  fs.writeFileSync(OUTPUT_PATH, output);

  // Report
  console.log(`  ✓ needs-indicators-data.ts: ${records.length} LGAs`);
  console.log('\n  Coverage = LGAs with a value. Fallback = LGAs with any source field in meta.sampleFields / not in meta.liveFields (bundled official data);');
  console.log('  "kept" = of the not-live LGAs, those whose value is non-null, i.e. a fallback figure is in the snapshot.');
  for (const def of INDICATORS) {
    const have = records.filter(r => r.values[def.id].value !== null).length;
    console.log(
      `    ${def.id.padEnd(30)} ${String(have).padStart(3)}/${records.length}`
      + `   fallback: sampleFields ${String(sampleFieldCounts[def.id]).padStart(3)}, not live ${String(notLiveCounts[def.id]).padStart(3)}, kept ${String(fallbackValueCounts[def.id]).padStart(3)}`,
    );
  }
  const groupCounts = new Map<PeerGroup, number>();
  for (const r of records) groupCounts.set(r.peerGroup, (groupCounts.get(r.peerGroup) ?? 0) + 1);
  console.log('\n  Peer groups:');
  for (const [group, count] of groupCounts) console.log(`    ${group.padEnd(14)} ${count}`);
  const bytes = Buffer.byteLength(output);
  console.log(`\n  File size: ${(bytes / 1024).toFixed(1)} KB (target < ${SIZE_TARGET_BYTES / 1024} KB)`);
  if (bytes > SIZE_TARGET_BYTES) console.warn('  ! File exceeds the size target');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
