import { displayScore, inSentence, possessive } from './format';
import { DOMAIN_LABELS, INDICATOR_BY_ID, INDICATORS, NEED_DOMAINS } from './indicators';
import { buildInsights, isKeyNeed, keyNeedText, WFH_CAVEAT, type KeyNeed } from './insights';
import { nameList } from './insight-chart-data';
import {
  MAX_POCKETS, rankSa2s, SA2_INDICATOR_IDS, SA2_LOW_POPULATION, SA2_POCKET_SHARE, SA2_SHARE_THRESHOLD, sa2Pockets,
} from './sa2';
import { KEY_NEED_PERCENTILE, SA2_UNIVERSE_LABEL, SMALL_GROUP_SIZE } from './scoring';
import type {
  AreaAssessment, IndicatorId, IndicatorScore, Insight, NeedDomain, NeedsAssessment, Sa2NeedsFile, SourceRef,
} from './types';

export interface NarrativeParagraph { text: string; citations: SourceRef[] }
export interface NarrativeSection {
  id: 'key_findings' | 'summary' | NeedDomain | 'pockets' | 'insights' | 'notes';
  heading: string;
  paragraphs: NarrativeParagraph[];
}

/** The SA2 needs file the pockets of need are drawn from; the narrative has no pockets without it. */
export interface Sa2Narrative { file: Sa2NeedsFile }

const MAX_SUMMARY_NEEDS = 3;
const MAX_KEY_FINDINGS = 5;

/**
 * The kinds of insight listed under "Further findings", in order. Key needs are left out: each is already a
 * sentence of its domain's paragraphs, so listing it again would repeat it in a report.
 */
const FURTHER_KINDS: Insight['kind'][] = ['mismatch', 'trend', 'growth_service', 'quadrant', 'jobs_housing'];

/** How sentences refer to the areas being narrated. */
interface Wording {
  /** Several areas are narrated one after another (separate mode), so every sentence names its area. */
  several: boolean;
  /** One area standing for two or more selected LGAs, which the sentences call "the combined area". */
  combined: boolean;
}

const METHOD_NOTE =
  'Need scores are the equally weighted mean of indicator percentiles within each domain, and of domain scores overall. '
  + 'Aboriginal and Torres Strait Islander share and the share of stops with frequent AM-peak service are shown for '
  + 'context and are not scored.';

const FALLBACK_NOTES = {
  region: 'The selected LGAs span more than one region, so the combined area is ranked against NSW LGAs.',
  peer: 'The selected LGAs span more than one peer group, so the combined area is ranked against NSW LGAs.',
};

/** A sentence and the sources of the indicators it draws on, de-duplicated on the full reference. */
function paragraph(text: string, ids: IndicatorId[] = []): NarrativeParagraph {
  const sources = new Map<string, SourceRef>();
  for (const id of ids) {
    const source = INDICATOR_BY_ID[id].source;
    if (!sources.has(source.full)) sources.set(source.full, source);
  }
  return { text, citations: Array.from(sources.values()) };
}

/** Indicator labels as a list: "a", "a and b", "a, b and c". */
function labelList(ids: IndicatorId[]): string {
  const labels = ids.map(id => inSentence(INDICATOR_BY_ID[id].label));
  return labels.length < 2 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

const isScored = (score: IndicatorScore): boolean => INDICATOR_BY_ID[score.id].scored;

const scoredIdsWithValue = (area: AreaAssessment, domain?: NeedDomain): IndicatorId[] => area.indicators
  .filter(s => {
    const def = INDICATOR_BY_ID[s.id];
    return def.scored && s.value !== null && (domain === undefined || def.domain === domain);
  })
  .map(s => s.id);

/** Key needs, highest percentile first (ties keep the registry order). */
function keyNeeds(area: AreaAssessment, domain?: NeedDomain): KeyNeed[] {
  return area.indicators
    .filter((s): s is KeyNeed => isKeyNeed(s) && (domain === undefined || INDICATOR_BY_ID[s.id].domain === domain))
    .sort((a, b) => b.percentile - a.percentile);
}

/** Sentence-initial possessive: the area's name, "The combined area's", or (a lone area) "Its". */
function ownerOf(area: AreaAssessment, { several, combined }: Wording): string {
  if (combined) return "The combined area's";
  return several ? possessive(area.name) : 'Its';
}

function summaryParagraphs(area: AreaAssessment, wording: Wording): NarrativeParagraph[] {
  const subject = wording.combined ? `The combined area (${area.name})` : area.name;
  const overall = area.overall !== null && area.band !== null
    ? `${subject} has ${area.band.toLowerCase()} overall need (score ${displayScore(area.overall)}/100, ranked against ${area.universeLabel}).`
    : `${subject} has insufficient data for an overall need score.`;

  const top = keyNeeds(area).slice(0, MAX_SUMMARY_NEEDS);
  // With no scored indicator ranked (a group of fewer than 5, R58) there is nothing to be in the highest-need 20% of
  const anyRanked = area.indicators.some(s => isScored(s) && s.percentile !== null);
  let needs: NarrativeParagraph[] = [];
  if (top.length > 0) {
    needs = [paragraph(
      `${ownerOf(area, wording)} most pronounced needs are ${labelList(top.map(n => n.id))}.`,
      top.map(n => n.id),
    )];
  } else if (anyRanked) {
    needs = [paragraph(
      `${wording.several ? `In ${area.name}, no` : 'No'} indicator is in the highest-need ${100 - KEY_NEED_PERCENTILE}% of ${area.universeLabel}.`,
    )];
  }

  return [paragraph(overall, scoredIdsWithValue(area)), ...needs];
}

function keyNeedSentence(
  area: AreaAssessment,
  need: KeyNeed,
  greaterSydney: number | null,
  wording: Wording,
): NarrativeParagraph {
  const subject = wording.combined ? 'the combined area' : area.name;
  return paragraph(keyNeedText(subject, need, area, greaterSydney), [need.id]);
}

function domainParagraphs(
  area: AreaAssessment,
  domain: NeedDomain,
  wording: Wording,
  greaterSydney: AreaAssessment,
): NarrativeParagraph[] {
  const label = DOMAIN_LABELS[domain];
  const score = area.domains.find(d => d.domain === domain);
  const headline = score && score.score !== null && score.band !== null
    ? `${label}: ${score.band.toLowerCase()} (score ${displayScore(score.score)}/100).`
    : `${label}: insufficient data.`;

  return [
    paragraph(wording.several ? `${area.name} — ${headline}` : headline, scoredIdsWithValue(area, domain)),
    ...keyNeeds(area, domain).map(need => keyNeedSentence(
      area,
      need,
      greaterSydney.indicators.find(s => s.id === need.id)?.value ?? null,
      wording,
    )),
  ];
}

function notesParagraphs(assessment: NeedsAssessment, { combined }: Wording, sa2?: Sa2Narrative): NarrativeParagraph[] {
  const { areas } = assessment;
  const notes: NarrativeParagraph[] = [];

  if (assessment.universeFallback) {
    notes.push(paragraph(FALLBACK_NOTES[assessment.requestedUniverse === 'region' ? 'region' : 'peer']));
  }

  // Areas that share a comparison group get one note between them. In a group of fewer than 5 nothing is ranked (R58).
  const stated = new Set<string>();
  for (const area of areas.filter(a => a.smallGroup)) {
    const n = area.universeSize;
    const text = `The comparison group (${area.universeLabel}) has only ${n} ${n === 1 ? 'LGA' : 'LGAs'}, `
      + `fewer than ${SMALL_GROUP_SIZE}, so no indicator is ranked.`;
    if (!stated.has(text)) notes.push(paragraph(text));
    stated.add(text);
  }

  // R58: in a larger group, an indicator only a few of its LGAs have is not ranked either
  const unrankedByGroup = new Map<string, IndicatorId[]>();
  for (const area of areas.filter(a => !a.smallGroup)) {
    const ids = unrankedByGroup.get(area.universeLabel) ?? [];
    for (const s of area.indicators) if (s.unranked && isScored(s) && !ids.includes(s.id)) ids.push(s.id);
    unrankedByGroup.set(area.universeLabel, ids);
  }
  unrankedByGroup.forEach((ids, universeLabel) => {
    if (ids.length === 0) return;
    const ordered = INDICATORS.map(def => def.id).filter(id => ids.includes(id));
    notes.push(paragraph(
      `Some indicators have fewer than ${SMALL_GROUP_SIZE} LGAs with data in the comparison group (${universeLabel}) `
      + `and are not ranked: ${labelList(ordered)}.`,
      ordered,
    ));
  });

  for (const area of areas) {
    const missing = area.indicators.filter(s => s.value === null && isScored(s)).map(s => s.id);
    if (missing.length === 0) continue;
    notes.push(paragraph(
      `No data is available for ${labelList(missing)} in ${combined ? 'the combined area' : area.name}; `
      + `${missing.length === 1 ? 'this is' : 'these are'} excluded from the scores.`,
      missing,
    ));
  }

  // Only a combined selection of several LGAs has weighted means standing in for sums, or members
  // without data; benchmarks are not narrated.
  if (combined) {
    const approximate = Array.from(new Set(
      areas.flatMap(a => a.indicators.filter(s => s.approximate && isScored(s)).map(s => s.id)),
    ));
    if (approximate.length > 0) {
      notes.push(paragraph(
        `Values for ${labelList(approximate)} are population-weighted `
        + 'approximations because they cannot be summed across LGAs.',
        approximate,
      ));
    }

    for (const area of areas) {
      const partial = area.indicators.filter(s => s.partial && isScored(s)).map(s => s.id);
      if (partial.length === 0) continue;
      notes.push(paragraph(
        `Values for ${labelList(partial)} `
        + 'are based only on the selected LGAs that have data.',
        partial,
      ));
    }
  }

  if (areas.some(a => a.indicators.some(s => s.id === 'car_dependency' && s.value !== null))) {
    notes.push(paragraph(WFH_CAVEAT, ['car_dependency']));
  }

  if (sa2) notes.push(sa2Note(sa2.file));

  notes.push(paragraph(METHOD_NOTE));
  return notes;
}

/** The highest-need share of NSW SA2s a pocket of need is in, as written: "10%". */
const POCKET_SHARE_TEXT = `${Math.round(SA2_POCKET_SHARE * 100)}%`;

/** The indicators behind an SA2's overall score, which a statement about SA2 rankings cites. */
const SA2_SCORED_IDS = SA2_INDICATOR_IDS.filter(id => INDICATOR_BY_ID[id].scored);

/**
 * One paragraph per selected LGA, in selection order, also when combined (P2-R6: SA2s belong to LGAs, not to the
 * combined area): "Within {LGA}, {a}, {b} and {c} are in the highest-need 10% of NSW SA2s." with its top 3 pockets
 * of need, or "No SA2 in {LGA} is in the highest-need 10% of NSW SA2s.".
 */
function pocketsParagraphs(assessment: NeedsAssessment, file: Sa2NeedsFile): NarrativeParagraph[] {
  const names = new Map(assessment.records.map(r => [r.areaId, r.name]));
  return assessment.memberIds.flatMap(lgaId => {
    const name = names.get(lgaId);
    if (name === undefined) return [];
    const pockets = sa2Pockets(file, lgaId, MAX_POCKETS).map(e => e.record.name);
    const group = `the highest-need ${POCKET_SHARE_TEXT} of ${SA2_UNIVERSE_LABEL}`;
    const text = pockets.length === 0
      ? `No SA2 in ${name} is in ${group}.`
      : `Within ${name}, ${nameList(pockets)} ${pockets.length === 1 ? 'is' : 'are'} in ${group}.`;
    return [paragraph(text, SA2_SCORED_IDS)];
  });
}

/** What an SA2 need score covers and how SA2s are ranked and listed, for the data notes. */
function sa2Note(file: Sa2NeedsFile): NarrativeParagraph {
  return paragraph(
    'SA2 need scores use only the indicators available for SA2s, the Census indicators and residents near AM-peak '
    + 'public transport by straight-line distance, so they cover the transport and socio-economic domains and not '
    + 'growth. '
    + `SA2s are ranked against the ${rankSa2s(file).ranked} ${SA2_UNIVERSE_LABEL} with ${SA2_LOW_POPULATION} or more `
    + `residents, and an SA2 is listed for an LGA when at least ${Math.round(SA2_SHARE_THRESHOLD * 100)}% of its `
    + 'residents live there.',
  );
}

const insightParagraph = ({ text, citations }: Insight): NarrativeParagraph => ({ text, citations });

/**
 * Key findings (the most severe insights, at most 5) and further findings (the other mismatch, trend, growth
 * against service, quadrant and jobs-housing insights, grouped by kind, most severe first within a kind). A section with no
 * insight to hold is left out.
 */
function insightSections(assessment: NeedsAssessment): { keyFindings: NarrativeSection[]; further: NarrativeSection[] } {
  const insights = buildInsights(assessment);
  const top = insights.slice(0, MAX_KEY_FINDINGS);
  const rest = insights.slice(MAX_KEY_FINDINGS);
  const further = FURTHER_KINDS.flatMap(kind => rest.filter(i => i.kind === kind));
  return {
    keyFindings: top.length > 0
      ? [{ id: 'key_findings', heading: 'Key findings', paragraphs: top.map(insightParagraph) }]
      : [],
    further: further.length > 0
      ? [{ id: 'insights', heading: 'Further findings', paragraphs: further.map(insightParagraph) }]
      : [],
  };
}

/**
 * Written findings for the assessed areas, from templates filled with values, percentiles and the
 * Greater Sydney figure (no LLM). Each paragraph carries the sources of the indicators it uses.
 * With several areas (separate mode) every paragraph names its area. Empty when no area is selected.
 * Key findings come first; with the SA2 needs file, the pockets of need follow the domains; further findings come
 * after those.
 */
export function buildNarrative(assessment: NeedsAssessment, sa2?: Sa2Narrative): NarrativeSection[] {
  const { areas } = assessment;
  if (areas.length === 0) return [];
  const wording: Wording = {
    several: areas.length > 1,
    combined: assessment.mode === 'combined' && assessment.memberIds.length >= 2,
  };

  const { keyFindings, further } = insightSections(assessment);
  const pockets: NarrativeSection[] = sa2
    ? [{ id: 'pockets', heading: 'Pockets of need', paragraphs: pocketsParagraphs(assessment, sa2.file) }]
    : [];

  return [
    ...keyFindings,
    { id: 'summary', heading: 'Summary', paragraphs: areas.flatMap(a => summaryParagraphs(a, wording)) },
    ...NEED_DOMAINS.map((domain): NarrativeSection => ({
      id: domain,
      heading: DOMAIN_LABELS[domain],
      paragraphs: areas.flatMap(a => domainParagraphs(a, domain, wording, assessment.benchmarks.gsyd)),
    })),
    ...pockets,
    ...further,
    { id: 'notes', heading: 'Data notes', paragraphs: notesParagraphs(assessment, wording, sa2) },
  ];
}

/** Headings and paragraphs as plain blocks separated by blank lines, without citations, for copying. */
export function narrativeToPlainText(sections: NarrativeSection[]): string {
  return sections.flatMap(s => [s.heading, ...s.paragraphs.map(p => p.text)]).join('\n\n');
}
