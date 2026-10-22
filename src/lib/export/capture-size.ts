/** Browsers fail (Chrome: 16,384) or return a blank canvas past this many pixels on a side. */
export const MAX_CANVAS_SIDE = 16000;

/**
 * Canvas geometry for capturing a figure whose content is wider than its box (a horizontally
 * scrolling container): `hiddenWidth` is the width that overflows, in CSS px.
 * - `width`: the full figure, box plus overflow.
 * - `windowWidth`: the capture viewport, wide enough to lay the figure out from `rootLeft` without
 *   wrapping or clipping it.
 * - `scale`: `requested`, reduced only if the canvas would pass `MAX_CANVAS_SIDE` on either side.
 */
export function wideCaptureSize(input: {
  rootWidth: number;
  rootHeight: number;
  rootLeft: number;
  hiddenWidth: number;
  viewportWidth: number;
  requestedScale: number;
}) {
  const width = Math.ceil(input.rootWidth + input.hiddenWidth);
  const longestSide = Math.max(width, Math.ceil(input.rootHeight));
  return {
    width,
    windowWidth: Math.max(input.viewportWidth, Math.ceil(input.rootLeft + width)),
    scale: Math.min(input.requestedScale, MAX_CANVAS_SIDE / longestSide),
  };
}
