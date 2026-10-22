import { MAX_CANVAS_SIDE, wideCaptureSize } from '@/lib/export/capture-size';

const base = { rootWidth: 860, rootHeight: 811, rootLeft: 24, hiddenWidth: 0, viewportWidth: 1440, requestedScale: 3 };

describe('wideCaptureSize', () => {
  test('captures the box plus the overflowing width', () => {
    // a 34-LGA heatmap: 268 + 110 * 34 + 14 + 220 = 4,242 px of SVG in an 812 px scroller (860 px card)
    const size = wideCaptureSize({ ...base, hiddenWidth: 4242 - 812 });
    expect(size.width).toBe(4290);
  });

  test('the capture viewport is at least as wide as the figure and its offset', () => {
    expect(wideCaptureSize({ ...base, hiddenWidth: 3430 }).windowWidth).toBe(4314);
    expect(wideCaptureSize({ ...base, hiddenWidth: 100 }).windowWidth).toBe(1440); // fits in the real viewport
  });

  test('keeps the requested scale while the canvas is within the browser limit', () => {
    expect(wideCaptureSize({ ...base, hiddenWidth: 3430 }).scale).toBe(3); // 4,290 x 3 = 12,870 px
  });

  test('lowers the scale so the canvas never passes the limit', () => {
    const size = wideCaptureSize({ ...base, hiddenWidth: 14000 - 860 });
    expect(size.width).toBe(14000);
    expect(size.scale).toBeCloseTo(MAX_CANVAS_SIDE / 14000, 10);
    expect(size.width * size.scale).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
  });

  test('also limits a very tall figure', () => {
    const size = wideCaptureSize({ ...base, rootHeight: 8000, hiddenWidth: 100 });
    expect(size.scale).toBe(2);
    expect(8000 * size.scale).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
  });

  test('rounds fractional widths up so the right edge is not cut', () => {
    expect(wideCaptureSize({ ...base, rootWidth: 859.4, hiddenWidth: 100.2 }).width).toBe(960);
  });
});
