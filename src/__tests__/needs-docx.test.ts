import JSZip from 'jszip';
import { Packer } from 'docx';
import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { runAssessment } from '@/lib/needs/assess';
import {
  buildNeedsDocument, captureFigures, figureLayout, skippedFiguresMessage, type DocxFigure, type NeedsDocxInput,
} from '@/lib/needs/docx-export';
import { DOMAIN_LABELS, INDICATORS, NEED_DOMAINS } from '@/lib/needs/indicators';
import { figureSkipError, skipReasonOf } from '@/lib/needs/figure-skip';
import { buildNarrative } from '@/lib/needs/narrative';
import {
  CATCHMENT_CAPTION, CATCHMENT_TITLE, citationSegments, comparisonLabel, exportFileName, exportTitle, indicatorTable,
  NEEDS_SOURCES, SA2_MAP_CAPTION, SA2_MAP_TITLE, SA2_TABLE_CAPTION, SA2_TABLE_COLUMNS, SA2_TABLE_EMPTY,
  SA2_TABLE_HEADING, sa2Table, sourceNumber,
} from '@/lib/needs/page-data';
import type { NeedsAssessment, NeedsMode, NeedsSnapshot, Universe } from '@/lib/needs/types';
import { SA2_POCKETS_FILE } from './fixtures/sa2-pockets';

const METHOD_SENTENCE =
  'Need scores are the equally weighted mean of indicator percentiles within each domain, and of domain scores overall. '
  + 'Aboriginal and Torres Strait Islander share and the share of stops with frequent AM-peak service are shown for '
  + 'context and are not scored.';

/** A real 1x1 PNG. The display size comes from the transformation, not the bytes. */
const PNG_1X1 = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
));

const EMU_PER_CM = 360000;

function assess(areaIds: string[], mode: NeedsMode = 'separate', universe: Universe = 'nsw', snapshot: NeedsSnapshot = NEEDS_SNAPSHOT) {
  return runAssessment({ snapshot, areaIds, mode, universe });
}

const figure = (title: string, widthPx = 1000, heightPx = 600, caption = 'ABS Census 2021 G62'): DocxFigure => (
  { title, caption, png: PNG_1X1, widthPx, heightPx }
);

function inputFor(assessment: NeedsAssessment, figures: DocxFigure[] = [figure('Need map')]): NeedsDocxInput {
  return {
    title: exportTitle(assessment),
    generatedOn: '23 October 2026',
    assessment,
    narrative: buildNarrative(assessment),
    figures,
  };
}

async function documentParts(input: NeedsDocxInput) {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(buildNeedsDocument(input)));
  const xml = await zip.file('word/document.xml')!.async('string');
  const styles = await zip.file('word/styles.xml')!.async('string');
  return { zip, xml, styles };
}

const decode = (text: string) => text
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** The text of an XML fragment: its text runs, with tabs as "\t". */
function textOf(fragment: string): string {
  return decode(Array.from(fragment.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g)).map(m => m[1] ?? '\t').join(''));
}

interface Para { style: string | null; text: string; xml: string }

function paragraphs(xml: string): Para[] {
  return Array.from(xml.matchAll(/<w:p>[\s\S]*?<\/w:p>|<w:p [^>]*>[\s\S]*?<\/w:p>/g)).map(m => ({
    style: /<w:pStyle w:val="([^"]+)"/.exec(m[0])?.[1] ?? null,
    text: textOf(m[0]),
    xml: m[0],
  }));
}

const headings = (xml: string, style: string) => paragraphs(xml).filter(p => p.style === style).map(p => p.text);

/** The `<w:tbl>` elements of a fragment, each as `{ rows: [[cell text, ...], ...] }`. */
function tables(xml: string): string[][][] {
  return Array.from(xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)).map(t => (
    Array.from(t[0].matchAll(/<w:tr>[\s\S]*?<\/w:tr>|<w:tr [^>]*>[\s\S]*?<\/w:tr>/g)).map(r => (
      Array.from(r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)).map(c => textOf(c[0]))
    ))
  ));
}

interface DocSection { orientation: 'portrait' | 'landscape'; xml: string }

/** Splits the body into sections, each with the orientation its `<w:sectPr>` gives it. */
function sections(xml: string): DocSection[] {
  const result: DocSection[] = [];
  let start = 0;
  for (const m of xml.matchAll(/<w:sectPr[\s\S]*?<\/w:sectPr>/g)) {
    const afterProps = m.index! + m[0].length;
    // A section's properties sit in the last paragraph of the section (the final section's, at the end of the
    // body), so the section runs to the end of that paragraph.
    const end = xml.startsWith('</w:pPr>', afterProps) ? xml.indexOf('</w:p>', afterProps) + '</w:p>'.length : afterProps;
    result.push({ orientation: /w:orient="landscape"/.test(m[0]) ? 'landscape' : 'portrait', xml: xml.slice(start, end) });
    start = end;
  }
  return result;
}

/** [width, height] in EMU of each drawing in `xml`. */
const extents = (xml: string): Array<[number, number]> => (
  Array.from(xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)).map(m => [Number(m[1]), Number(m[2])])
);

const GSYD_IDS = NEEDS_SNAPSHOT.records.filter(r => r.region === 'Greater Sydney').map(r => r.areaId);

describe('buildNeedsDocument: Blacktown + Penrith combined', () => {
  const assessment = assess(['lga_blacktown', 'lga_penrith'], 'combined');
  const input = inputFor(assessment, [figure('Need map', 900, 700)]);
  let parts: Awaited<ReturnType<typeof documentParts>>;
  beforeAll(async () => { parts = await documentParts(input); });

  test('has the title, summary, a figure caption, the table benchmarks and the sources', () => {
    const { xml, zip } = parts;
    expect(xml).toContain('Blacktown + Penrith');
    expect(xml).toContain('Summary');
    expect(xml).toContain('Figure 1. Need map');
    expect(xml).toContain('≈');
    expect(xml).toContain('Greater Sydney');
    expect(xml).toContain('ABS Census 2021 G62');
    expect(zip.file(/word\/media\/.*\.png/).length).toBe(1);
  });

  test('uses the built-in heading styles in order: title, key findings, summary, domains, further findings, indicators, figures, notes, sources', () => {
    const { xml } = parts;
    expect(headings(xml, 'Heading1')).toEqual(['Needs assessment — Blacktown + Penrith']);
    expect(headings(xml, 'Heading2')).toEqual([
      'Key findings',
      'Summary',
      ...NEED_DOMAINS.map(d => DOMAIN_LABELS[d]),
      'Further findings',
      'Indicators',
      'Figures',
      'Data notes',
      'Sources',
    ]);
  });

  test('contains a Key findings heading before Summary', () => {
    const { xml } = parts;
    expect(xml.indexOf('Key findings')).toBeGreaterThan(-1);
    expect(xml.indexOf('Key findings')).toBeLessThan(xml.indexOf('Summary'));
  });

  test('Key findings are the first narrative: at most 5 paragraphs, each with its citation numbers', () => {
    const all = paragraphs(parts.xml);
    const start = all.findIndex(p => p.style === 'Heading2' && p.text === 'Key findings');
    const end = all.findIndex(p => p.style === 'Heading2' && p.text === 'Summary');
    expect(start).toBeGreaterThan(-1);
    const shown = all.slice(start + 1, end);
    const keyFindings = input.narrative.find(s => s.id === 'key_findings')!;
    expect(input.narrative[0]).toBe(keyFindings);
    expect(keyFindings.paragraphs.length).toBeGreaterThan(0);
    expect(shown).toHaveLength(keyFindings.paragraphs.length);
    expect(shown.length).toBeLessThanOrEqual(5);
    keyFindings.paragraphs.forEach((paragraph, i) => {
      const numbers = paragraph.citations.map(sourceNumber);
      expect(paragraph.citations.length).toBeGreaterThan(0);
      expect(numbers.every(n => n > 0)).toBe(true);
      const citation = citationSegments(numbers).map(({ from, to }) => (from === to ? `${from}` : `${from}–${to}`)).join(', ');
      expect(shown[i].text).toBe(paragraph.text + citation);
      expect(shown[i].xml).toContain('<w:vertAlign w:val="superscript"/>');
    });
  });

  test('Further findings follow the domains and hold the other insights, each cited', () => {
    const all = paragraphs(parts.xml);
    const start = all.findIndex(p => p.style === 'Heading2' && p.text === 'Further findings');
    const end = all.findIndex(p => p.style === 'Heading2' && p.text === 'Indicators');
    const further = input.narrative.find(s => s.id === 'insights')!;
    expect(start).toBeGreaterThan(all.findIndex(p => p.style === 'Heading2' && p.text === DOMAIN_LABELS.growth));
    expect(all.slice(start + 1, end).map(p => p.text.replace(/[\d–, ]+$/, ''))).toEqual(further.paragraphs.map(p => p.text));
  });

  test('states the generation date and the selection: members, mode, universe', () => {
    const text = paragraphs(parts.xml).map(p => p.text);
    expect(text).toContain('Generated: 23 October 2026');
    expect(text).toContain('Areas: Blacktown, Penrith');
    expect(text).toContain('Mode: Combined (one area, Blacktown + Penrith)');
    expect(text).toContain('Compared with: NSW LGAs');
  });

  test('styles the document Calibri 11 with no theme-coloured headings', () => {
    const { styles } = parts;
    const defaults = /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/.exec(styles)![0];
    expect(defaults).toContain('w:ascii="Calibri"');
    expect(defaults).toContain('<w:sz w:val="22"/>');
    expect(styles).not.toMatch(/w:themeColor/);
    for (const id of ['Heading1', 'Heading2']) {
      const style = new RegExp(`<w:style [^>]*w:styleId="${id}"[\\s\\S]*?</w:style>`).exec(styles)![0];
      expect(style).toContain('<w:color w:val="000000"/>');
    }
  });

  test('puts every narrative paragraph in the document with its citation numbers as a superscript', () => {
    const { xml } = parts;
    const text = paragraphs(xml).map(p => p.text);
    const superscripts = Array.from(xml.matchAll(/<w:r>(?:(?!<\/w:r>)[\s\S])*<w:vertAlign w:val="superscript"\/>(?:(?!<\/w:r>)[\s\S])*<\/w:r>/g))
      .map(m => textOf(m[0]));
    const cited = input.narrative.flatMap(s => s.paragraphs).filter(p => p.citations.length > 0);
    expect(cited.length).toBeGreaterThan(0);
    for (const paragraph of input.narrative.flatMap(s => s.paragraphs)) {
      const citation = citationSegments(paragraph.citations.map(sourceNumber))
        .map(({ from, to }) => (from === to ? `${from}` : `${from}–${to}`)).join(', ');
      expect(text).toContain(paragraph.text + citation);
      if (citation) expect(superscripts).toContain(citation);
    }
  });

  test('data notes are the narrative notes as-is: the method sentence appears exactly once', () => {
    const occurrences = parts.xml.split(METHOD_SENTENCE).length - 1;
    expect(occurrences).toBe(1);
    const notes = input.narrative.find(s => s.id === 'notes')!;
    const texts = paragraphs(parts.xml).map(p => p.text);
    for (const paragraph of notes.paragraphs) expect(texts.some(t => t.startsWith(paragraph.text))).toBe(true);
  });

  test('lists the sources in citation order, numbered, with their links', async () => {
    const entries = paragraphs(parts.xml).filter(p => /^\d+\.\t/.test(p.text));
    expect(entries).toHaveLength(NEEDS_SOURCES.length);
    NEEDS_SOURCES.forEach((source, i) => {
      expect(entries[i].text).toBe(`${i + 1}.\t${source.full}${source.url ? `. ${source.url}` : ''}`);
    });
    expect(parts.xml).toContain('<w:hyperlink');
  });

  test('has a native indicator table with the page cells: area, Greater Sydney, NSW, Source', () => {
    const [table, ...rest] = tables(parts.xml);
    expect(rest).toHaveLength(0);
    const expected = indicatorTable(assessment);
    expect(table[0]).toEqual(['Indicator', ...expected.columns, 'Source']);
    const indicatorRows = table.filter(row => row.length > 1).slice(1);
    expect(indicatorRows).toEqual(expected.rows.map(r => [r.label, ...r.cells, r.source]));
    // Domain header rows are single merged cells.
    expect(table.filter(row => row.length === 1).map(row => row[0])).toEqual(NEED_DOMAINS.map(d => DOMAIN_LABELS[d]));
    expect(table.flat().some(cell => cell.startsWith('≈'))).toBe(true);
    expect(table[0]).toContain('Greater Sydney');
    expect(table[0]).toContain('NSW');
  });

  test('labels the unscored indicator "(context)" and floors the percentiles like the page', () => {
    const [table] = tables(parts.xml);
    const labels = table.map(row => row[0]);
    expect(labels.filter(l => l.endsWith('(context)'))).toEqual(
      INDICATORS.filter(d => !d.scored).map(d => `${d.label} (context)`),
    );
    expect(table.flat().filter(cell => /\(p\d+\)/.test(cell)).every(cell => /\(p\d+\)$/.test(cell))).toBe(true);
  });

  test('the whole document is one portrait section but for the wide figure', () => {
    expect(sections(parts.xml).map(s => s.orientation)).toEqual(['portrait']);
  });

  test('every shown figure keeps its aspect ratio and is at most 16 cm wide', () => {
    const [[cx, cy]] = extents(parts.xml);
    expect(cx).toBeLessThanOrEqual(16 * EMU_PER_CM + 1);
    expect(cx / cy).toBeCloseTo(900 / 700, 2);
  });
});

describe('buildNeedsDocument: selection lines', () => {
  const lines = async (areaIds: string[], mode: NeedsMode, universe: Universe = 'nsw') => {
    const { xml } = await documentParts(inputFor(assess(areaIds, mode, universe), []));
    return paragraphs(xml).map(p => p.text);
  };

  test('separate areas', async () => {
    const text = await lines(['lga_blacktown', 'lga_penrith'], 'separate');
    expect(text).toEqual(expect.arrayContaining(['Areas: Blacktown, Penrith', 'Mode: Separate', 'Compared with: NSW LGAs']));
  });

  test('a single LGA, compared with its own universe', async () => {
    const text = await lines(['lga_blacktown'], 'combined', 'peer');
    expect(text).toEqual(expect.arrayContaining(['Areas: Blacktown', 'Mode: Single LGA']));
    expect(text.find(t => t.startsWith('Compared with: '))).toMatch(/\S/);
  });
});

describe('buildNeedsDocument: missing data', () => {
  test('a null indicator is "No data" in the table, never 0', async () => {
    const records = NEEDS_SNAPSHOT.records.map(r => (
      r.areaId === 'lga_blacktown' || r.areaId === 'lga_penrith'
        ? { ...r, values: { ...r.values, commute_distance_km: { value: null } } }
        : r
    ));
    const assessment = assess(['lga_blacktown', 'lga_penrith'], 'combined', 'nsw', { ...NEEDS_SNAPSHOT, records });
    const { xml } = await documentParts(inputFor(assessment));
    const [table] = tables(xml);
    const row = table.find(r => r[0] === 'Average commuting distance')!;
    expect(row[1]).toBe('No data');
    expect(row.slice(1, -1).some(cell => /^0(\.0+)?\b/.test(cell))).toBe(false);
  });
});

describe('buildNeedsDocument: figures', () => {
  const assessment = assess(['lga_blacktown', 'lga_penrith']);

  test('numbers the figures in the given order with an italic "Figure n. title. Source: caption" line', async () => {
    const { xml, zip } = await documentParts(inputFor(assessment, [
      figure('Need map', 1000, 800, 'ABS Census 2021 G62; TfNSW GTFS'),
      figure('Domain scores', 1000, 900, 'ABS SEIFA 2021'),
    ]));
    const captions = paragraphs(xml).filter(p => p.style === 'Caption').map(p => p.text);
    expect(captions).toEqual([
      'Figure 1. Need map. Source: ABS Census 2021 G62; TfNSW GTFS',
      'Figure 2. Domain scores. Source: ABS SEIFA 2021',
    ]);
    expect(extents(xml)).toHaveLength(2);
    expect(zip.file(/word\/media\/.*\.png/).length).toBeGreaterThanOrEqual(1);
  });

  test('numbers the insight figures that follow the strip plots, with their sources', async () => {
    const insightFigures = [
      figure('Car dependency against expected', 1000, 900, 'ABS Census 2021 G62; TfNSW GTFS; ABS Census 2021 G01'),
      figure('Trends in car dependency, road crashes and population', 1000, 1400, 'ABS Census 2021 G62; ABS ERP'),
      figure('AM-peak service per resident, today and in 2041', 1000, 700, 'TfNSW GTFS; ABS ERP; NSW DPE projections'),
      figure('Local jobs per resident, 2021 and 2041', 1000, 600, 'TfNSW TZP24; ABS ERP; NSW DPE projections'),
    ];
    const { xml } = await documentParts(inputFor(assessment, [figure('Need map', 900, 700), ...insightFigures]));
    const captions = paragraphs(xml).filter(p => p.style === 'Caption').map(p => p.text);
    expect(captions).toEqual([
      'Figure 1. Need map. Source: ABS Census 2021 G62',
      ...insightFigures.map((f, i) => `Figure ${i + 2}. ${f.title}. Source: ${f.caption}`),
    ]);
  });

  test('keeps a figure with its caption', async () => {
    const { xml } = await documentParts(inputFor(assessment));
    const image = paragraphs(xml).find(p => p.xml.includes('<w:drawing>'))!;
    expect(image.xml).toContain('<w:keepNext/>');
  });

  test('omits the Figures heading when no figure was captured', async () => {
    const { xml } = await documentParts(inputFor(assessment, []));
    expect(headings(xml, 'Heading2')).not.toContain('Figures');
    expect(extents(xml)).toHaveLength(0);
  });

  test('a figure wider than 1.6 times its height goes in a landscape section at the full text width', async () => {
    const { xml } = await documentParts(inputFor(assessment, [
      figure('Need map', 1000, 800),
      figure('Need heatmap', 12540, 1100),
      figure('Domain profile', 1000, 800),
    ]));
    const all = sections(xml);
    expect(all.map(s => s.orientation)).toEqual(['portrait', 'landscape', 'portrait']);
    const landscape = all[1];
    expect(paragraphs(landscape.xml).filter(p => p.style === 'Caption').map(p => p.text))
      .toEqual([expect.stringMatching(/^Figure 2\. Need heatmap\./)]);
    const [[cx, cy]] = extents(landscape.xml);
    expect(cx).toBeLessThanOrEqual(24.7 * EMU_PER_CM + 1);
    expect(cx).toBeGreaterThan(24.6 * EMU_PER_CM);
    expect(cx / cy).toBeCloseTo(12540 / 1100, 1);
    expect(landscape.xml).not.toContain('Figure 1.');
    expect(all[2].xml).toContain('Figure 3. Domain profile');
    // The page is A4 landscape: 29.7 x 21.0 cm.
    const landscapePage = /<w:pgSz [^>]*w:orient="landscape"[^>]*>/.exec(xml)![0];
    expect(landscapePage).toContain('w:w="16838"');
    expect(landscapePage).toContain('w:h="11906"');
  });

  test('the Figures heading goes with the first figure, even in a landscape section', async () => {
    const { xml } = await documentParts(inputFor(assessment, [figure('Need map', 3000, 1000), figure('Domain scores', 1000, 800)]));
    const all = sections(xml);
    const heading = all.findIndex(s => paragraphs(s.xml).some(p => p.style === 'Heading2' && p.text === 'Figures'));
    expect(all[heading].orientation).toBe('landscape');
    expect(all[heading].xml).toContain('Figure 1. Need map');
  });

  test('consecutive wide figures share one landscape section, flowed by Word with no forced page break', async () => {
    const strips = Array.from({ length: 6 }, (_, i) => figure(`Strip plot ${i + 1}`, 2910, 1104));
    const { xml } = await documentParts(inputFor(assessment, strips));
    const all = sections(xml);
    // Title to table (portrait), the six strip plots (landscape), then data notes and sources (portrait).
    expect(all.map(s => s.orientation)).toEqual(['portrait', 'landscape', 'portrait']);
    const landscape = all[1];
    expect(extents(landscape.xml)).toHaveLength(6);
    expect(paragraphs(landscape.xml).filter(p => p.style === 'Caption').map(p => p.text))
      .toEqual(strips.map((_, i) => `Figure ${i + 1}. Strip plot ${i + 1}. Source: ABS Census 2021 G62`));
    expect(headings(landscape.xml, 'Heading2')).toEqual(['Figures']);
    expect(landscape.xml).not.toMatch(/<w:pageBreakBefore|<w:br w:type="page"/);
  });

  test('every figure image is kept with its caption', async () => {
    const mixed = [figure('A', 1000, 800), figure('B', 3000, 1000), figure('C', 3000, 1000)];
    const { xml } = await documentParts(inputFor(assessment, mixed));
    const images = paragraphs(xml).filter(p => p.xml.includes('<w:drawing>'));
    expect(images).toHaveLength(3);
    for (const image of images) expect(image.xml).toContain('<w:keepNext/>');
  });

  test('a new section starts only when the orientation changes: portrait, landscape, portrait is three sections', async () => {
    const { xml } = await documentParts(inputFor(assessment, [
      figure('A', 1000, 800), figure('B', 1000, 800), // portrait, join the portrait text before them
      figure('C', 3000, 1000), figure('D', 4000, 1000), // landscape
      figure('E', 1000, 900), figure('F', 1000, 900), // portrait, join the data notes and sources after them
    ]));
    const all = sections(xml);
    expect(all.map(s => s.orientation)).toEqual(['portrait', 'landscape', 'portrait']);
    expect(all[0].xml).toContain('Figure 2. B.');
    expect(all[1].xml).toContain('Figure 3. C.');
    expect(all[1].xml).toContain('Figure 4. D.');
    expect(all[2].xml).toContain('Figure 5. E.');
    expect(all[2].xml).toContain('Figure 6. F.');
    expect(headings(all[2].xml, 'Heading2')).toEqual(['Data notes', 'Sources']);
  });

  test('wide figures following a landscape table (many areas) continue in the same landscape section', async () => {
    const { xml } = await documentParts(inputFor(assess(GSYD_IDS.slice(0, 8)), [figure('A', 3000, 1000), figure('B', 3000, 1000)]));
    expect(sections(xml).map(s => s.orientation)).toEqual(['portrait', 'landscape', 'portrait']);
  });
});

describe('buildNeedsDocument: SA2 drill-down', () => {
  const assessment = assess(['lga_blacktown', 'lga_mosman']);
  const narrative = buildNarrative(assessment, { file: SA2_POCKETS_FILE });
  const drillDown = [figure(SA2_MAP_TITLE, 1000, 700, SA2_MAP_CAPTION), figure(CATCHMENT_TITLE, 2000, 700, CATCHMENT_CAPTION)];

  test('docx includes the pockets section and a straight-line note in the catchment caption', async () => {
    const { xml } = await documentParts({ ...inputFor(assessment, [figure('Need map'), ...drillDown]), narrative });

    const order = headings(xml, 'Heading2');
    expect(order.indexOf('Pockets of need')).toBe(order.indexOf(DOMAIN_LABELS.growth) + 1);
    const texts = paragraphs(xml).map(p => p.text);
    const pockets = narrative.find(s => s.id === 'pockets')!;
    expect(pockets.paragraphs.map(p => p.text)).toEqual([
      'Within Blacktown, Mount Druitt - Whalan, Lethbridge Park - Tregear and Blackett - Dharruk are in the highest-need 10% of NSW SA2s.',
      'No SA2 in Mosman is in the highest-need 10% of NSW SA2s.',
    ]);
    for (const p of pockets.paragraphs) {
      const citation = citationSegments(p.citations.map(sourceNumber))
        .map(({ from, to }) => (from === to ? `${from}` : `${from}–${to}`)).join(', ');
      expect(citation).not.toBe('');
      expect(texts).toContain(p.text + citation);
    }

    const captions = paragraphs(xml).filter(p => p.style === 'Caption').map(p => p.text);
    expect(captions).toEqual([
      'Figure 1. Need map. Source: ABS Census 2021 G62',
      `Figure 2. SA2 need map. Source: ${SA2_MAP_CAPTION}`,
      `Figure 3. ${CATCHMENT_TITLE}. Source: ${CATCHMENT_CAPTION}`,
    ]);
    expect(captions[2]).toContain('straight-line distance');
  });

  test('the SA2 map and catchment captions cite numbered sources only (R31, R45)', () => {
    for (const caption of [SA2_MAP_CAPTION, CATCHMENT_CAPTION]) {
      for (const short of caption.split('; ')) expect(NEEDS_SOURCES.map(s => s.short)).toContain(short);
    }
    expect(CATCHMENT_CAPTION).toBe('ABS Mesh Block Counts 2021 + TfNSW GTFS (straight-line catchments)');
  });
});

describe('buildNeedsDocument: SA2 table (P2-R18)', () => {
  const assessment = assess(['lga_blacktown']);
  const sa2 = sa2Table(SA2_POCKETS_FILE, assessment);

  test('a native table after the indicator table: the page columns and cells, its notes and a source line', async () => {
    const { xml } = await documentParts({ ...inputFor(assessment, [figure('Need map')]), sa2Table: sa2 });

    const order = headings(xml, 'Heading2');
    expect(order.indexOf(SA2_TABLE_HEADING)).toBe(order.indexOf('Indicators') + 1);
    expect(order.indexOf('Figures')).toBe(order.indexOf(SA2_TABLE_HEADING) + 1);
    expect(SA2_TABLE_HEADING).toBe('SA2s within the selection');

    const all = tables(xml);
    expect(all).toHaveLength(2);
    const table = all[1];
    expect(table[0]).toEqual(SA2_TABLE_COLUMNS.map(c => c.header));
    expect(table).toHaveLength(sa2.rows.length + 1);
    const expected = sa2.rows.find(r => r.name === 'Mount Druitt - Whalan')!;
    expect(expected.rank).not.toBe('');
    // The overall need cell holds the band and score, then the rank on a line of its own, as on the page
    expect(table.find(r => r[0] === 'Mount Druitt - Whalan')).toEqual([
      expected.name, expected.lgas, expected.overall + expected.rank, expected.transport, expected.socio, expected.frequent,
    ]);
    expect(table.slice(1).map(r => r[0])).toEqual(sa2.rows.map(r => r.name));

    const texts = paragraphs(xml).map(p => p.text);
    const sourceAt = texts.indexOf(`Source: ${SA2_TABLE_CAPTION}`);
    expect(sourceAt).toBeGreaterThan(-1);
    // The notes (the straight-line catchment note among them) come before the source line, as on the page
    expect(texts.slice(sourceAt - sa2.notes.length, sourceAt)).toEqual(sa2.notes);
    expect(texts.indexOf(SA2_TABLE_HEADING)).toBeLessThan(sourceAt);
    expect(sourceAt).toBeLessThan(texts.indexOf('Figures'));
  });

  test('six fixed columns fit the portrait text width, so the table stays in portrait (R32)', async () => {
    const { xml } = await documentParts({ ...inputFor(assessment, []), sa2Table: sa2 });
    const withTables = sections(xml).filter(s => s.xml.includes('<w:tbl>'));
    expect(withTables.map(s => s.orientation)).toEqual(['portrait']);
  });

  test('after a landscape indicator table, the SA2 table starts a portrait section', async () => {
    const many = assess(GSYD_IDS.slice(0, 6));
    const { xml } = await documentParts({ ...inputFor(many, []), sa2Table: sa2Table(SA2_POCKETS_FILE, many) });
    const orientationOfTable = sections(xml).flatMap(s => Array.from(s.xml.matchAll(/<w:tbl>/g)).map(() => s.orientation));
    expect(orientationOfTable).toEqual(['landscape', 'portrait']);
  });

  test('without the SA2 file there is no SA2 table', async () => {
    const { xml } = await documentParts({ ...inputFor(assessment, []), sa2Table: null });
    expect(headings(xml, 'Heading2')).not.toContain(SA2_TABLE_HEADING);
    expect(tables(xml)).toHaveLength(1);
  });

  test('a selection with no ranked SA2 says so, with the notes and source line, and draws no empty table', async () => {
    const empty = { ...sa2, rows: [] };
    const { xml } = await documentParts({ ...inputFor(assessment, []), sa2Table: empty });
    const texts = paragraphs(xml).map(p => p.text);
    expect(tables(xml)).toHaveLength(1);
    expect(texts).toContain(SA2_TABLE_EMPTY);
    expect(texts).toContain(`Source: ${SA2_TABLE_CAPTION}`);
  });

  test('the source line cites numbered sources only (R31, R45)', () => {
    for (const short of SA2_TABLE_CAPTION.split('; ')) expect(NEEDS_SOURCES.map(s => s.short)).toContain(short);
    expect(SA2_TABLE_CAPTION).toBe(SA2_MAP_CAPTION);
  });
});

describe('figureLayout', () => {
  test('a figure at most 1.6 times as wide as tall stays in portrait at 16 cm wide', () => {
    expect(figureLayout(1600, 1000)).toMatchObject({ orientation: 'portrait', widthCm: 16, heightCm: 10 });
    expect(figureLayout(800, 800)).toMatchObject({ orientation: 'portrait', widthCm: 16, heightCm: 16 });
  });

  test('a tall figure is scaled down to fit the page, keeping its aspect ratio', () => {
    const { widthCm, heightCm, orientation } = figureLayout(900, 2700);
    expect(orientation).toBe('portrait');
    expect(heightCm).toBeLessThanOrEqual(20);
    expect(widthCm).toBeLessThan(16);
    expect(widthCm / heightCm).toBeCloseTo(900 / 2700, 5);
  });

  test('a wider figure goes in a landscape section at 24.7 cm, shortened if it would overflow the page', () => {
    expect(figureLayout(5000, 1000)).toMatchObject({ orientation: 'landscape', widthCm: 24.7 });
    const nearly = figureLayout(1700, 1000);
    expect(nearly.orientation).toBe('landscape');
    expect(nearly.heightCm).toBeLessThanOrEqual(12);
    expect(nearly.widthCm / nearly.heightCm).toBeCloseTo(1.7, 5);
  });

  test('a degenerate size does not break the layout', () => {
    expect(figureLayout(0, 0)).toMatchObject({ orientation: 'portrait', widthCm: 16 });
  });
});

describe('buildNeedsDocument: indicator table layout', () => {
  const idsOf = (n: number) => GSYD_IDS.slice(0, n);

  test.each([
    [1, ['portrait'], 1],
    [5, ['portrait'], 1],
    [6, ['landscape'], 1],
    [8, ['landscape'], 1],
  ])('%i areas: one table in a %p section', async (n, orientations, tableCount) => {
    const { xml } = await documentParts(inputFor(assess(idsOf(n)), []));
    const withTables = sections(xml).filter(s => s.xml.includes('<w:tbl>'));
    expect(withTables.map(s => s.orientation)).toEqual(orientations);
    expect(tables(xml)).toHaveLength(tableCount);
  });

  test('9 areas split into 8 + 1, each with Indicator, its areas, Greater Sydney and NSW; Source on the last only', async () => {
    const assessment = assess(idsOf(9));
    const { xml } = await documentParts(inputFor(assessment, []));
    const [first, second] = tables(xml);
    const names = assessment.areas.map(a => a.name);
    expect(first[0]).toEqual(['Indicator', ...names.slice(0, 8), 'Greater Sydney', 'NSW']);
    expect(second[0]).toEqual(['Indicator', names[8], 'Greater Sydney', 'NSW', 'Source']);
    const expected = indicatorTable(assessment);
    const rowOf = (table: string[][], label: string) => table.find(r => r[0] === label)!;
    const car = expected.rows[0];
    expect(rowOf(first, car.label)).toEqual([car.label, ...car.cells.slice(0, 8), ...car.cells.slice(9)]);
    expect(rowOf(second, car.label)).toEqual([car.label, car.cells[8], ...car.cells.slice(9), car.source]);
  });

  test('33 Greater Sydney LGAs make 5 tables, the four of 8 areas landscape and the last portrait', async () => {
    const assessment = assess(GSYD_IDS);
    expect(GSYD_IDS).toHaveLength(33);
    const { xml } = await documentParts(inputFor(assessment, [figure('Need map')]));
    expect(tables(xml)).toHaveLength(5);
    expect(tables(xml).map(t => t[0].length)).toEqual([11, 11, 11, 11, 5]);
    const all = sections(xml);
    const orientationOfTable = all.flatMap(s => Array.from(s.xml.matchAll(/<w:tbl>/g)).map(() => s.orientation));
    expect(orientationOfTable).toEqual(['landscape', 'landscape', 'landscape', 'landscape', 'portrait']);
    expect(xml.match(/Table \d of 5/g)).toHaveLength(5);
    expect(xml).toContain('Table 1 of 5: areas 1–8 of 33');
    expect(xml).toContain('Table 4 of 5: areas 25–32 of 33');
    expect(xml).toContain('Table 5 of 5: area 33 of 33');
    // Every table after the first starts on a new page when it is landscape.
    expect(xml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(3);
    // The indicator rows of every table are the page's.
    const expected = indicatorTable(assessment);
    expect(tables(xml).map(t => t.filter(r => r.length > 1).length)).toEqual(Array(5).fill(expected.rows.length + 1));
  });

  test('the benchmark notes follow the table note, one paragraph each (R58)', async () => {
    const assessment = assess(['lga_camden']);
    const { xml } = await documentParts(inputFor(assessment, []));
    const texts = paragraphs(xml).map(p => p.text);
    const at = texts.findIndex(t => t.startsWith('pNN is'));
    expect(indicatorTable(assessment).notes).toHaveLength(3);
    expect(texts.slice(at + 1, at + 4)).toEqual(indicatorTable(assessment).notes);
  });

  test('the table note explains the percentiles and the comparison group', async () => {
    const assessment = assess(['lga_blacktown']);
    const { xml } = await documentParts(inputFor(assessment, []));
    const note = paragraphs(xml).map(p => p.text).find(t => t.startsWith('pNN is'))!;
    expect(note).toContain(`(${comparisonLabel(assessment.areas)})`);
    expect(note).toContain('≈ marks a population-weighted estimate.');
  });
});

describe('captureFigures', () => {
  const ok = (title: string) => ({
    title, caption: `${title} source`, capture: async () => ({ png: PNG_1X1, widthPx: 30, heightPx: 20 }),
  });
  const collapsed = (title: string) => ({
    title, caption: '',
    capture: async () => { throw figureSkipError('collapsed', `Figure "${title}" is not rendered (collapsed or unmounted)`); },
  });
  const unavailable = (title: string) => ({
    title, caption: '',
    capture: async () => { throw figureSkipError('unavailable', `Figure "${title}" is unavailable: the map boundaries could not be loaded`); },
  });
  const broken = (title: string) => ({
    title, caption: '', capture: async () => { throw new Error('toBlob failed'); },
  });

  let warn: jest.SpyInstance;
  beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
  afterEach(() => warn.mockRestore());

  test('captures every figure in order', async () => {
    const { captured, skipped } = await captureFigures([ok('A'), ok('B'), ok('C')]);
    expect(captured.map(f => f.title)).toEqual(['A', 'B', 'C']);
    expect(captured[0]).toEqual({ title: 'A', caption: 'A source', png: PNG_1X1, widthPx: 30, heightPx: 20 });
    expect(skipped).toEqual([]);
    expect(skippedFiguresMessage(skipped)).toBeNull();
  });

  test('a figure that cannot be rendered is skipped by title and the others still export, renumbered', async () => {
    const { captured, skipped } = await captureFigures([ok('A'), collapsed('B'), ok('C'), collapsed('D')]);
    expect(captured.map(f => f.title)).toEqual(['A', 'C']);
    expect(skipped).toEqual([{ title: 'B', reason: 'collapsed' }, { title: 'D', reason: 'collapsed' }]);
    expect(skippedFiguresMessage(skipped)).toBe('Expand these figures and export again: B, D');
    const { xml } = await documentParts(inputFor(assess(['lga_blacktown']), captured));
    expect(paragraphs(xml).filter(p => p.style === 'Caption').map(p => p.text))
      .toEqual(['Figure 1. A. Source: A source', 'Figure 2. C. Source: C source']);
  });

  test('P2-R19: each skipped figure keeps why: unavailable (data or boundaries not loaded), collapsed, or failed', async () => {
    const { captured, skipped } = await captureFigures([unavailable('Need map'), collapsed('Trends'), broken('Radar'), ok('A')]);
    expect(captured.map(f => f.title)).toEqual(['A']);
    expect(skipped).toEqual([
      { title: 'Need map', reason: 'unavailable' },
      { title: 'Trends', reason: 'collapsed' },
      { title: 'Radar', reason: 'failed' },
    ]);
  });

  test('captures one figure at a time', async () => {
    let running = 0;
    let overlap = false;
    const slow = (title: string) => ({
      title, caption: '',
      capture: async () => {
        running++;
        overlap = overlap || running > 1;
        await new Promise(resolve => setTimeout(resolve, 5));
        running--;
        return { png: PNG_1X1, widthPx: 1, heightPx: 1 };
      },
    });
    await captureFigures([slow('A'), slow('B'), slow('C')]);
    expect(overlap).toBe(false);
  });
});

describe('skippedFiguresMessage (R22, P2-R19)', () => {
  test('nothing skipped: no message', () => {
    expect(skippedFiguresMessage([])).toBeNull();
  });

  test('an unavailable figure states why it is missing instead of asking to expand it', () => {
    expect(skippedFiguresMessage([
      { title: 'SA2 need map', reason: 'unavailable' }, { title: 'Need map', reason: 'unavailable' },
    ])).toBe('These figures could not be loaded and were left out: SA2 need map, Need map.');
  });

  test('collapsed figures keep the original wording', () => {
    expect(skippedFiguresMessage([{ title: 'Trends', reason: 'collapsed' }]))
      .toBe('Expand these figures and export again: Trends');
  });

  test('a figure that failed to render is named as such', () => {
    expect(skippedFiguresMessage([{ title: 'Radar', reason: 'failed' }]))
      .toBe('These figures could not be rendered and were left out: Radar. Export again to retry.');
  });

  test('several reasons: one sentence each, unavailable first, collapsed last', () => {
    expect(skippedFiguresMessage([
      { title: 'Trends', reason: 'collapsed' }, { title: 'SA2 need map', reason: 'unavailable' },
      { title: 'Radar', reason: 'failed' },
    ])).toBe(
      'These figures could not be loaded and were left out: SA2 need map. '
      + 'These figures could not be rendered and were left out: Radar. Export again to retry. '
      + 'Expand these figures and export again: Trends',
    );
  });

  test('skipReasonOf reads the reason of a figureSkipError; any other error is a failure', () => {
    expect(skipReasonOf(figureSkipError('unavailable', 'x'))).toBe('unavailable');
    expect(skipReasonOf(figureSkipError('collapsed', 'x'))).toBe('collapsed');
    expect(figureSkipError('collapsed', 'not rendered')).toBeInstanceOf(Error);
    expect(figureSkipError('collapsed', 'not rendered').message).toBe('not rendered');
    expect(skipReasonOf(new Error('boom'))).toBe('failed');
    expect(skipReasonOf('boom')).toBe('failed');
    expect(skipReasonOf(null)).toBe('failed');
  });
});

describe('exportTitle and exportFileName', () => {
  test('names the areas, or the combined area', () => {
    expect(exportTitle(assess(['lga_blacktown', 'lga_penrith'], 'combined'))).toBe('Needs assessment — Blacktown + Penrith');
    expect(exportTitle(assess(['lga_blacktown', 'lga_penrith']))).toBe('Needs assessment — Blacktown, Penrith');
    expect(exportTitle(assess(['lga_blacktown']))).toBe('Needs assessment — Blacktown');
  });

  test('a long selection names the first two areas and counts the rest', () => {
    expect(exportTitle(assess(GSYD_IDS))).toBe('Needs assessment — City of Sydney, City of Parramatta and 31 more');
    expect(exportTitle(assess(GSYD_IDS, 'combined'))).toBe('Needs assessment — 33 LGAs');
  });

  test('nothing selected is just "Needs assessment"', () => {
    expect(exportTitle(assess([]))).toBe('Needs assessment');
  });

  test('the file name is the slugged title with .docx', () => {
    expect(exportFileName('Needs assessment — Blacktown + Penrith')).toBe('needs-assessment-blacktown-penrith.docx');
    expect(exportFileName('Needs assessment — Ku-ring-gai, Canterbury-Bankstown')).toBe('needs-assessment-ku-ring-gai-canterbury-bankstown.docx');
    expect(exportFileName('  ---  ')).toBe('needs-assessment.docx');
    expect(exportFileName('x'.repeat(200))).toHaveLength(80 + '.docx'.length);
  });
});
