import { svgExportable, type FigureBodyParts } from '@/lib/export/svg-export';

/** R62: "Download SVG" is offered only when the SVG is the whole figure. */
describe('svgExportable', () => {
  const parts = (overrides: Partial<FigureBodyParts> = {}): FigureBodyParts => ({
    chartSvgs: 1, maps: 0, legends: 0, notes: 0, ...overrides,
  });

  test('one chart and nothing else: a single Recharts chart, or the heatmap with its legend drawn inside the SVG', () => {
    expect(svgExportable(parts())).toBe(true);
  });

  test('several charts (a multi-panel figure) would lose every panel after the first', () => {
    expect(svgExportable(parts({ chartSvgs: 2 }))).toBe(false);
    expect(svgExportable(parts({ chartSvgs: 3 }))).toBe(false);
  });

  test('an HTML legend or a note beside the chart would be dropped', () => {
    expect(svgExportable(parts({ legends: 1 }))).toBe(false);
    expect(svgExportable(parts({ notes: 1 }))).toBe(false);
    expect(svgExportable(parts({ legends: 1, notes: 2 }))).toBe(false);
  });

  test('no chart, or a map (whose SVG is only an overlay of shapes), has nothing to export', () => {
    expect(svgExportable(parts({ chartSvgs: 0 }))).toBe(false);
    expect(svgExportable(parts({ maps: 1 }))).toBe(false);
  });
});
