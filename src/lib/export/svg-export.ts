const SVG_NS = 'http://www.w3.org/2000/svg';

/** HTML legends: Recharts' wrapper, and the needs charts' own legend lists. */
const LEGEND_SELECTOR = '.recharts-legend-wrapper, [data-figure-legend]';
/** Notes beside a chart that carry meaning (sources, keys, caveats). The figure caption is not one of them. */
const NOTE_SELECTOR = '[data-figure-note]';
const MAP_SELECTOR = '.leaflet-container';

/** What decides whether a figure can be downloaded as an SVG (R62). */
export interface FigureBodyParts {
  /** Chart drawings: outermost `<svg>`s that are not icons, legend swatches or part of a note or map. */
  chartSvgs: number;
  /** Leaflet maps, whose SVG is only an overlay of shapes in map pixels. */
  maps: number;
  /** HTML legends (`.recharts-legend-wrapper`, `[data-figure-legend]`). */
  legends: number;
  /** Notes beside the chart that carry meaning (`[data-figure-note]`). */
  notes: number;
}

/**
 * "Download SVG" is offered only when the SVG is the whole figure (R62): exactly one chart, and no map, HTML legend or
 * note that the file would leave out. A multi-panel figure would lose every panel after the first.
 */
export function svgExportable(parts: FigureBodyParts): boolean {
  return parts.chartSvgs === 1 && parts.maps === 0 && parts.legends === 0 && parts.notes === 0;
}

/** The chart drawings under `root`, in document order (see `FigureBodyParts.chartSvgs`). */
function chartSvgs(root: ParentNode): SVGSVGElement[] {
  return Array.from(root.querySelectorAll<SVGSVGElement>('svg')).filter(svg => (
    !svg.parentElement?.closest('svg')
    && !svg.classList.contains('lucide')
    && svg.getAttribute('aria-hidden') !== 'true'
    && !svg.closest(`${LEGEND_SELECTOR}, ${NOTE_SELECTOR}, ${MAP_SELECTOR}`)
  ));
}

/** Counts the parts of the figure body under `root` that decide whether it can be an SVG. */
export function figureBodyParts(root: ParentNode): FigureBodyParts {
  return {
    chartSvgs: chartSvgs(root).length,
    maps: root.querySelectorAll(MAP_SELECTOR).length,
    legends: root.querySelectorAll(LEGEND_SELECTOR).length,
    notes: root.querySelectorAll(NOTE_SELECTOR).length,
  };
}

/**
 * Serialises the chart SVG under `root` into a standalone, downloadable SVG string, or returns null when there is
 * none: the first chart drawing, never an icon, a legend swatch or a Leaflet map's overlay. Whether the figure should
 * be offered as SVG at all is `svgExportable`'s decision. The clone gets an explicit xmlns, pixel width/height (and a
 * viewBox if missing) and the computed font family, because a standalone file loses the page's CSS.
 */
export function serializeSvg(root: HTMLElement): string | null {
  const svg = chartSvgs(root)[0];
  if (!svg) return null;

  const rect = svg.getBoundingClientRect();
  const width = rect.width || parseFloat(svg.getAttribute('width') ?? '');
  const height = rect.height || parseFloat(svg.getAttribute('height') ?? '');

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NS);
  if (width > 0 && height > 0) {
    if (!clone.hasAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
  }
  // Recharts sizes the surface with `style="width:100%;height:100%"`, which would override the
  // explicit size above once the file is opened on its own.
  clone.style.removeProperty('width');
  clone.style.removeProperty('height');
  const fontFamily = window.getComputedStyle(svg).fontFamily;
  if (fontFamily) clone.style.fontFamily = fontFamily;

  return new XMLSerializer().serializeToString(clone);
}
