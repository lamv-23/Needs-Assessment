import { formatDiff, formatValue } from './format';
import { DOMAIN_LABELS, INDICATOR_BY_ID, NEED_DOMAINS } from './indicators';
import { KEY_NEED_PERCENTILE } from './scoring';
import type { AreaAssessment, IndicatorId, IndicatorScore, NeedDomain, NeedsAssessment, SourceRef } from './types';

export interface NarrativeParagraph { text: string; citations: SourceRef[] }
export interface NarrativeSection { id: 'summary' | NeedDomain | 'notes'; heading: string; paragraphs: NarrativeParagraph[] }

const MAX_SUMMARY_NEEDS = 3;

const WFH_CAVEAT =
  "The 2021 Census was held during Sydney's COVID-19 lockdown, which inflated working from home. "
  + 'Car dependency is therefore measured as a share of people who travelled to work.';

const METHOD_NOTE =
  'Need scores are the equally weighted mean of indicator percentiles within each domain, and of domain scores overall. '
  + 'Aboriginal and Torres Strait Islander share is shown for context and is not scored.';

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

/** A label inside a sentence: "Car dependency" becomes "car dependency", but "SEIFA ..." and "AM-peak ..." keep their capitals. */
function inSentence(label: string): string {
  const firstWord = label.split(' ')[0];
  return /[A-Z]/.test(firstWord.slice(1)) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

/** "a", "a and b", "a, b and c". */
function joinList(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function possessive(name: string): string {
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

const scoredIdsWithValue = (area: AreaAssessment, domain?: NeedDomain): IndicatorId[] => area.indicators
  .filter(s => {
    const def = INDICATOR_BY_ID[s.id];
    return def.scored && s.value !== null && (domain === undefined || def.domain === domain);
  })
  .map(s => s.id);

type KeyNeed = IndicatorScore & { value: number; percentile: number };

/** Key needs, highest percentile first (ties keep the registry order). */
function keyNeeds(area: AreaAssessment, domain?: NeedDomain): KeyNeed[] {
  return area.indicators
    .filter((s): s is KeyNeed => (
      s.keyNeed && s.value !== null && s.percentile !== null
      && (domain === undefined || INDICATOR_BY_ID[s.id].domain === domain)
    ))
    .sort((a, b) => b.percentile - a.percentile);
}

function summaryParagraphs(area: AreaAssessment, several: boolean): NarrativeParagraph[] {
  const overall = area.overall !== null && area.band !== null
    ? `${area.name} has ${area.band.toLowerCase()} overall need (score ${Math.round(area.overall)}/100, ranked against ${area.universeLabel}).`
    : `${area.name} has insufficient data for an overall need score.`;

  const top = keyNeeds(area).slice(0, MAX_SUMMARY_NEEDS);
  const needs = top.length > 0
    ? paragraph(
      `${several ? possessive(area.name) : 'Its'} most pronounced needs are ${joinList(top.map(n => inSentence(INDICATOR_BY_ID[n.id].label)))}.`,
      top.map(n => n.id),
    )
    : paragraph(
      `${several ? `In ${area.name}, no` : 'No'} indicator is in the highest-need ${100 - KEY_NEED_PERCENTILE}% of ${area.universeLabel}.`,
    );

  return [paragraph(overall, scoredIdsWithValue(area)), needs];
}

function keyNeedSentence(area: AreaAssessment, need: KeyNeed, greaterSydney: number | null): NarrativeParagraph {
  const def = INDICATOR_BY_ID[need.id];
  const rank = Math.max(1, Math.round(100 - need.percentile));
  let text = `${possessive(area.name)} ${inSentence(def.label)} (${formatValue(def, need.value)}) `
    + `ranks in the highest-need ${rank}% of ${area.universeLabel}`;
  if (greaterSydney !== null) {
    const diff = need.value - greaterSydney;
    const figure = `the Greater Sydney figure of ${formatValue(def, greaterSydney)}`;
    // A difference that rounds to zero is not "above" or "below" anything.
    text += Number(Math.abs(diff).toFixed(def.decimals)) === 0
      ? `, level with ${figure}`
      : `, ${formatDiff(def, Math.abs(diff))} ${diff > 0 ? 'above' : 'below'} ${figure}`;
  }
  return paragraph(`${text}.`, [need.id]);
}

function domainParagraphs(
  area: AreaAssessment,
  domain: NeedDomain,
  several: boolean,
  greaterSydney: AreaAssessment,
): NarrativeParagraph[] {
  const label = DOMAIN_LABELS[domain];
  const score = area.domains.find(d => d.domain === domain);
  const headline = score && score.score !== null && score.band !== null
    ? `${label}: ${score.band.toLowerCase()} (score ${Math.round(score.score)}/100).`
    : `${label}: insufficient data.`;

  return [
    paragraph(several ? `${area.name} — ${headline}` : headline, scoredIdsWithValue(area, domain)),
    ...keyNeeds(area, domain).map(need => keyNeedSentence(
      area,
      need,
      greaterSydney.indicators.find(s => s.id === need.id)?.value ?? null,
    )),
  ];
}

function notesParagraphs(assessment: NeedsAssessment): NarrativeParagraph[] {
  const { areas } = assessment;
  const notes: NarrativeParagraph[] = [];

  if (assessment.universeFallback) {
    notes.push(paragraph(FALLBACK_NOTES[assessment.requestedUniverse === 'region' ? 'region' : 'peer']));
  }

  // Areas that share a comparison group get one caution between them.
  const cautioned = new Set<string>();
  for (const area of areas.filter(a => a.smallGroup)) {
    const n = area.universeSize;
    const text = `The comparison group (${area.universeLabel}) has only ${n} ${n === 1 ? 'LGA' : 'LGAs'}, `
      + 'so percentiles should be read with caution.';
    if (!cautioned.has(text)) notes.push(paragraph(text));
    cautioned.add(text);
  }

  for (const area of areas) {
    const missing = area.indicators.filter(s => s.value === null && INDICATOR_BY_ID[s.id].scored).map(s => s.id);
    if (missing.length === 0) continue;
    notes.push(paragraph(
      `No data is available for ${joinList(missing.map(id => inSentence(INDICATOR_BY_ID[id].label)))} in ${area.name}; `
      + `${missing.length === 1 ? 'this is' : 'these are'} excluded from the scores.`,
      missing,
    ));
  }

  // Only a combined selection of several LGAs has weighted means standing in for sums; benchmarks are not narrated.
  if (assessment.mode === 'combined' && assessment.memberIds.length >= 2) {
    const approximate = Array.from(new Set(areas.flatMap(a => a.indicators.filter(s => s.approximate).map(s => s.id))));
    if (approximate.length > 0) {
      notes.push(paragraph(
        `Values for ${joinList(approximate.map(id => inSentence(INDICATOR_BY_ID[id].label)))} are population-weighted `
        + 'approximations because they cannot be summed across LGAs.',
        approximate,
      ));
    }
  }

  if (areas.some(a => a.indicators.some(s => s.id === 'car_dependency' && s.value !== null))) {
    notes.push(paragraph(WFH_CAVEAT, ['car_dependency']));
  }

  notes.push(paragraph(METHOD_NOTE));
  return notes;
}

/**
 * Written findings for the assessed areas, from templates filled with values, percentiles and the
 * Greater Sydney figure (no LLM). Each paragraph carries the sources of the indicators it uses.
 * With several areas (separate mode) every paragraph names its area. Empty when no area is selected.
 */
export function buildNarrative(assessment: NeedsAssessment): NarrativeSection[] {
  const { areas } = assessment;
  if (areas.length === 0) return [];
  const several = areas.length > 1;

  return [
    { id: 'summary', heading: 'Summary', paragraphs: areas.flatMap(a => summaryParagraphs(a, several)) },
    ...NEED_DOMAINS.map((domain): NarrativeSection => ({
      id: domain,
      heading: DOMAIN_LABELS[domain],
      paragraphs: areas.flatMap(a => domainParagraphs(a, domain, several, assessment.benchmarks.gsyd)),
    })),
    { id: 'notes', heading: 'Data notes', paragraphs: notesParagraphs(assessment) },
  ];
}

/** Headings and paragraphs as plain blocks separated by blank lines, without citations, for copying. */
export function narrativeToPlainText(sections: NarrativeSection[]): string {
  return sections.flatMap(s => [s.heading, ...s.paragraphs.map(p => p.text)]).join('\n\n');
}
