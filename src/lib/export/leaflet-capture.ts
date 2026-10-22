const NUMBER = String.raw`(-?\d+(?:\.\d+)?)`;
// A trailing scale(1) is what Leaflet leaves on the SVG overlay after an animated zoom; it changes nothing.
const TRANSLATE_3D = new RegExp(String.raw`^translate3d\(\s*${NUMBER}px,\s*${NUMBER}px,\s*0(?:px)?\s*\)(?:\s*scale\(\s*1\s*\))?$`);
const MATRIX_TRANSLATION = new RegExp(String.raw`^matrix\(\s*1,\s*0,\s*0,\s*1,\s*${NUMBER},\s*${NUMBER}\s*\)$`);

/**
 * The [x, y] of a transform that only moves an element: a plain `translate3d(xpx, ypx, 0)` (optionally
 * followed by `scale(1)`), which is all Leaflet sets to position a pane, a tile or the SVG overlay, or
 * the equivalent `matrix(1, 0, 0, 1, x, y)`, which is how html2canvas copies it onto the cloned SVG
 * overlay. Null for any other transform (e.g. one that also scales mid-zoom).
 */
export function parseTranslation(transform: string): [number, number] | null {
  const match = TRANSLATE_3D.exec(transform.trim()) ?? MATRIX_TRANSLATION.exec(transform.trim());
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/**
 * Makes a Leaflet map render correctly in html2canvas. html2canvas measures an element with
 * getBoundingClientRect, which already includes its CSS transform, and then applies the transform
 * again, so the panes, tiles and SVG overlay of a map come out shifted by their offset. Where
 * 3D transforms are unavailable Leaflet positions the same elements with left/top; this does that.
 * Call it on the clone html2canvas is about to render (its `onclone`), never on the live page.
 */
export function flattenLeafletTransforms(root: ParentNode): void {
  root.querySelectorAll<HTMLElement | SVGElement>('.leaflet-container [style*="translate3d"], .leaflet-container [style*="matrix("]').forEach((el) => {
    const offset = parseTranslation(el.style.transform);
    if (!offset) return;
    el.style.transform = '';
    el.style.left = `${offset[0]}px`;
    el.style.top = `${offset[1]}px`;
  });
}
