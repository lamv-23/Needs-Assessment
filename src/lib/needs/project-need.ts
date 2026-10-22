import { BENCHMARK_UNIVERSES } from './assess';
import { INDICATOR_BY_ID } from './indicators';
import { formatValue } from './format';
import { settingOf, type Setting } from './peer-groups';
import { SMALL_GROUP_SIZE, needPercentile, universeRecords } from './scoring';
import type {
  AreaAssessment, IndicatorDef, IndicatorId, Insight, LgaIndicatorRecord, NeedsAssessment, Universe,
} from './types';

/**
 * Pure data shaping for the project-need figures (the need-profile radar and the two quadrant scatters) and the
 * quadrant findings. The components only draw what this returns.
 */

// Need profile radar

/**
 * The radar's axes, in order: the case for transport projects in five numbers. The service gap is the share of
 * residents near frequent AM-peak public transport (straight-line distance; a lower share is more need, P2-R12).
 */
export const RADAR_AXES: readonly { id: IndicatorId; label: string }[] = [
  { id: 'car_dependency', label: 'Car dependency' },
  { id: 'frequent_service_catchment', label: 'Public transport service gap' },
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

export interface RadarSeries {
  key: string;
  name: string;
  isBenchmark: boolean;
  /** Axes where the series has a value but it is not ranked (fewer than 5 LGAs with data in its group, R58). */
  notRanked: string[];
}

export interface RadarData {
  rows: RadarRow[];
  series: RadarSeries[];
  /** Selected areas beyond `MAX_RADAR_AREAS`, which are not drawn. */
  hiddenAreas: number;
}

const GSYD_KEY = 'gsyd';

/**
 * Need percentiles (0-100, 100 = most need, unrounded) of the first `MAX_RADAR_AREAS` areas on the five axes,
 * within each area's comparison group, plus Greater Sydney when the universe used is NSW or Greater Sydney. A
 * percentile that does not exist is null, which the chart draws as a gap, never as 0. Series keys are `a0`, `a1`
 * ... for the areas (selection order) and `gsyd`.
 */
export function radarData(a: NeedsAssessment): RadarData {
  const shown = a.areas.slice(0, MAX_RADAR_AREAS);
  const drawn: Array<Omit<RadarSeries, 'notRanked'> & { area: AreaAssessment }> = [
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
  const notRankedOf = (area: AreaAssessment) => RADAR_AXES
    .filter(({ id }) => area.indicators.find(s => s.id === id)?.unranked)
    .map(({ label }) => label);
  return {
    rows,
    series: drawn.map(({ key, name, isBenchmark, area }) => ({ key, name, isBenchmark, notRanked: notRankedOf(area) })),
    hiddenAreas: a.areas.length - shown.length,
  };
}

/**
 * The axes each drawn series has a gap on, for the notes under the chart: those with no data, or (`not_ranked`) those
 * with a value that is not ranked (R58). Series without such a gap are left out.
 */
export function radarGaps(
  { rows, series }: Pick<RadarData, 'rows' | 'series'>,
  kind: 'no_data' | 'not_ranked' = 'no_data',
): Array<{ name: string; axes: string[] }> {
  return series
    .map(s => ({
      name: s.name,
      axes: rows
        .filter(row => row[s.key] === null && s.notRanked.includes(row.axis) === (kind === 'not_ranked'))
        .map(row => row.axis),
    }))
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

/** A comparison group of the quadrant scatters: the LGAs the medians are taken over, and how the group is named. */
export interface QuadrantGroup {
  /** Unique among the groups of one assessment. */
  key: string;
  /** Plural noun phrase, used verbatim in sentences and legends: "metropolitan LGAs". */
  label: string;
  /** The group's LGAs. */
  records: LgaIndicatorRecord[];
  /** The Greater Sydney marker is drawn on the panels of Greater Sydney's own setting only. */
  showsGreaterSydney: boolean;
}

const METRO_LABEL = 'metropolitan LGAs';
const NON_METRO_LABEL = 'non-metropolitan LGAs';

/** The metro and non-metro halves of NSW, split as for the mismatch model. */
function settingGroup(a: NeedsAssessment, setting: Setting): QuadrantGroup {
  return {
    key: setting,
    label: setting === 'metro' ? METRO_LABEL : NON_METRO_LABEL,
    records: a.records.filter(r => settingOf(r.areaId) === setting),
    showsGreaterSydney: setting === 'metro',
  };
}

/** A combined selection across both settings is compared with NSW as a whole. */
function nswGroup(a: NeedsAssessment, area: AreaAssessment): QuadrantGroup {
  return { key: 'nsw', label: area.universeLabel, records: a.records, showsGreaterSydney: false };
}

/** The settings of the LGAs behind an area: its own, or those of a combined area's members. */
function settingsOf(a: NeedsAssessment, area: AreaAssessment): Set<Setting> {
  return new Set((a.mode === 'combined' ? a.memberIds : [area.areaId]).map(settingOf));
}

/**
 * The group an area is compared with on the quadrant scatters, which is not always the group its percentiles
 * are ranked in. NSW-wide medians are set by rural LGAs with almost no service, which would leave no Sydney LGA
 * in "low service", so against NSW an area is compared with the metropolitan or the non-metropolitan LGAs
 * (the setting all its LGAs share, else NSW as a whole). Greater Sydney, a region or a peer group is its own group.
 */
export function quadrantGroupOf(a: NeedsAssessment, area: AreaAssessment): QuadrantGroup {
  if (area.universe === 'nsw') {
    const settings = settingsOf(a, area);
    return settings.size === 1 ? settingGroup(a, Array.from(settings)[0]) : nswGroup(a, area);
  }
  return {
    key: `${area.universe}:${area.universeLabel}`,
    label: area.universeLabel,
    records: universeRecords(a.records, area.universe, area),
    showsGreaterSydney: area.universe === 'gsyd',
  };
}

/** The most comparison groups drawn for one figure. */
export const MAX_QUADRANT_PANELS = 3;

export interface QuadrantData {
  /** The comparison group's LGAs with both values, less the selected LGAs. */
  points: { areaId: string; name: string; x: number; y: number }[];
  /** The selected areas compared with this group (one for a combined area), in selection order; a missing value is null. */
  selected: { areaId: string; name: string; x: number | null; y: number | null; inNeedQuadrant: boolean }[];
  /** Medians of the group's LGAs with both values; NaN when the group has none. */
  medians: { x: number; y: number };
  /** Greater Sydney's values, on the panels that show its marker and when it has both. */
  greaterSydney: { x: number; y: number } | null;
  /** The x indicator's direction is 'lower' (SEIFA), so the axis runs high to low and more need is to the right. */
  xReversed: boolean;
  /** y stays natural: the need quadrant is the low-service side. */
  yReversed: false;
}

/** A value as the sentences print it, at the indicator's decimals. */
const asPrinted = (def: IndicatorDef, value: number): number => Number(value.toFixed(def.decimals));

/**
 * The side of the median that means more need for `def`, decided on the printed values: one that prints the same
 * as the median ("13.0% (median 13.0%)") is not past it, however far past it the unrounded value is.
 */
const pastMedian = (def: IndicatorDef, value: number, median: number): boolean => {
  const [shown, shownMedian] = [asPrinted(def, value), asPrinted(def, median)];
  return def.direction === 'higher' ? shown > shownMedian : shown < shownMedian;
};

/**
 * Both values are on the "more need" side of the group's medians: growth above and IRSD below the median,
 * departures per 1,000 residents below it, at the precision the sentences print (R54). A value on the median is on
 * neither side.
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
function statsOf(group: QuadrantGroup, spec: QuadrantSpec) {
  const complete = group.records.flatMap(record => {
    const [x, y] = [valueOf(record, spec.x), valueOf(record, spec.y)];
    return x !== null && y !== null ? [{ record, x, y }] : [];
  });
  const medians = complete.length > 0
    ? { x: median(complete.map(c => c.x)), y: median(complete.map(c => c.y)) }
    : { x: NaN, y: NaN };
  return { complete, medians };
}

/**
 * One comparison group's scatter: its LGAs with both values (grey points, less the selected LGAs), the selected
 * areas that are compared with it (a combined selection is one point), its medians and, on the panels that have
 * it, the Greater Sydney value. The medians count the selected LGAs, which belong to the group. `group` defaults
 * to the first selected area's.
 */
export function quadrantData(
  a: NeedsAssessment,
  spec: QuadrantSpec,
  group: QuadrantGroup | undefined = a.areas.length > 0 ? quadrantGroupOf(a, a.areas[0]) : undefined,
): QuadrantData {
  const { complete, medians } = group ? statsOf(group, spec) : { complete: [], medians: { x: NaN, y: NaN } };
  // A combined area stands for its member LGAs, which are not plotted again among the others
  const selectedIds = new Set([...a.areas.map(area => area.areaId), ...a.memberIds]);
  const gsyd = { x: scoreValue(a.benchmarks.gsyd, spec.x), y: scoreValue(a.benchmarks.gsyd, spec.y) };
  return {
    points: complete
      .filter(c => !selectedIds.has(c.record.areaId))
      .map(c => ({ areaId: c.record.areaId, name: c.record.name, x: c.x, y: c.y })),
    selected: a.areas.filter(area => group && quadrantGroupOf(a, area).key === group.key).map(area => {
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
    greaterSydney: group?.showsGreaterSydney && gsyd.x !== null && gsyd.y !== null ? { x: gsyd.x, y: gsyd.y } : null,
    xReversed: INDICATOR_BY_ID[spec.x].direction === 'lower',
    yReversed: false,
  };
}

export interface QuadrantPanel {
  group: QuadrantGroup;
  /** LGAs of the group with both values: what the medians are over. */
  n: number;
  data: QuadrantData;
}

export interface QuadrantPanels {
  /** At most `MAX_QUADRANT_PANELS` groups of the selected areas that are big enough, in selection order (metro before non-metro). */
  panels: QuadrantPanel[];
  /** Under the panels: why the comparison is within a setting, groups too small to compare against and groups not drawn. */
  notes: string[];
}

const SPANS_SETTINGS_NOTE = 'Selected LGAs span metropolitan and non-metropolitan settings; medians are NSW-wide.';

const hiddenGroupsNote = (n: number) => `${n} further comparison ${n === 1 ? 'group' : 'groups'} not shown.`;

/** R56: against NSW a setting's panel is not what the radar's NSW percentiles rank the area in. */
const settingNote = (labels: string[]) =>
  `Compared with ${labels.join(' and ')} rather than all NSW LGAs, because NSW-wide service medians are set by rural `
  + 'LGAs with little or no public transport.';

const smallGroupsNote = (groups: Array<{ label: string; n: number }>) =>
  `Too few LGAs to compare against a median: ${groups.map(g => `${g.label} (n = ${g.n})`).join(', ')}.`;

/**
 * The scatter drawn once for each comparison group present among the selected areas (R51): against NSW the
 * metropolitan and non-metropolitan LGAs, otherwise the one group, or each region or peer group. A group with fewer
 * than `SMALL_GROUP_SIZE` LGAs that have both values is not drawn (R55), as its median is a handful of points, and does
 * not count towards the limit of `MAX_QUADRANT_PANELS`; it is named in a note. Of the others the groups with a selected
 * area in a need quadrant are drawn first, then those in selection order; the rest are counted in a note. Each panel
 * has its own grey points and medians, and holds only the areas compared with it.
 */
export function quadrantPanels(a: NeedsAssessment, spec: QuadrantSpec): QuadrantPanels {
  const groups = new Map<string, QuadrantGroup>();
  for (const area of a.areas) {
    const group = quadrantGroupOf(a, area);
    if (!groups.has(group.key)) groups.set(group.key, group);
  }
  // Metropolitan LGAs first, as the mismatch charts do (the sort is stable)
  const ordered = Array.from(groups.values())
    .sort((p, q) => Number(q.key === 'metro') - Number(p.key === 'metro'))
    .map(group => ({ group, n: statsOf(group, spec).complete.length }));
  const small = ordered.filter(g => g.n < SMALL_GROUP_SIZE);
  const large = ordered.filter(g => g.n >= SMALL_GROUP_SIZE);

  const hasFinding = ({ group }: { group: QuadrantGroup }) => a.areas.some(
    area => quadrantGroupOf(a, area).key === group.key && areaQuadrantInsights(a, area, '').length > 0,
  );
  const chosen = new Set([...large.filter(hasFinding), ...large.filter(g => !hasFinding(g))].slice(0, MAX_QUADRANT_PANELS));
  const shown = large.filter(g => chosen.has(g));

  const settings = shown.filter(g => g.group.key === 'metro' || g.group.key === 'non_metro').map(g => g.group.label);
  const notes = [
    ...(shown.some(g => g.group.key === 'nsw') ? [SPANS_SETTINGS_NOTE] : []),
    ...(settings.length > 0 ? [settingNote(settings)] : []),
    ...(small.length > 0 ? [smallGroupsNote(small.map(g => ({ label: g.group.label, n: g.n })))] : []),
    ...(large.length > shown.length ? [hiddenGroupsNote(large.length - shown.length)] : []),
  ];
  return { panels: shown.map(({ group, n }) => ({ group, n, data: quadrantData(a, spec, group) })), notes };
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
 * A cited insight for each chart whose need quadrant the area is in, against the same group, medians and label as
 * the chart's panel for the area, so the shading and the sentence always agree. `subject` starts the sentence
 * ("Blacktown", "The combined area"). Severity is the mean of the area's two need percentiles over 100, ranked
 * within that same group (R52), among its LGAs with both values (the set the medians are over), not in the universe
 * the area is scored in: against NSW, Sydney's service looks good and its findings would rank below the panel that
 * shows them. Nothing for an area missing either value, nor for a group too small to have a median (R55).
 */
export function areaQuadrantInsights(a: NeedsAssessment, area: AreaAssessment, subject: string): Insight[] {
  const group = quadrantGroupOf(a, area);
  return QUADRANT_SCATTERS.flatMap((spec): Insight[] => {
    const [x, y] = [scoreValue(area, spec.x), scoreValue(area, spec.y)];
    const { complete, medians } = statsOf(group, spec);
    if (x === null || y === null || complete.length < SMALL_GROUP_SIZE || !inNeedQuadrant(spec, x, y, medians)) return [];

    const [xDef, yDef] = [INDICATOR_BY_ID[spec.x], INDICATOR_BY_ID[spec.y]];
    const xPercentile = needPercentile(x, complete.map(c => c.x), xDef.direction);
    const yPercentile = needPercentile(y, complete.map(c => c.y), yDef.direction);
    const wording = QUADRANT_WORDING[spec.id];
    return [{
      id: `quadrant:${area.areaId}:${spec.id}`,
      areaId: area.areaId,
      kind: 'quadrant',
      severity: (xPercentile + yPercentile) / 2 / 100,
      text: `${subject} is in the ${wording.group} group: ${wording.measure(formatValue(xDef, x), formatValue(xDef, medians.x))} `
        + `and ${y.toFixed(yDef.decimals)} AM-peak departures per 1,000 residents `
        + `(median ${medians.y.toFixed(yDef.decimals)}) among ${group.label}.`,
      citations: [xDef.source, yDef.source],
    }];
  });
}

/** Quadrant insights for every assessed area, each compared with its own group. */
export function quadrantInsights(a: NeedsAssessment): Insight[] {
  const combined = a.mode === 'combined' && a.memberIds.length >= 2;
  return a.areas.flatMap(area => areaQuadrantInsights(a, area, combined ? 'The combined area' : area.name));
}
