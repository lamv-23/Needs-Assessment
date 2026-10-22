import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, ImageRun, LineRuleType, PageOrientation, Paragraph,
  ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType,
  type FileChild, type ISectionOptions,
} from 'docx';
import { DOMAIN_LABELS } from './indicators';
import type { NarrativeParagraph, NarrativeSection } from './narrative';
import {
  citationSegments, comparisonLabel, formatNeedsDate, indicatorTable, indicatorTableNote, NEEDS_SOURCES, sourceNumber,
  type IndicatorTableData,
} from './page-data';
import type { NeedsAssessment } from './types';

/**
 * The editable Word version of the /needs page: plain Calibri 11 with Word's built-in heading styles, native tables
 * and the figures as pictures. Everything shown (citation numbers, source order, table cells) comes from the same
 * helpers as the page, so the two agree.
 */

export interface DocxFigure { title: string; caption: string; png: Uint8Array; widthPx: number; heightPx: number }
export interface NeedsDocxInput {
  title: string;
  generatedOn: string;
  assessment: NeedsAssessment;
  narrative: NarrativeSection[];
  figures: DocxFigure[];
}

/** What the figure registry offers: a title, a source line and a way to render the figure as a PNG. */
export interface CapturableFigure {
  title: string;
  caption: string;
  capture(): Promise<{ png: Uint8Array; widthPx: number; heightPx: number }>;
}

/**
 * Renders the figures one by one, in order. A figure that cannot be rendered (collapsed, say) is left out and its
 * title returned in `skipped`, so the document is still made from the rest.
 */
export async function captureFigures(figures: CapturableFigure[]): Promise<{ captured: DocxFigure[]; skipped: string[] }> {
  const captured: DocxFigure[] = [];
  const skipped: string[] = [];
  for (const figure of figures) {
    try {
      const { png, widthPx, heightPx } = await figure.capture();
      captured.push({ title: figure.title, caption: figure.caption, png, widthPx, heightPx });
    } catch (error) {
      console.warn(`Figure "${figure.title}" left out of the Word export:`, error);
      skipped.push(figure.title);
    }
  }
  return { captured, skipped };
}

/** What to tell the user when figures were left out of the export; null when none were. */
export function skippedFiguresMessage(skipped: string[]): string | null {
  return skipped.length > 0 ? `Expand these figures and export again: ${skipped.join(', ')}` : null;
}

// A4 with 2.5 cm margins: 16.0 cm of text width in portrait, 24.7 cm in landscape.
const A4_WIDTH_TWIPS = 11906;
const A4_HEIGHT_TWIPS = 16838;
const MARGIN_TWIPS = 1418;
const PORTRAIT_TEXT_TWIPS = A4_WIDTH_TWIPS - 2 * MARGIN_TWIPS;
const LANDSCAPE_TEXT_TWIPS = A4_HEIGHT_TWIPS - 2 * MARGIN_TWIPS;

const PORTRAIT_TEXT_WIDTH_CM = 16;
const LANDSCAPE_TEXT_WIDTH_CM = 24.7;
/** A figure wider than this multiple of its height goes in a landscape section. */
const WIDE_FIGURE_RATIO = 1.6;
// Text height of the page (24.7 / 16 cm) less room for the "Figures" heading and a caption of a few lines.
const PORTRAIT_FIGURE_MAX_HEIGHT_CM = 20;
const LANDSCAPE_FIGURE_MAX_HEIGHT_CM = 12;

const AREA_COLUMNS_PER_TABLE = 8;
/** A table with more area columns than this does not fit the portrait text width. */
const PORTRAIT_MAX_AREA_COLUMNS = 5;
const BENCHMARK_COLUMNS = 2;
const MAX_VALUE_COLUMN_TWIPS = 1500;

const BODY_SIZE = 22; // half-points: 11 pt
const CAPTION_SIZE = 20;
// Table text is smaller than the body so the value columns stay readable; the wide (landscape) tables, whose columns
// are narrower, are smaller still so that a long name such as "Campbelltown" fits its column heading.
const TABLE_SIZE = 18;
const WIDE_TABLE_SIZE = 16;
const TABLE_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const HEADER_FILL = 'E7E6E6';
const DOMAIN_FILL = 'F2F2F2';

// docx sizes pictures in pixels at 96 to the inch and converts them to whole EMU, so fractions keep the aspect ratio.
const cmToPx = (cm: number) => (cm * 96) / 2.54;

export interface FigureLayout { orientation: 'portrait' | 'landscape'; widthCm: number; heightCm: number }

/**
 * Where and how big a figure is drawn: a wide figure (width over 1.6 times its height) in a landscape section
 * at the full 24.7 cm, any other at most 16 cm wide. The aspect ratio is kept and the height is kept within the page.
 */
export function figureLayout(widthPx: number, heightPx: number): FigureLayout {
  const ratio = widthPx > 0 && heightPx > 0 ? widthPx / heightPx : 1;
  const landscape = ratio > WIDE_FIGURE_RATIO;
  const maxWidth = landscape ? LANDSCAPE_TEXT_WIDTH_CM : PORTRAIT_TEXT_WIDTH_CM;
  const maxHeight = landscape ? LANDSCAPE_FIGURE_MAX_HEIGHT_CM : PORTRAIT_FIGURE_MAX_HEIGHT_CM;
  const orientation = landscape ? 'landscape' : 'portrait';
  return maxWidth / ratio <= maxHeight
    ? { orientation, widthCm: maxWidth, heightCm: maxWidth / ratio }
    : { orientation, widthCm: maxHeight * ratio, heightCm: maxHeight };
}

/**
 * The document as a sequence of sections: content joins the last section when it has the same orientation, so a run of
 * wide figures (or of portrait ones) is one section that Word flows across pages, and a new section starts only when
 * the orientation changes.
 */
function createFlow() {
  const pages: Array<{ orientation: FigureLayout['orientation']; children: FileChild[] }> = [];
  return {
    add(orientation: FigureLayout['orientation'], children: FileChild[]) {
      const last = pages[pages.length - 1];
      if (last && last.orientation === orientation) last.children.push(...children);
      else pages.push({ orientation, children: [...children] });
    },
    sections(): ISectionOptions[] {
      return pages.map(page => ({
        properties: {
          page: {
            size: {
              width: A4_WIDTH_TWIPS,
              height: A4_HEIGHT_TWIPS,
              orientation: page.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: { top: MARGIN_TWIPS, right: MARGIN_TWIPS, bottom: MARGIN_TWIPS, left: MARGIN_TWIPS },
          },
        },
        children: page.children,
      }));
    },
  };
}

const heading = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2) => (
  new Paragraph({ heading: level, children: [new TextRun(text)] })
);

/** "Label: value" with the label in bold. */
const labelled = (label: string, value: string) => new Paragraph({
  spacing: { after: 40 },
  children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)],
});

/** "1–3, 5": the page's citation numbers, as text. */
function citationText(paragraph: NarrativeParagraph): string {
  return citationSegments(paragraph.citations.map(sourceNumber))
    .map(({ from, to }) => (from === to ? `${from}` : `${from}–${to}`))
    .join(', ');
}

function narrativeParagraph(paragraph: NarrativeParagraph): Paragraph {
  const citations = citationText(paragraph);
  return new Paragraph({
    children: [new TextRun(paragraph.text), ...(citations ? [new TextRun({ text: citations, superScript: true })] : [])],
  });
}

function narrativeBlock(section: NarrativeSection): FileChild[] {
  return [heading(section.heading), ...section.paragraphs.map(narrativeParagraph)];
}

function selectionLines(assessment: NeedsAssessment, generatedOn: string): Paragraph[] {
  const { areas, memberIds, records, mode } = assessment;
  const names = memberIds.map(id => records.find(r => r.areaId === id)?.name ?? id);
  const combined = mode === 'combined' && names.length >= 2;
  let shown = 'Separate';
  if (combined) shown = `Combined (one area, ${areas[0].name})`;
  else if (names.length === 1) shown = 'Single LGA';
  return [
    labelled('Generated', generatedOn),
    labelled('Areas', names.join(', ')),
    labelled('Mode', shown),
    labelled('Compared with', comparisonLabel(areas)),
  ];
}

// -- Indicator table ----------------------------------------------------------------------------

interface CellStyle {
  size: number;
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  bold?: boolean;
  fill?: string;
  span?: number;
}

function tableCell(text: string, width: number, { size, align = AlignmentType.LEFT, bold = false, fill, span }: CellStyle): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: span,
    shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
    children: [new Paragraph({
      alignment: align,
      spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
      children: [new TextRun({ text, bold, size })],
    })],
  });
}

/** Column widths in twips: Indicator, one per value column, then Source when shown; they add up to the text width. */
function columnWidths(landscape: boolean, areaColumns: number, withSource: boolean): number[] {
  const total = landscape ? LANDSCAPE_TEXT_TWIPS : PORTRAIT_TEXT_TWIPS;
  const valueColumns = areaColumns + BENCHMARK_COLUMNS;
  const source = withSource ? Math.round(total * (landscape ? 0.13 : 0.15)) : 0;
  const indicatorMin = Math.round(total * (landscape ? 0.2 : 0.24));
  const value = Math.min(MAX_VALUE_COLUMN_TWIPS, Math.floor((total - source - indicatorMin) / valueColumns));
  const indicator = total - source - value * valueColumns;
  return [indicator, ...Array<number>(valueColumns).fill(value), ...(withSource ? [source] : [])];
}

/** One native table: the indicator column, the value columns `columns` (indexes into `table.columns`), and Source if asked. */
function indicatorWordTable(table: IndicatorTableData, columns: number[], withSource: boolean): { table: Table; landscape: boolean } {
  const areaColumns = columns.length - BENCHMARK_COLUMNS;
  const landscape = areaColumns > PORTRAIT_MAX_AREA_COLUMNS;
  const widths = columnWidths(landscape, areaColumns, withSource);
  const total = widths.reduce((sum, w) => sum + w, 0);
  const size = landscape ? WIDE_TABLE_SIZE : TABLE_SIZE;
  const cell = (text: string, column: number, style: Omit<CellStyle, 'size'> = {}) => tableCell(text, widths[column], { size, ...style });
  const right = AlignmentType.RIGHT;
  const sourceColumn = widths.length - 1;

  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      cell('Indicator', 0, { bold: true, fill: HEADER_FILL }),
      ...columns.map((c, i) => cell(table.columns[c], i + 1, { bold: true, fill: HEADER_FILL, align: right })),
      ...(withSource ? [cell('Source', sourceColumn, { bold: true, fill: HEADER_FILL })] : []),
    ],
  });

  const body = table.rows.flatMap((row, r) => [
    ...(r === 0 || table.rows[r - 1].domain !== row.domain
      ? [new TableRow({
        cantSplit: true,
        children: [tableCell(DOMAIN_LABELS[row.domain], total, { size, bold: true, fill: DOMAIN_FILL, span: widths.length })],
      })]
      : []),
    new TableRow({
      cantSplit: true,
      children: [
        cell(row.label, 0),
        ...columns.map((c, i) => cell(row.cells[c], i + 1, { align: right })),
        ...(withSource ? [cell(row.source, sourceColumn)] : []),
      ],
    }),
  ]);

  return {
    landscape,
    table: new Table({
      width: { size: total, type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      margins: { top: 30, bottom: 30, left: 50, right: 50 },
      borders: {
        top: TABLE_BORDER, bottom: TABLE_BORDER, left: TABLE_BORDER, right: TABLE_BORDER,
        insideHorizontal: TABLE_BORDER, insideVertical: TABLE_BORDER,
      },
      rows: [header, ...body],
    }),
  };
}

/** "areas 9–16 of 33", or "area 33 of 33" for a table of one; `start` is 0-based, `end` exclusive. */
const areaRange = (start: number, end: number, total: number) => (
  end - start === 1 ? `area ${end} of ${total}` : `areas ${start + 1}–${end} of ${total}`
);

/**
 * The indicator table as consecutive tables of at most 8 area columns, each followed by Greater Sydney and NSW; only
 * the last has Source. A table with more than 5 area columns is landscape.
 */
function indicatorBlocks(assessment: NeedsAssessment): Array<{ orientation: FigureLayout['orientation']; children: FileChild[] }> {
  const table = indicatorTable(assessment);
  const areaCount = table.columns.length - BENCHMARK_COLUMNS;
  const benchmarks = [areaCount, areaCount + 1];
  const starts = Array.from({ length: Math.max(1, Math.ceil(areaCount / AREA_COLUMNS_PER_TABLE)) }, (_, i) => i * AREA_COLUMNS_PER_TABLE);

  return starts.map((start, i) => {
    const end = Math.min(start + AREA_COLUMNS_PER_TABLE, areaCount);
    const columns = [...Array.from({ length: end - start }, (_, k) => start + k), ...benchmarks];
    const last = i === starts.length - 1;
    const { table: wordTable, landscape } = indicatorWordTable(table, columns, last);
    return {
      orientation: landscape ? 'landscape' : 'portrait',
      children: [
        ...(i === 0 ? [heading('Indicators')] : []),
        ...(starts.length > 1
          ? [new Paragraph({
            pageBreakBefore: i > 0 && landscape,
            keepNext: true,
            children: [new TextRun({ text: `Table ${i + 1} of ${starts.length}: ${areaRange(start, end, areaCount)}`, bold: true })],
          })]
          : []),
        wordTable,
        ...(last
          ? [indicatorTableNote(comparisonLabel(assessment.areas)), ...table.notes].map((note, n) => new Paragraph({
            spacing: { before: n === 0 ? 120 : 0 },
            children: [new TextRun({ text: note, size: TABLE_SIZE })],
          }))
          : []),
      ],
    };
  });
}

// -- Figures and sources ------------------------------------------------------------------------

function figureBlock(figure: DocxFigure, number: number, layout: FigureLayout): FileChild[] {
  const caption = `Figure ${number}. ${figure.title}. Source: ${figure.caption}`;
  return [
    new Paragraph({
      keepNext: true,
      spacing: { before: 120, after: 60 },
      children: [new ImageRun({
        type: 'png',
        data: figure.png,
        transformation: { width: cmToPx(layout.widthCm), height: cmToPx(layout.heightCm) },
        altText: { name: `Figure ${number}`, title: figure.title, description: caption },
      })],
    }),
    new Paragraph({ style: 'Caption', children: [new TextRun(caption)] }),
  ];
}

function sourcesBlock(assessment: NeedsAssessment): FileChild[] {
  return [
    heading('Sources'),
    ...NEEDS_SOURCES.map((source, i) => new Paragraph({
      indent: { left: 425, hanging: 425 },
      spacing: { after: 60 },
      children: [
        new TextRun(`${i + 1}.\t${source.full}`),
        ...(source.url
          ? [
            new TextRun('. '),
            new ExternalHyperlink({ link: source.url, children: [new TextRun({ text: source.url, style: 'Hyperlink' })] }),
          ]
          : []),
      ],
    })),
    new Paragraph({
      spacing: { before: 120 },
      children: [new TextRun(`Indicator snapshot built ${formatNeedsDate(assessment.generatedAt)}.`)],
    }),
  ];
}

/**
 * The needs assessment as a Word document: title and selection, written findings (key findings first, then the summary,
 * the domains and further findings, in the narrative's order), the indicator table(s), figures, data notes and sources.
 * The data notes are the narrative's own notes section, which already ends with the method sentence, so it is not
 * added again.
 */
export function buildNeedsDocument(input: NeedsDocxInput): Document {
  const { title, generatedOn, assessment, narrative, figures } = input;
  const flow = createFlow();

  const findings = narrative.filter(s => s.id !== 'notes');
  const notes = narrative.find(s => s.id === 'notes');

  flow.add('portrait', [
    heading(title, HeadingLevel.HEADING_1),
    ...selectionLines(assessment, generatedOn),
    ...findings.flatMap(narrativeBlock),
  ]);

  for (const block of indicatorBlocks(assessment)) flow.add(block.orientation, block.children);

  figures.forEach((figure, i) => {
    const layout = figureLayout(figure.widthPx, figure.heightPx);
    const children = [...(i === 0 ? [heading('Figures')] : []), ...figureBlock(figure, i + 1, layout)];
    flow.add(layout.orientation, children);
  });

  flow.add('portrait', [...(notes ? narrativeBlock(notes) : []), ...sourcesBlock(assessment)]);

  const headingStyle = (size: number) => ({
    run: { size, bold: true, color: '000000' },
    paragraph: { keepNext: true, keepLines: true, spacing: { before: 240, after: 120 } },
  });

  return new Document({
    title,
    creator: 'Transport Needs Assessment Tool',
    description: 'Needs assessment of NSW local government areas',
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: BODY_SIZE, language: { value: 'en-AU' } },
          paragraph: { spacing: { after: 120, line: 259, lineRule: LineRuleType.AUTO } },
        },
        heading1: headingStyle(32),
        heading2: headingStyle(26),
      },
      paragraphStyles: [{
        id: 'Caption',
        name: 'caption',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { italics: true, size: CAPTION_SIZE },
        paragraph: { spacing: { before: 60, after: 240 } },
      }],
    },
    sections: flow.sections(),
  });
}
