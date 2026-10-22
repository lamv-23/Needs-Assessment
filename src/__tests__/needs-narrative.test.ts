import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { runAssessment } from '@/lib/needs/assess';
import { displayScore, formatDiff, formatValue } from '@/lib/needs/format';
import { DOMAIN_LABELS, INDICATOR_BY_ID, INDICATORS, NEED_DOMAINS } from '@/lib/needs/indicators';
import { buildInsights } from '@/lib/needs/insights';
import { buildNarrative, narrativeToPlainText, type NarrativeSection } from '@/lib/needs/narrative';
import { sourceNumber } from '@/lib/needs/page-data';
import type {
  AreaAssessment, IndicatorId, IndicatorScore, Insight, NeedBand, NeedDomain, NeedsAssessment, NeedsMode, Universe,
} from '@/lib/needs/types';

type Score = Partial<Omit<IndicatorScore, 'id'>>;

const METHOD_SENTENCE =
  'Need scores are the equally weighted mean of indicator percentiles within each domain, and of domain scores overall. '
  + 'Aboriginal and Torres Strait Islander share is shown for context and is not scored.';
const WFH_SENTENCE =
  "The 2021 Census was held during Sydney's COVID-19 lockdown, which inflated working from home. "
  + 'Car dependency is therefore measured as a share of people who travelled to work.';

/** An area with no values at all; `scores` fills in individual indicators. */
function makeArea(overrides: Partial<AreaAssessment> = {}, scores: Partial<Record<IndicatorId, Score>> = {}): AreaAssessment {
  return {
    areaId: 'lga_blacktown', name: 'Blacktown', region: 'Greater Sydney', population: 396776,
    peerGroup: 'metro_outer', universe: 'nsw', universeLabel: 'NSW LGAs', universeSize: 128, smallGroup: false,
    indicators: INDICATORS.map(def => ({
      id: def.id, value: null, percentile: null, keyNeed: false, approximate: false, partial: false,
      ...scores[def.id],
    })),
    domains: NEED_DOMAINS.map(domain => ({ domain, score: null, band: null, available: 0, total: 0 })),
    overall: null, band: null,
    ...overrides,
  };
}

function withDomain(area: AreaAssessment, domain: NeedDomain, score: number | null, band: NeedBand | null): AreaAssessment {
  return {
    ...area,
    domains: area.domains.map(d => (d.domain === domain ? { ...d, score, band } : d)),
  };
}

/**
 * Blacktown, as in the brief: overall 72.4 (High), car dependency 83.8 at p92 (a key need), households
 * without a car at p30 and no frequent-stop figure. Only these three indicators are listed.
 */
function blacktown(): AreaAssessment {
  const area = makeArea({ overall: 72.4, band: 'High' });
  const listed: IndicatorScore[] = [
    { id: 'car_dependency', value: 83.8, percentile: 92, keyNeed: true, approximate: false, partial: false },
    { id: 'zero_car_households', value: 8.2, percentile: 30, keyNeed: false, approximate: false, partial: false },
    { id: 'frequent_stop_share', value: null, percentile: null, keyNeed: false, approximate: false, partial: false },
  ];
  return withDomain(withDomain({ ...area, indicators: listed }, 'transport', 64.1, 'High'), 'socio', 41.6, 'Moderate');
}

function makeAssessment(areas: AreaAssessment[], overrides: Partial<NeedsAssessment> = {}): NeedsAssessment {
  const benchmark = (areaId: string, name: string): AreaAssessment => makeArea(
    { areaId, name, region: 'n/a', peerGroup: null },
    { car_dependency: { value: 66.3, percentile: 50, approximate: true } },
  );
  return {
    mode: 'separate',
    requestedUniverse: 'nsw',
    universe: 'nsw',
    universeFallback: false,
    areas,
    memberIds: areas.map(a => a.areaId),
    invalidIds: [],
    benchmarks: { gsyd: benchmark('benchmark_gsy', 'Greater Sydney'), nsw: benchmark('benchmark_nsw', 'NSW') },
    benchmarkRecords: {} as NeedsAssessment['benchmarkRecords'],
    records: [],
    generatedAt: '2026-10-22T00:00:00.000Z',
    ...overrides,
  };
}

/** Every indicator has a value except those listed. */
const withValues = (missing: IndicatorId[]): Partial<Record<IndicatorId, Score>> => Object.fromEntries(
  INDICATORS.filter(def => !missing.includes(def.id)).map(def => [def.id, { value: 10, percentile: 50 }]),
);

const section = (sections: NarrativeSection[], id: NarrativeSection['id']) => {
  const found = sections.find(s => s.id === id);
  if (!found) throw new Error(`no ${id} section`);
  return found;
};
const texts = (s: NarrativeSection) => s.paragraphs.map(p => p.text);

describe('formatValue', () => {
  const def = (id: IndicatorId) => INDICATOR_BY_ID[id];

  test('null is "No data", never 0', () => {
    expect(formatValue(def('car_dependency'), null)).toBe('No data');
    expect(formatValue(def('seifa_irsd'), null)).toBe('No data');
  });

  test('formats each unit with the indicator\'s decimals', () => {
    expect(formatValue(def('car_dependency'), 83.8)).toBe('83.8%');
    expect(formatValue(def('car_dependency'), 83.77)).toBe('83.8%');
    expect(formatValue(def('seifa_irsd'), 987.4)).toBe('987');
    expect(formatValue(def('approvals_per_1000'), 10)).toBe('10.0 per 1,000');
    expect(formatValue(def('crash_rate'), 4.56)).toBe('4.6 per 10,000');
    expect(formatValue(def('commute_distance_km'), 12.34)).toBe('12.3 km');
  });

  test('a genuine 0 is shown, and a negative that rounds to zero loses its sign', () => {
    expect(formatValue(def('zero_car_households'), 0)).toBe('0.0%');
    expect(formatValue(def('pop_growth_2041'), -3.24)).toBe('-3.2%');
    expect(formatValue(def('pop_growth_2041'), -0.04)).toBe('0.0%');
  });
});

describe('formatDiff', () => {
  const def = (id: IndicatorId) => INDICATOR_BY_ID[id];

  test('% differences are percentage points, scores are points, others keep their unit', () => {
    expect(formatDiff(def('car_dependency'), 12)).toBe('12.0 pp');
    expect(formatDiff(def('seifa_irsd'), 33)).toBe('33 points');
    expect(formatDiff(def('commute_distance_km'), 2.34)).toBe('2.3 km');
    expect(formatDiff(def('approvals_per_1000'), 1.26)).toBe('1.3 per 1,000');
    expect(formatDiff(def('crash_rate'), 0.5)).toBe('0.5 per 10,000');
  });
});

describe('displayScore', () => {
  test('rounds down, so a shown score never reaches a band threshold its band does not', () => {
    expect(displayScore(59.9)).toBe(59);
    expect(displayScore(39.81)).toBe(39);
    expect(displayScore(79.999)).toBe(79);
    expect(displayScore(60)).toBe(60);
    expect(displayScore(0)).toBe(0);
    expect(displayScore(72.4)).toBe(72);
  });
});

describe('buildNarrative: structure', () => {
  test('sections run summary, the domains in order, then notes', () => {
    const sections = buildNarrative(makeAssessment([blacktown()]));
    expect(sections.map(s => s.id)).toEqual(['summary', 'transport', 'socio', 'growth', 'notes']);
    expect(sections.map(s => s.heading)).toEqual([
      'Summary', DOMAIN_LABELS.transport, DOMAIN_LABELS.socio, DOMAIN_LABELS.growth, 'Data notes',
    ]);
  });

  test('nothing selected gives no sections', () => {
    expect(buildNarrative(makeAssessment([]))).toEqual([]);
  });
});

describe('buildNarrative: summary', () => {
  const summary = section(buildNarrative(makeAssessment([blacktown()])), 'summary');

  test('overall band and universe', () => {
    expect(summary.paragraphs[0].text).toBe('Blacktown has high overall need (score 72/100, ranked against NSW LGAs).');
  });

  test('key needs only, as a list', () => {
    expect(summary.paragraphs[1].text).toBe('Its most pronounced needs are car dependency.');
  });

  test('top 3 key needs by percentile, joined "a, b and c", with acronyms kept upper case', () => {
    const area = makeArea({ overall: 85, band: 'Very high' }, {
      car_dependency: { value: 90, percentile: 85, keyNeed: true },
      seifa_irsd: { value: 800, percentile: 99, keyNeed: true },
      crash_rate: { value: 12, percentile: 95, keyNeed: true },
      frequent_stop_share: { value: 5, percentile: 90, keyNeed: true },
      limited_english: { value: 30, percentile: 82, keyNeed: true },
    });
    const text = section(buildNarrative(makeAssessment([area])), 'summary').paragraphs[1].text;
    expect(text).toBe(
      'Its most pronounced needs are SEIFA disadvantage (IRSD), road crashes per 10,000 residents '
      + 'and stops with frequent AM-peak service.',
    );
  });

  test('two key needs are joined with "and" only', () => {
    const area = makeArea({ overall: 70, band: 'High' }, {
      car_dependency: { value: 90, percentile: 85, keyNeed: true },
      crash_rate: { value: 12, percentile: 95, keyNeed: true },
    });
    const text = section(buildNarrative(makeAssessment([area])), 'summary').paragraphs[1].text;
    expect(text).toBe('Its most pronounced needs are road crashes per 10,000 residents and car dependency.');
  });

  test('a context indicator with a high percentile never appears as a key need', () => {
    const area = makeArea({ overall: 50, band: 'Moderate' }, {
      indigenous_share: { value: 30, percentile: 99, keyNeed: false },
    });
    const sections = buildNarrative(makeAssessment([area]));
    expect(section(sections, 'summary').paragraphs[1].text).toBe('No indicator is in the highest-need 20% of NSW LGAs.');
    expect(texts(section(sections, 'socio')).join('\n')).not.toContain('Aboriginal');
  });

  test('no key needs', () => {
    const area = makeArea({ overall: 30, band: 'Lower', universeLabel: 'regional cities' }, {
      car_dependency: { value: 60, percentile: 40 },
    });
    const noNeeds = section(buildNarrative(makeAssessment([area])), 'summary');
    expect(noNeeds.paragraphs[0].text).toBe('Blacktown has lower overall need (score 30/100, ranked against regional cities).');
    expect(noNeeds.paragraphs[1].text).toBe('No indicator is in the highest-need 20% of regional cities.');
    expect(noNeeds.paragraphs[1].citations).toEqual([]);
  });

  test('no overall score says so instead of inventing one', () => {
    const text = section(buildNarrative(makeAssessment([makeArea()])), 'summary').paragraphs[0].text;
    expect(text).toBe('Blacktown has insufficient data for an overall need score.');
  });

  test('the overall sentence cites every scored source used; the key-need list cites just those indicators', () => {
    const area = makeArea({ overall: 72.4, band: 'High' }, {
      car_dependency: { value: 83.8, percentile: 92, keyNeed: true },
      seifa_irsd: { value: 950, percentile: 50 },
      indigenous_share: { value: 5, percentile: 20 },
    });
    const { paragraphs } = section(buildNarrative(makeAssessment([area])), 'summary');
    expect(paragraphs[0].citations.map(c => c.short)).toEqual(['ABS Census 2021 G62', 'ABS SEIFA 2021']);
    expect(paragraphs[1].citations.map(c => c.short)).toEqual(['ABS Census 2021 G62']);
  });

  test('separate mode with two areas gives each its own named summary paragraphs', () => {
    const penrith = makeArea(
      { areaId: 'lga_penrith', name: 'Penrith', overall: 35, band: 'Lower' },
      { crash_rate: { value: 3, percentile: 20 } },
    );
    const sections = buildNarrative(makeAssessment([blacktown(), penrith]));
    expect(texts(section(sections, 'summary'))).toEqual([
      'Blacktown has high overall need (score 72/100, ranked against NSW LGAs).',
      "Blacktown's most pronounced needs are car dependency.",
      'Penrith has lower overall need (score 35/100, ranked against NSW LGAs).',
      'In Penrith, no indicator is in the highest-need 20% of NSW LGAs.',
    ]);
  });
});

describe('buildNarrative: domain sections', () => {
  const transport = section(buildNarrative(makeAssessment([blacktown()])), 'transport');

  test('first paragraph is the domain band and score', () => {
    expect(transport.paragraphs[0].text).toBe('Transport disadvantage: high (score 64/100).');
  });

  test('a domain without a score is insufficient data', () => {
    const sections = buildNarrative(makeAssessment([blacktown()]));
    expect(section(sections, 'growth').paragraphs[0].text).toBe('Growth pressure: insufficient data.');
    expect(texts(section(sections, 'socio'))[0]).toBe('Socio-economic disadvantage: moderate (score 41/100).');
  });

  test('key-need sentence has the value, rank, universe and the Greater Sydney comparison', () => {
    expect(texts(transport)).toContain(
      'On car dependency, Blacktown (83.8%) ranks in the highest-need 8% of NSW LGAs, '
      + '17.5 pp above the Greater Sydney figure of 66.3%.',
    );
  });

  test('only key needs of the domain get sentences; the rest are summarised by the score', () => {
    expect(transport.paragraphs).toHaveLength(2);
    expect(section(buildNarrative(makeAssessment([blacktown()])), 'socio').paragraphs).toHaveLength(1);
  });

  test('every key-need sentence cites the indicator source', () => {
    const sentence = transport.paragraphs.find(p => p.text.includes('On car dependency, Blacktown (83.8%)'));
    expect(sentence?.citations[0].short).toBe('ABS Census 2021 G62');
    expect(sentence?.citations).toEqual([INDICATOR_BY_ID.car_dependency.source]);
  });

  test('the domain sentence cites the sources of its scored indicators, once each', () => {
    const area = withDomain(makeArea({ overall: 60, band: 'High' }, {
      car_dependency: { value: 80, percentile: 70 },
      zero_car_households: { value: 8, percentile: 30 },
      frequent_stop_share: { value: 20, percentile: 60 },
      am_peak_departures_per_1000: { value: 20, percentile: 60 },
    }), 'transport', 55, 'Moderate');
    const { paragraphs } = section(buildNarrative(makeAssessment([area])), 'transport');
    expect(paragraphs[0].citations.map(c => c.short)).toEqual([
      'ABS Census 2021 G62', 'ABS Census 2021 G34', 'TfNSW GTFS',
    ]);
  });

  test('key needs run from highest percentile down', () => {
    const area = withDomain(makeArea({ overall: 75, band: 'High' }, {
      car_dependency: { value: 83.8, percentile: 85, keyNeed: true },
      crash_rate: { value: 9, percentile: 97, keyNeed: true },
    }), 'transport', 70, 'High');
    const sentences = texts(section(buildNarrative(makeAssessment([area])), 'transport')).slice(1);
    expect(sentences[0]).toContain('On road crashes per 10,000 residents, Blacktown (9.0 per 10,000) ranks in the highest-need 3%');
    expect(sentences[1]).toContain('On car dependency, Blacktown (83.8%) ranks in the highest-need 15%');
  });

  test('"highest-need k%" is at least 1%', () => {
    const area = makeArea({ overall: 75, band: 'High' }, {
      car_dependency: { value: 99, percentile: 99.8, keyNeed: true },
    });
    expect(texts(section(buildNarrative(makeAssessment([area])), 'transport'))[1]).toContain('highest-need 1% of');
  });

  test('"below" when the value is under the Greater Sydney figure (a lower-is-more-need indicator)', () => {
    const area = makeArea({ overall: 75, band: 'High' }, {
      frequent_stop_share: { value: 10, percentile: 95, keyNeed: true },
    });
    const assessment = makeAssessment([area]);
    assessment.benchmarks.gsyd = makeArea({ areaId: 'benchmark_gsy', name: 'Greater Sydney' }, {
      frequent_stop_share: { value: 40, percentile: 50 },
    });
    expect(texts(section(buildNarrative(assessment), 'transport'))[1]).toBe(
      'On stops with frequent AM-peak service, Blacktown (10.0%) ranks in the highest-need 5% of NSW LGAs, '
      + '30.0 pp below the Greater Sydney figure of 40.0%.',
    );
  });

  test('SEIFA differences are in points', () => {
    const area = makeArea({ overall: 75, band: 'High' }, {
      seifa_irsd: { value: 850, percentile: 96, keyNeed: true },
    });
    const assessment = makeAssessment([area]);
    assessment.benchmarks.gsyd = makeArea({ areaId: 'benchmark_gsy', name: 'Greater Sydney' }, {
      seifa_irsd: { value: 1017.4, percentile: 50 },
    });
    expect(texts(section(buildNarrative(assessment), 'socio'))[1]).toBe(
      'On SEIFA disadvantage (IRSD), Blacktown (850) ranks in the highest-need 4% of NSW LGAs, '
      + '167 points below the Greater Sydney figure of 1017.',
    );
  });

  test('the Greater Sydney clause is dropped when that figure is missing', () => {
    const assessment = makeAssessment([blacktown()]);
    assessment.benchmarks.gsyd = makeArea({ areaId: 'benchmark_gsy', name: 'Greater Sydney' });
    expect(texts(section(buildNarrative(assessment), 'transport'))).toContain(
      'On car dependency, Blacktown (83.8%) ranks in the highest-need 8% of NSW LGAs.',
    );
  });

  test('a difference that rounds to nothing is "level with", not "0.0 pp above"', () => {
    const assessment = makeAssessment([makeArea({ overall: 75, band: 'High' }, {
      car_dependency: { value: 66.32, percentile: 90, keyNeed: true },
    })]);
    expect(texts(section(buildNarrative(assessment), 'transport'))[1]).toBe(
      'On car dependency, Blacktown (66.3%) ranks in the highest-need 10% of NSW LGAs, '
      + 'level with the Greater Sydney figure of 66.3%.',
    );
  });

  test('the subject is the plain area name, so plural-looking names and indicator labels agree', () => {
    const area = makeArea({ name: 'Blue Mountains', overall: 75, band: 'High' }, {
      zero_car_households: { value: 6, percentile: 92, keyNeed: true },
    });
    expect(texts(section(buildNarrative(makeAssessment([area])), 'transport'))[1]).toMatch(
      /^On households without a car, Blue Mountains \(6\.0%\) ranks in the highest-need 8% of NSW LGAs/,
    );
  });

  test('a name ending in s takes an apostrophe only in the summary of several areas', () => {
    const area = makeArea({ name: 'Blue Mountains', overall: 75, band: 'High' }, {
      car_dependency: { value: 83.8, percentile: 92, keyNeed: true },
    });
    const other = makeArea({ areaId: 'lga_penrith', name: 'Penrith', overall: 50, band: 'Moderate' });
    expect(texts(section(buildNarrative(makeAssessment([area, other])), 'summary'))[1])
      .toBe("Blue Mountains' most pronounced needs are car dependency.");
  });

  test('separate mode prefixes each area\'s domain line with its name, grouped by area', () => {
    const penrith = withDomain(makeArea(
      { areaId: 'lga_penrith', name: 'Penrith', overall: 50, band: 'Moderate' },
      { crash_rate: { value: 9, percentile: 97, keyNeed: true } },
    ), 'transport', 45, 'Moderate');
    const sentences = texts(section(buildNarrative(makeAssessment([blacktown(), penrith])), 'transport'));
    expect(sentences).toEqual([
      'Blacktown — Transport disadvantage: high (score 64/100).',
      'On car dependency, Blacktown (83.8%) ranks in the highest-need 8% of NSW LGAs, '
      + '17.5 pp above the Greater Sydney figure of 66.3%.',
      'Penrith — Transport disadvantage: moderate (score 45/100).',
      'On road crashes per 10,000 residents, Penrith (9.0 per 10,000) ranks in the highest-need 3% of NSW LGAs.',
    ]);
  });
});

describe('buildNarrative: displayed scores', () => {
  const lines = (score: number, band: NeedBand) => {
    const area = withDomain(makeArea({ overall: score, band }), 'transport', score, band);
    const sections = buildNarrative(makeAssessment([area]));
    return [texts(section(sections, 'summary'))[0], texts(section(sections, 'transport'))[0]];
  };

  test('59.9 is Moderate and shows 59, not 60', () => {
    expect(lines(59.9, 'Moderate')).toEqual([
      'Blacktown has moderate overall need (score 59/100, ranked against NSW LGAs).',
      'Transport disadvantage: moderate (score 59/100).',
    ]);
  });

  test('39.81 is Lower and shows 39', () => {
    expect(lines(39.81, 'Lower')).toEqual([
      'Blacktown has lower overall need (score 39/100, ranked against NSW LGAs).',
      'Transport disadvantage: lower (score 39/100).',
    ]);
  });

  test('exactly 60 is High and shows 60', () => {
    expect(lines(60, 'High')).toEqual([
      'Blacktown has high overall need (score 60/100, ranked against NSW LGAs).',
      'Transport disadvantage: high (score 60/100).',
    ]);
  });

  test('on real data a displayed score never reaches a band threshold its band does not', () => {
    const floorBand = (n: number) => (n >= 80 ? 'very high' : n >= 60 ? 'high' : n >= 40 ? 'moderate' : 'lower');
    for (const record of NEEDS_SNAPSHOT.records) {
      const sections = buildNarrative(
        runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds: [record.areaId], mode: 'separate', universe: 'nsw' }),
      );
      const shown = sections.flatMap(texts).flatMap(t => Array.from(t.matchAll(/(very high|high|moderate|lower)[^(]*\(score (\d+)\/100/g)));
      expect(shown.length).toBeGreaterThan(0);
      for (const [, band, score] of shown) expect(floorBand(Number(score))).toBe(band);
    }
  });
});

describe('buildNarrative: data notes', () => {
  const notesOf = (assessment: NeedsAssessment) => texts(section(buildNarrative(assessment), 'notes'));

  test('missing scored indicators are listed with the area name', () => {
    expect(notesOf(makeAssessment([blacktown()]))).toContain(
      'No data is available for stops with frequent AM-peak service in Blacktown; this is excluded from the scores.',
    );
  });

  test('plural wording for several missing indicators', () => {
    const area = makeArea({}, withValues(['frequent_stop_share', 'am_peak_departures_per_1000', 'job_growth_2041']));
    expect(notesOf(makeAssessment([area]))).toContain(
      'No data is available for stops with frequent AM-peak service, AM-peak departures per 1,000 residents '
      + 'and job growth 2021–41 in Blacktown; these are excluded from the scores.',
    );
  });

  test('a missing context indicator is not claimed to be excluded from the scores', () => {
    const area = makeArea({}, withValues(['indigenous_share']));
    expect(notesOf(makeAssessment([area])).filter(t => t.startsWith('No data'))).toEqual([]);
  });

  test('missing notes cite the sources of the indicators concerned', () => {
    const notes = section(buildNarrative(makeAssessment([blacktown()])), 'notes');
    const missing = notes.paragraphs.find(p => p.text.startsWith('No data is available for stops'));
    expect(missing?.citations.map(c => c.short)).toEqual(['TfNSW GTFS']);
  });

  test('the WFH caveat is included when car dependency is shown, citing its source', () => {
    const notes = section(buildNarrative(makeAssessment([blacktown()])), 'notes');
    const wfh = notes.paragraphs.find(p => p.text === WFH_SENTENCE);
    expect(wfh).toBeDefined();
    expect(wfh?.citations.map(c => c.short)).toEqual(['ABS Census 2021 G62']);
  });

  test('the WFH caveat is omitted when no area has car dependency', () => {
    expect(notesOf(makeAssessment([makeArea()]))).not.toContain(WFH_SENTENCE);
  });

  describe('combined approximations', () => {
    const combinedArea = makeArea(
      { areaId: 'combined', name: 'Blacktown + Penrith', overall: 50, band: 'Moderate' },
      {
        car_dependency: { value: 80, percentile: 50, approximate: true },
        seifa_irsd: { value: 950, percentile: 50, approximate: true },
        zero_car_households: { value: 8, percentile: 50 },
      },
    );

    test('are noted for a combined area of two or more LGAs', () => {
      const assessment = makeAssessment([combinedArea], { mode: 'combined', memberIds: ['lga_blacktown', 'lga_penrith'] });
      const note = section(buildNarrative(assessment), 'notes').paragraphs
        .find(p => p.text.startsWith('Values for'));
      expect(note?.text).toBe(
        'Values for car dependency and SEIFA disadvantage (IRSD) are population-weighted approximations '
        + 'because they cannot be summed across LGAs.',
      );
      expect(note?.citations.map(c => c.short)).toEqual(['ABS Census 2021 G62', 'ABS SEIFA 2021']);
    });

    test('a single SEIFA indicator reads as in the brief', () => {
      const area = makeArea(
        { areaId: 'combined', name: 'Blacktown + Penrith', overall: 50, band: 'Moderate' },
        { seifa_irsd: { value: 950, percentile: 50, approximate: true } },
      );
      const assessment = makeAssessment([area], { mode: 'combined', memberIds: ['lga_blacktown', 'lga_penrith'] });
      expect(notesOf(assessment)).toContain(
        'Values for SEIFA disadvantage (IRSD) are population-weighted approximations because they cannot be summed across LGAs.',
      );
    });

    test('list scored indicators only, like the missing-data note', () => {
      const area = makeArea(
        { areaId: 'combined', name: 'Blacktown + Penrith', overall: 50, band: 'Moderate' },
        {
          seifa_irsd: { value: 950, percentile: 50, approximate: true },
          indigenous_share: { value: 5, percentile: 50, approximate: true },
        },
      );
      const memberIds = ['lga_blacktown', 'lga_penrith'];
      expect(notesOf(makeAssessment([area], { mode: 'combined', memberIds }))).toContain(
        'Values for SEIFA disadvantage (IRSD) are population-weighted approximations because they cannot be summed across LGAs.',
      );
      const onlyContext = makeArea(
        { areaId: 'combined', name: 'Blacktown + Penrith', overall: 50, band: 'Moderate' },
        { indigenous_share: { value: 5, percentile: 50, approximate: true } },
      );
      expect(notesOf(makeAssessment([onlyContext], { mode: 'combined', memberIds })).join('\n'))
        .not.toContain('approximations');
    });

    test('are not noted for a combined area of one LGA', () => {
      const assessment = makeAssessment([combinedArea], { mode: 'combined', memberIds: ['lga_blacktown'] });
      expect(notesOf(assessment).join('\n')).not.toContain('approximations');
    });

    test('are not noted in separate mode, and never for benchmarks', () => {
      // makeAssessment flags the benchmarks' car dependency as approximate (as runAssessment does)
      const assessment = makeAssessment([blacktown()]);
      expect(assessment.benchmarks.gsyd.indicators.some(i => i.approximate)).toBe(true);
      expect(notesOf(assessment).join('\n')).not.toContain('approximations');
      const combined = makeAssessment([makeArea({ areaId: 'combined', overall: 50, band: 'Moderate' })], {
        mode: 'combined', memberIds: ['lga_blacktown', 'lga_penrith'],
      });
      expect(notesOf(combined).join('\n')).not.toContain('approximations');
    });
  });

  describe('partial data in a combined selection', () => {
    const partialArea = makeArea(
      { areaId: 'combined', name: 'Blacktown + Penrith', overall: 50, band: 'Moderate' },
      {
        car_dependency: { value: 80, percentile: 50, approximate: true, partial: true },
        crash_rate: { value: 9, percentile: 50, partial: true },
        seifa_irsd: { value: 950, percentile: 50, approximate: true },
      },
    );
    const combined = (area: AreaAssessment, memberIds: string[]) =>
      makeAssessment([area], { mode: 'combined', memberIds });

    test('are noted once, after the approximation note, citing the indicators concerned', () => {
      const notes = section(buildNarrative(combined(partialArea, ['lga_blacktown', 'lga_penrith'])), 'notes').paragraphs;
      const partial = notes.filter(p => p.text.includes('selected LGAs that have data'));
      expect(partial).toHaveLength(1);
      expect(partial[0].text).toBe(
        'Values for car dependency and road crashes per 10,000 residents are based only on the selected LGAs that have data.',
      );
      expect(partial[0].citations.map(c => c.short)).toEqual(['ABS Census 2021 G62', 'TfNSW Centre for Road Safety']);
      const noteTexts = notes.map(p => p.text);
      expect(noteTexts.indexOf(partial[0].text)).toBe(noteTexts.findIndex(t => t.includes('population-weighted')) + 1);
    });

    test('a single partial indicator reads as a list of one', () => {
      const area = makeArea(
        { areaId: 'combined', name: 'Blacktown + Penrith', overall: 50, band: 'Moderate' },
        { seifa_irsd: { value: 950, percentile: 50, approximate: true, partial: true } },
      );
      expect(notesOf(combined(area, ['lga_blacktown', 'lga_penrith']))).toContain(
        'Values for SEIFA disadvantage (IRSD) are based only on the selected LGAs that have data.',
      );
    });

    test('list scored indicators only', () => {
      const memberIds = ['lga_blacktown', 'lga_penrith'];
      const mixed = makeArea({ areaId: 'combined', overall: 50, band: 'Moderate' }, {
        crash_rate: { value: 9, percentile: 50, partial: true },
        indigenous_share: { value: 5, percentile: 50, partial: true },
      });
      expect(notesOf(combined(mixed, memberIds))).toContain(
        'Values for road crashes per 10,000 residents are based only on the selected LGAs that have data.',
      );
      const onlyContext = makeArea({ areaId: 'combined', overall: 50, band: 'Moderate' }, {
        indigenous_share: { value: 5, percentile: 50, partial: true },
      });
      expect(notesOf(combined(onlyContext, memberIds)).join('\n')).not.toContain('selected LGAs that have data');
    });

    test('are not noted when nothing is partial, in separate mode, or for a single-LGA combined area', () => {
      const none = makeArea({ areaId: 'combined', overall: 50, band: 'Moderate' }, {
        seifa_irsd: { value: 950, percentile: 50, approximate: true },
      });
      expect(notesOf(combined(none, ['lga_blacktown', 'lga_penrith'])).join('\n')).not.toContain('selected LGAs that have data');
      expect(notesOf(makeAssessment([partialArea])).join('\n')).not.toContain('selected LGAs that have data');
      expect(notesOf(combined(partialArea, ['lga_blacktown'])).join('\n')).not.toContain('selected LGAs that have data');
    });
  });

  describe('small comparison groups', () => {
    test('singular for one LGA', () => {
      const area = makeArea({ smallGroup: true, universeSize: 1, universeLabel: 'LGAs in the Central Coast region' });
      expect(notesOf(makeAssessment([area]))).toContain(
        'The comparison group (LGAs in the Central Coast region) has only 1 LGA, so percentiles should be read with caution.',
      );
    });

    test('plural for several, and stated once for areas sharing the group', () => {
      const small = { smallGroup: true, universeSize: 3, universeLabel: 'rural and remote LGAs' };
      const a = makeArea({ areaId: 'lga_a', name: 'A', ...small });
      const b = makeArea({ areaId: 'lga_b', name: 'B', ...small });
      const caution = notesOf(makeAssessment([a, b])).filter(t => t.includes('read with caution'));
      expect(caution).toEqual([
        'The comparison group (rural and remote LGAs) has only 3 LGAs, so percentiles should be read with caution.',
      ]);
    });

    test('not mentioned for a large group', () => {
      expect(notesOf(makeAssessment([blacktown()])).join('\n')).not.toContain('read with caution');
    });
  });

  describe('universe fallback', () => {
    const combinedArea = makeArea({ areaId: 'combined', name: 'Blacktown + Newcastle', overall: 50, band: 'Moderate' });
    const fallbackNotes = (requestedUniverse: Universe, mode: NeedsMode = 'combined') => notesOf(makeAssessment(
      [combinedArea],
      { mode, requestedUniverse, universe: 'nsw', universeFallback: true, memberIds: ['lga_blacktown', 'lga_newcastle'] },
    )).filter(t => t.includes('ranked against NSW LGAs'));

    test('region', () => {
      expect(fallbackNotes('region')).toEqual([
        'The selected LGAs span more than one region, so the combined area is ranked against NSW LGAs.',
      ]);
    });

    test('peer group', () => {
      expect(fallbackNotes('peer')).toEqual([
        'The selected LGAs span more than one peer group, so the combined area is ranked against NSW LGAs.',
      ]);
    });

    test('absent when there was no fallback', () => {
      expect(notesOf(makeAssessment([blacktown()])).join('\n')).not.toContain('span more than one');
    });
  });

  test('the notes always end with the method sentence, exactly once', () => {
    for (const assessment of [
      makeAssessment([blacktown()]),
      makeAssessment([makeArea()]),
      makeAssessment([blacktown(), makeArea({ areaId: 'lga_penrith', name: 'Penrith' })]),
    ]) {
      const notes = notesOf(assessment);
      expect(notes[notes.length - 1]).toBe(METHOD_SENTENCE);
      expect(notes.filter(t => t === METHOD_SENTENCE)).toHaveLength(1);
    }
  });

  test('the method sentence carries no citation', () => {
    const notes = section(buildNarrative(makeAssessment([blacktown()])), 'notes');
    expect(notes.paragraphs[notes.paragraphs.length - 1].citations).toEqual([]);
  });

  test('separate mode names the area in each missing note', () => {
    const penrith = makeArea({ areaId: 'lga_penrith', name: 'Penrith' }, { car_dependency: { value: 70, percentile: 40 } });
    const missing = notesOf(makeAssessment([blacktown(), penrith])).filter(t => t.startsWith('No data is available'));
    expect(missing).toHaveLength(2);
    expect(missing[0]).toContain(' in Blacktown; ');
    expect(missing[1]).toContain(' in Penrith; ');
  });
});

describe('buildNarrative: combined area wording', () => {
  const combinedArea = () => {
    const area = makeArea(
      { areaId: 'combined', name: 'Blacktown + Newcastle', overall: 55.2, band: 'Moderate' },
      {
        ...withValues(['pop_growth_2041', 'job_growth_2041']),
        car_dependency: { value: 83.8, percentile: 92, keyNeed: true },
        limited_english: { value: 4.1, percentile: 84, keyNeed: true },
      },
    );
    return withDomain(area, 'socio', 60, 'High');
  };
  const assessment = (memberIds = ['lga_blacktown', 'lga_newcastle'], mode: NeedsMode = 'combined') =>
    makeAssessment([combinedArea()], { mode, memberIds });

  test('the summary introduces the combined area, then refers to it as "The combined area"', () => {
    const summary = texts(section(buildNarrative(assessment()), 'summary'));
    expect(summary).toEqual([
      'The combined area (Blacktown + Newcastle) has moderate overall need (score 55/100, ranked against NSW LGAs).',
      "The combined area's most pronounced needs are car dependency and limited English proficiency.",
    ]);
  });

  test('key-need sentences use "The combined area\'s"', () => {
    expect(texts(section(buildNarrative(assessment()), 'transport'))).toContain(
      'On car dependency, the combined area (83.8%) ranks in the highest-need 8% of NSW LGAs, '
      + '17.5 pp above the Greater Sydney figure of 66.3%.',
    );
    expect(texts(section(buildNarrative(assessment()), 'socio'))[1]).toMatch(
      /^On limited English proficiency, the combined area \(4\.1%\) ranks in the highest-need 16% of NSW LGAs/,
    );
  });

  test('the missing-data note says "in the combined area"', () => {
    const notes = texts(section(buildNarrative(assessment()), 'notes'));
    expect(notes.filter(t => t.startsWith('No data is available'))).toEqual([
      'No data is available for population growth 2021–41 and job growth 2021–41 in the combined area; '
      + 'these are excluded from the scores.',
    ]);
  });

  test('a single-LGA combined selection and separate mode keep the plain wording', () => {
    for (const a of [assessment(['lga_blacktown']), assessment(['lga_blacktown', 'lga_newcastle'], 'separate')]) {
      const sections = buildNarrative(a);
      expect(texts(section(sections, 'summary'))[0]).toBe(
        'Blacktown + Newcastle has moderate overall need (score 55/100, ranked against NSW LGAs).',
      );
      expect(texts(section(sections, 'summary'))[1]).toMatch(/^Its most pronounced needs are/);
      expect(texts(section(sections, 'transport'))[1]).toMatch(/^On car dependency, Blacktown \+ Newcastle \(83\.8%\) ranks/);
      expect(narrativeToPlainText(sections)).not.toContain('combined area');
    }
  });

  test('on real data', () => {
    const sections = buildNarrative(
      runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds: ['lga_blacktown', 'lga_newcastle'], mode: 'combined', universe: 'nsw' }),
    );
    const summary = texts(section(sections, 'summary'));
    expect(summary[0]).toMatch(
      /^The combined area \(Blacktown \+ Newcastle\) has (very high|high|moderate|lower) overall need \(score \d+\/100, ranked against NSW LGAs\)\.$/,
    );
    expect(summary[1]).toMatch(/^The combined area's most pronounced needs are /);
    const sentences = sections.filter(s => s.id !== 'notes').flatMap(texts);
    expect(sentences.join('\n')).not.toMatch(/Blacktown \+ Newcastle's|\bIts\b/);
  });
});

describe('narrativeToPlainText', () => {
  const sections = buildNarrative(makeAssessment([blacktown()]));
  const plain = narrativeToPlainText(sections);

  test('headings on their own lines, blocks separated by blank lines', () => {
    const blocks = plain.split('\n\n');
    expect(blocks[0]).toBe('Summary');
    expect(blocks[1]).toBe('Blacktown has high overall need (score 72/100, ranked against NSW LGAs).');
    expect(blocks).toContain(DOMAIN_LABELS.transport);
    expect(blocks).toContain('Data notes');
    expect(blocks.length).toBe(sections.reduce((n, s) => n + 1 + s.paragraphs.length, 0));
    expect(plain.endsWith(METHOD_SENTENCE)).toBe(true);
    expect(plain.endsWith('\n')).toBe(false);
  });

  test('no citation markers or source names beyond the sentences themselves', () => {
    expect(plain).not.toMatch(/\[\d+\]|\^\d+|\(ABS|TfNSW GTFS/);
    expect(plain).not.toContain('http');
  });

  test('nothing selected gives an empty string', () => {
    expect(narrativeToPlainText([])).toBe('');
  });
});

describe('buildNarrative on real assessments', () => {
  const run = (areaIds: string[], mode: NeedsMode, universe: Universe) =>
    runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds, mode, universe });

  test('every LGA, in every universe, produces clean text with cited key needs', () => {
    for (const universe of ['nsw', 'gsyd', 'region', 'peer'] as const) {
      for (const record of NEEDS_SNAPSHOT.records) {
        const sections = buildNarrative(run([record.areaId], 'separate', universe));
        const plain = narrativeToPlainText(sections);
        expect(plain).not.toMatch(/NaN|undefined|null|Infinity|\[object/);
        const notes = section(sections, 'notes');
        expect(notes.paragraphs[notes.paragraphs.length - 1].text).toBe(METHOD_SENTENCE);
        for (const s of sections) {
          if (!(NEED_DOMAINS as string[]).includes(s.id)) continue;
          for (const p of s.paragraphs.slice(1)) {
            expect(p.citations).toHaveLength(1);
            expect(p.text).toContain('ranks in the highest-need');
          }
        }
        // context-only indicator never shown as a need
        expect(plain.replace(METHOD_SENTENCE, '')).not.toContain('Aboriginal');
      }
    }
  });

  test('the Blacktown narrative uses the bundled data', () => {
    const sections = buildNarrative(run(['lga_blacktown'], 'separate', 'nsw'));
    const summary = section(sections, 'summary');
    expect(summary.paragraphs[0].text).toMatch(
      /^Blacktown has (very high|high|moderate|lower) overall need \(score \d+\/100, ranked against NSW LGAs\)\.$/,
    );
    expect(texts(section(sections, 'transport'))[0]).toMatch(/^Transport disadvantage: (very high|high|moderate|lower) \(score \d+\/100\)\.$/);
    expect(texts(section(sections, 'notes')).join('\n')).toContain(WFH_SENTENCE);
  });

  test('combined selections get the approximation note and, across regions, the fallback note', () => {
    const sameRegion = buildNarrative(run(['lga_blacktown', 'lga_penrith'], 'combined', 'region'));
    const noteTexts = texts(section(sameRegion, 'notes'));
    expect(noteTexts.some(t => t.startsWith('Values for ') && t.includes('population-weighted approximations'))).toBe(true);
    expect(noteTexts.join('\n')).not.toContain('span more than one');

    const crossRegion = buildNarrative(run(['lga_blacktown', 'lga_newcastle'], 'combined', 'region'));
    expect(texts(section(crossRegion, 'notes'))).toContain(
      'The selected LGAs span more than one region, so the combined area is ranked against NSW LGAs.',
    );
    const crossPeer = buildNarrative(run(['lga_sydney', 'lga_blacktown'], 'combined', 'peer'));
    expect(texts(section(crossPeer, 'notes'))).toContain(
      'The selected LGAs span more than one peer group, so the combined area is ranked against NSW LGAs.',
    );
  });

  test('a combined selection where one LGA lacks data gets the partial-data note', () => {
    const sections = buildNarrative(run(['lga_blacktown', 'lga_snowy_valleys'], 'combined', 'nsw'));
    const notes = texts(section(sections, 'notes'));
    expect(notes).toContain('Values for job growth 2021–41 are based only on the selected LGAs that have data.');
    // only one LGA lacks the value, so the combined area still has it and does not report it as missing
    expect(notes.join('\n')).not.toContain('No data is available for job growth');
  });

  test('a single-LGA combined selection has no approximation note', () => {
    const notes = texts(section(buildNarrative(run(['lga_blacktown'], 'combined', 'nsw')), 'notes'));
    expect(notes.join('\n')).not.toContain('approximations');
  });

  test('the benchmarks are not narrated', () => {
    const all = narrativeToPlainText(buildNarrative(run(['lga_blacktown', 'lga_penrith'], 'separate', 'nsw')));
    expect(all).not.toMatch(/benchmark/i);
  });
});

describe('buildNarrative: key findings and further findings', () => {
  const run = (areaIds: string[], mode: NeedsMode = 'separate', universe: Universe = 'nsw') =>
    runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds, mode, universe });
  const FURTHER_KINDS: Insight['kind'][] = ['mismatch', 'trend', 'growth_service', 'jobs_housing'];
  const ids = (sections: NarrativeSection[]) => sections.map(s => s.id);

  const blacktownNewcastle = run(['lga_blacktown', 'lga_newcastle']);
  const insights = buildInsights(blacktownNewcastle);
  const sections = buildNarrative(blacktownNewcastle);

  test('key findings come first and hold at most 5 insights, the most severe', () => {
    expect(ids(sections)).toEqual(['key_findings', 'summary', 'transport', 'socio', 'growth', 'insights', 'notes']);
    const keyFindings = sections[0];
    expect(keyFindings.heading).toBe('Key findings');
    expect(insights.length).toBeGreaterThan(5);
    expect(keyFindings.paragraphs).toHaveLength(5);
    expect(texts(keyFindings)).toEqual(insights.slice(0, 5).map(i => i.text));
  });

  test('every key finding carries at least one citation, and every citation is a numbered source', () => {
    for (const areaIds of [['lga_blacktown', 'lga_newcastle'], ['lga_sydney'], ['lga_snowy_valleys']]) {
      for (const mode of ['separate', 'combined'] as const) {
        for (const s of buildNarrative(run(areaIds, mode)).filter(x => x.id === 'key_findings' || x.id === 'insights')) {
          expect(s.paragraphs.length).toBeGreaterThan(0);
          for (const p of s.paragraphs) {
            expect(p.citations.length).toBeGreaterThanOrEqual(1);
            for (const citation of p.citations) expect(sourceNumber(citation)).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  test('key findings keep the insights\' citations', () => {
    sections[0].paragraphs.forEach((p, i) => expect(p.citations).toEqual(insights[i].citations));
  });

  test('further findings are the remaining insights grouped by kind, without key needs', () => {
    const further = section(sections, 'insights');
    expect(further.heading).toBe('Further findings');
    const rest = insights.slice(5).filter(i => i.kind !== 'key_need');
    const expected = FURTHER_KINDS.flatMap(kind => rest.filter(i => i.kind === kind));
    expect(expected.length).toBeGreaterThan(0);
    expect(texts(further)).toEqual(expected.map(i => i.text));
    // Each remaining insight is in exactly one place
    const keyTexts = texts(section(sections, 'key_findings'));
    for (const text of texts(further)) expect(keyTexts).not.toContain(text);
  });

  test('a key need that is not in the key findings stays in its domain paragraphs only', () => {
    const lowerKeyNeeds = insights.slice(5).filter(i => i.kind === 'key_need');
    expect(lowerKeyNeeds.length).toBeGreaterThan(0);
    const further = texts(section(sections, 'insights'));
    const domains = NEED_DOMAINS.flatMap(d => texts(section(sections, d)));
    for (const insight of lowerKeyNeeds) {
      expect(further).not.toContain(insight.text);
      expect(domains).toContain(insight.text);
    }
  });

  test('on every LGA: at most 5 key findings, none dropped, and no section left empty', () => {
    for (const record of NEEDS_SNAPSHOT.records) {
      const a = run([record.areaId]);
      const all = buildInsights(a);
      const built = buildNarrative(a);
      const keyFindings = built.find(s => s.id === 'key_findings');
      const further = built.find(s => s.id === 'insights');
      expect(keyFindings?.paragraphs.length ?? 0).toBe(Math.min(5, all.length));
      expect(further?.paragraphs.length ?? 0).toBe(all.slice(5).filter(i => i.kind !== 'key_need').length);
      expect(ids(built)[0]).toBe(all.length > 0 ? 'key_findings' : 'summary');
      expect(built.every(s => s.paragraphs.length > 0)).toBe(true);
      for (const p of [...(keyFindings?.paragraphs ?? []), ...(further?.paragraphs ?? [])]) {
        expect(p.citations.length).toBeGreaterThanOrEqual(1);
        expect(p.citations.every(c => sourceNumber(c) > 0)).toBe(true);
      }
    }
  });

  test('a combined selection writes its findings about "the combined area"', () => {
    const combined = buildNarrative(run(['lga_blacktown', 'lga_penrith'], 'combined'));
    const findings = texts(section(combined, 'key_findings'));
    expect(findings.length).toBeGreaterThan(0);
    for (const text of findings) expect(text).toMatch(/combined area/);
  });

  test('findings that cannot be drawn leave no empty section', () => {
    // No snapshot records to draw series or insights from
    expect(ids(buildNarrative(makeAssessment([blacktown()])))).toEqual(['summary', 'transport', 'socio', 'growth', 'notes']);
  });

  test('the plain text copies key findings first and further findings after the domains', () => {
    const blocks = narrativeToPlainText(sections).split('\n\n');
    expect(blocks[0]).toBe('Key findings');
    expect(blocks[1]).toBe(insights[0].text);
    expect(blocks.indexOf('Further findings')).toBeGreaterThan(blocks.indexOf(DOMAIN_LABELS.growth));
    expect(blocks.indexOf('Further findings')).toBeLessThan(blocks.indexOf('Data notes'));
    expect(blocks.indexOf('Summary')).toBe(6);
    expect(narrativeToPlainText(sections)).not.toMatch(/NaN|undefined|null|Infinity|\[object/);
  });
});
