const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Serialises the chart SVG under `root` into a standalone, downloadable SVG string, or returns
 * null when there is none (a Leaflet map's overlay does not count). Prefers the Recharts surface
 * so a legend icon or toolbar glyph that appears earlier in the DOM is never picked; lucide icons
 * are skipped when falling back to the first `<svg>`. The clone gets an explicit xmlns, pixel width/height (and a viewBox if missing)
 * and the computed font family, because a standalone file loses the page's CSS.
 */
export function serializeSvg(root: HTMLElement): string | null {
  const svg =
    root.querySelector<SVGSVGElement>('svg.recharts-surface') ??
    root.querySelector<SVGSVGElement>('svg:not(.lucide)');
  // A Leaflet map's overlay is only the shapes, in map pixels: not a figure of its own.
  if (!svg || svg.closest('.leaflet-container')) return null;

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
