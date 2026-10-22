const TRANSLATE_3D = /^translate3d\(\s*(-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px,\s*0(?:px)?\s*\)$/;

/**
 * The [x, y] of a plain `translate3d(xpx, ypx, 0)`, which is all Leaflet sets to position a pane,
 * a tile or the SVG overlay; null for any other transform (e.g. one that also scales mid-zoom).
 */
export function parseTranslate3d(transform: string): [number, number] | null {
  const match = TRANSLATE_3D.exec(transform.trim());
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
  root.querySelectorAll<HTMLElement>('.leaflet-container [style*="translate3d"]').forEach((el) => {
    const offset = parseTranslate3d(el.style.transform);
    if (!offset) return;
    el.style.transform = '';
    el.style.left = `${offset[0]}px`;
    el.style.top = `${offset[1]}px`;
  });
}
