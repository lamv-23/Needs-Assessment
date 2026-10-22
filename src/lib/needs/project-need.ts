import { INDICATOR_BY_ID } from './indicators';
import { formatValue } from './format';
import { universeRecords } from './scoring';
import type {
  AreaAssessment, IndicatorDef, IndicatorId, Insight, LgaIndicatorRecord, NeedsAssessment, Universe,
} from './types';

/**
 * Pure data shaping for the project-need figures (the need-profile radar and the two quadrant scatters) and the
 * quadrant findings. The components only draw what this returns.
 */

// Need profile radar

/** The radar's axes, in order: the case for transport projects in five numbers. */
export const RADAR_AXES: readonly { id: IndicatorId; label: string }[] = [
  { id: 'car_dependency', label: 'Car dependency' },
  { id: 'frequent_stop_share', label: 'Public transport service gap' },
  { id: 'zero_car_households', label: 'Households without a car' },
  { id: 'seifa_irsd', label: 'Socio-economic disadvantage' },
  { id: 'pop_growth_2041', label: 'Population growth to 2041' },
];

/** The radar draws at most this many areas, so the shapes stay readable. */
export const MAX_RADAR_AREAS = 6;

/** The need percentile of a typical LGA of the comparison group. */
export const TYPICAL_PERCENTILE = 50;

/** One row per axis: the axis label, the typical ring, and a need percentile (or null: no data) under each series key. */
export interface RadarRow { axis: string; typical: 50; [series: string]: string | number | null }

export interface RadarSeries { key: string; name: string; isBenchmark: boolean }

export interface RadarData {
  rows: RadarRow[];
  series: RadarSeries[];
  /** Selected areas beyond `MAX_RADAR_AREAS`, which are not drawn. */
  hiddenAreas: number;
}

const GSYD_KEY = 'gsyd';

/** Benchmarks are always ranked against NSW or Greater Sydney, so they only share an axis with those two universes. */
const BENCHMARK_UNIVERSES: Universe[] = ['nsw', 'gsyd'];

/**
 * Need percentiles (0-100, 100 = most need, unrounded) of the first `MAX_RADAR_AREAS` areas on the five axes,
 * within each area's comparison group, plus Greater Sydney when the universe used is NSW or Greater Sydney. A
 * percentile that does not exist is null, which the chart draws as a gap, never as 0. Series keys are `a0`, `a1`
 * ... for the areas (selection order) and `gsyd`.
 */
export function radarData(a: NeedsAssessment): RadarData {
  const shown = a.areas.slice(0, MAX_RADAR_AREAS);
  const drawn: Array<RadarSeries & { area: AreaAssessment }> = [
    ...shown.map((area, i) => ({ key: `a${i}`, name: area.name, isBenchmark: false, area })),
    ...(BENCHMARK_UNIVERSES.includes(a.universe)
      ? [{ key: GSYD_KEY, name: a.benchmarks.gsyd.name, isBenchmark: true, area: a.benchmarks.gsyd }]
      : []),
  ];
  const rows = RADAR_AXES.map(({ id, label }): RadarRow => {
    const row: RadarRow = { axis: label, typical: TYPICAL_PERCENTILE };
    for (const { key, area } of drawn) row[key] = area.indicators.find(s => s.id === id)?.percentile ?? null;
    return row;
  });
  return {
    rows,
    series: drawn.map(({ key, name, isBenchmark }) => ({ key, name, isBenchmark })),
    hiddenAreas: a.areas.length - shown.length,
  };
}

/** The axes each drawn series has no percentile for, for the note under the chart; series without a gap are left out. */
export function radarGaps({ rows, series }: Pick<RadarData, 'rows' | 'series'>): Array<{ name: string; axes: string[] }> {
  return series
    .map(s => ({ name: s.name, axes: rows.filter(row => row[s.key] === null).map(row => row.axis) }))
    .filter(gap => gap.axes.length > 0);
}

/** The comparison group(s) the areas are ranked in, as in a sentence: "NSW LGAs"; each distinct group once, joined by ", ". */
export function groupLabel(areas: Pick<AreaAssessment, 'universeLabel'>[]): string {
  return Array.from(new Set(areas.map(area => area.universeLabel))).join(', ');
}

/** The ring's legend entry: "Typical LGA (NSW LGAs)". */
export function typicalLabel(a: Pick<NeedsAssessment, 'areas'>): string {
  return a.areas.length === 0 ? 'Typical LGA' : `Typical LGA (${groupLabel(a.areas)})`;
}

// Quadrant scatters

export interface QuadrantSpec {
  id: 'growth-service' | 'disadvantage-service';
  x: IndicatorId;
  y: IndicatorId;
  title: string;
  /** The need quadrant's label on the chart. */
  quadrantLabel: string;
}

/** Both charts have departures per 1,000 residents on y; frequent-stop share is 0 for 67 LGAs. */
export const QUADRANT_SCATTERS: readonly QuadrantSpec[] = [
  {
    id: 'growth-service',
    x: 'pop_growth_2041',
    y: 'am_peak_departures_per_1000',
    title: 'Population growth vs public transport service',
    quadrantLabel: 'High growth, low service',
  },
  {
    id: 'disadvantage-service',
    x: 'seifa_irsd',
    y: 'am_peak_departures_per_1000',
    title: 'Socio-economic disadvantage vs public transport service',
    quadrantLabel: 'High disadvantage, low service',
  },
];

export interface QuadrantData {
  /** The comparison group's LGAs with both values, less the selected areas. */
  points: { areaId: string; name: string; x: number; y: number }[];
  /** One per selected area (one for a combined area), in selection order; a missing value is null. */
  selected: { areaId: string; name: string; x: number | null; y: number | null; inNeedQuadrant: boolean }[];
  /** Medians of the group's LGAs with both values; NaN when the group has none. */
  medians: { x: number; y: number };
  greaterSydney: { x: number; y: number } | null;
  /** The x indicator's direction is 'lower' (SEIFA), so the axis runs high to low and more need is to the right. */
  xReversed: boolean;
  /** y stays natural: the need quadrant is the low-service side. */
  yReversed: false;
}

/** The side of the median that means more need for `def`. */
const pastMedian = (def: IndicatorDef, value: number, median: number): boolean =>
  def.direction === 'higher' ? value > median : value < median;

/**
 * Both values are on the "more need" side of the group's medians: growth above and IRSD below the median,
 * departures per 1,000 residents below it. A value on the median is on neither side.
 */
export function inNeedQuadrant(spec: QuadrantSpec, x: number, y: number, medians: { x: number; y: number }): boolean {
  return pastMedian(INDICATOR_BY_ID[spec.x], x, medians.x) && pastMedian(INDICATOR_BY_ID[spec.y], y, medians.y);
}

const valueOf = (record: LgaIndicatorRecord, id: IndicatorId): number | null => record.values[id]?.value ?? null;

const scoreValue = (area: AreaAssessment, id: IndicatorId): number | null =>
  area.indicators.find(s => s.id === id)?.value ?? null;

/** The middle value, or the mean of the two middle ones. `values` must not be empty. */
function median(values: number[]): number {
  const sorted = [...values].sort((p, q) => p - q);
  const middle = (sorted.length - 1) / 2;
  return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;
}

/** The group's LGAs with both values of the chart, and their medians (NaN when there are none). */
function groupOf(group: LgaIndicatorRecord[], spec: QuadrantSpec) {
  const complete = group.flatMap(record => {
    const [x, y] = [valueOf(record, spec.x), valueOf(record, spec.y)];
    return x !== null && y !== null ? [{ record, x, y }] : [];
  });
  const medians = complete.length > 0
    ? { x: median(complete.map(c => c.x)), y: median(complete.map(c => c.y)) }
    : { x: NaN, y: NaN };
  return { complete, medians };
}

/**
 * The LGAs the selected areas are compared with: each area's own comparison group, which is one group for
 * everything but a separate selection ranked by region or peer group across several of them (then the groups
 * together). Every LGA once, in snapshot order within a group.
 */
function comparisonGroup(a: NeedsAssessment): LgaIndicatorRecord[] {
  const byId = new Map<string, LgaIndicatorRecord>();
  for (const area of a.areas) {
    for (const record of universeRecords(a.records, area.universe, area)) byId.set(record.areaId, record);
  }
  return Array.from(byId.values());
}

/**
 * Every LGA of the comparison group with both values (grey points, less the selected LGAs), the selected areas
 * (a combined selection is one point), the group's medians and the Greater Sydney value. The medians count the
 * selected LGAs, which belong to the group.
 */
export function quadrantData(a: NeedsAssessment, spec: QuadrantSpec): QuadrantData {
  const { complete, medians } = groupOf(comparisonGroup(a), spec);
  // A combined area stands for its member LGAs, which are not plotted again among the others
  const selectedIds = new Set([...a.areas.map(area => area.areaId), ...a.memberIds]);
  const gsyd = { x: scoreValue(a.benchmarks.gsyd, spec.x), y: scoreValue(a.benchmarks.gsyd, spec.y) };
  return {
    points: complete
      .filter(c => !selectedIds.has(c.record.areaId))
      .map(c => ({ areaId: c.record.areaId, name: c.record.name, x: c.x, y: c.y })),
    selected: a.areas.map(area => {
      const [x, y] = [scoreValue(area, spec.x), scoreValue(area, spec.y)];
      return {
        areaId: area.areaId,
        name: area.name,
        x,
        y,
        inNeedQuadrant: x !== null && y !== null && inNeedQuadrant(spec, x, y, medians),
      };
    }),
    medians,
    greaterSydney: gsyd.x !== null && gsyd.y !== null ? { x: gsyd.x, y: gsyd.y } : null,
    xReversed: INDICATOR_BY_ID[spec.x].direction === 'lower',
    yReversed: false,
  };
}

// Quadrant findings

/** The sentence's group name, and its first clause given the area's value and the median as shown. */
const QUADRANT_WORDING: Record<QuadrantSpec['id'], { group: string; measure: (x: string, median: string) => string }> = {
  'growth-service': {
    group: 'high-growth, low-service',
    measure: (x, mx) => `population growth to 2041 of ${x} (median ${mx})`,
  },
  'disadvantage-service': {
    group: 'high-disadvantage, low-service',
    measure: (x, mx) => `a SEIFA IRSD score of ${x} (median ${mx})`,
  },
};

/**
 * A cited insight for each chart whose need quadrant the area is in, comparing it with `group`, the LGAs it
 * is ranked among. `subject` starts the sentence ("Blacktown", "The combined area"). Severity is the mean of the
 * two need percentiles over 100. Nothing for an area missing either value.
 */
export function areaQuadrantInsights(area: AreaAssessment, group: LgaIndicatorRecord[], subject: string): Insight[] {
  return QUADRANT_SCATTERS.flatMap((spec): Insight[] => {
    const [x, y] = [scoreValue(area, spec.x), scoreValue(area, spec.y)];
    const percentiles = [spec.x, spec.y].map(id => area.indicators.find(s => s.id === id)?.percentile ?? null);
    const { medians } = groupOf(group, spec);
    if (x === null || y === null || percentiles.some(p => p === null) || !inNeedQuadrant(spec, x, y, medians)) return [];

    const [xDef, yDef] = [INDICATOR_BY_ID[spec.x], INDICATOR_BY_ID[spec.y]];
    const wording = QUADRANT_WORDING[spec.id];
    return [{
      id: `quadrant:${area.areaId}:${spec.id}`,
      areaId: area.areaId,
      kind: 'quadrant',
      severity: (percentiles[0]! + percentiles[1]!) / 2 / 100,
      text: `${subject} is in the ${wording.group} group: ${wording.measure(formatValue(xDef, x), formatValue(xDef, medians.x))} `
        + `and ${y.toFixed(yDef.decimals)} AM-peak departures per 1,000 residents `
        + `(median ${medians.y.toFixed(yDef.decimals)}) among ${area.universeLabel}.`,
      citations: [xDef.source, yDef.source],
    }];
  });
}

/** Quadrant insights for every assessed area, each compared with its own comparison group. */
export function quadrantInsights(a: NeedsAssessment): Insight[] {
  const combined = a.mode === 'combined' && a.memberIds.length >= 2;
  return a.areas.flatMap(area => areaQuadrantInsights(
    area,
    universeRecords(a.records, area.universe, area),
    combined ? 'The combined area' : area.name,
  ));
}
