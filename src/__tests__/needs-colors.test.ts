import {
  MAX_LABELLED, NEED_SCALE, NO_DATA_COLOR, areaColor, labelledIds, needColor, needTextColor,
} from '@/lib/needs/colors';
import { CHART_COLORS } from '@/lib/utils';

describe('needColor', () => {
  test('maps percentile to the five-step scale, lowest need first', () => {
    expect([needColor(0), needColor(19.9), needColor(20), needColor(80), needColor(100), needColor(null)])
      .toEqual([NEED_SCALE[0], NEED_SCALE[0], NEED_SCALE[1], NEED_SCALE[4], NEED_SCALE[4], NO_DATA_COLOR]);
  });

  test('steps change exactly at 20, 40, 60 and 80', () => {
    expect([39.99, 40, 59.99, 60, 79.99].map(needColor))
      .toEqual([NEED_SCALE[1], NEED_SCALE[2], NEED_SCALE[2], NEED_SCALE[3], NEED_SCALE[3]]);
  });

  test('clamps out-of-range input and treats NaN as no data', () => {
    expect([needColor(-5), needColor(250), needColor(Number.NaN)])
      .toEqual([NEED_SCALE[0], NEED_SCALE[4], NO_DATA_COLOR]);
  });

  test('the scale has five distinct steps', () => {
    expect(new Set(NEED_SCALE).size).toBe(5);
  });
});

describe('needTextColor', () => {
  test('is white only on the darkest step, dark grey elsewhere', () => {
    expect([0, 20, 40, 60, 80, 100].map(needTextColor))
      .toEqual(['#111827', '#111827', '#111827', '#111827', '#ffffff', '#ffffff']);
  });

  test('no data gets dark text', () => {
    expect(needTextColor(null)).toBe('#111827');
  });
});

describe('labelledIds', () => {
  test('names at most the first 12 selected areas', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `l${i}`);
    expect(labelledIds(ids)).toHaveLength(12);
    expect(labelledIds(ids)).toEqual(ids.slice(0, MAX_LABELLED));
  });

  test('keeps a short selection whole and does not modify its input', () => {
    const ids = ['a', 'b'];
    expect(labelledIds(ids)).toEqual(['a', 'b']);
    expect(labelledIds(ids)).not.toBe(ids);
  });
});

describe('areaColor', () => {
  test('is the chart palette by position, wrapping after the last colour', () => {
    expect(areaColor(0)).toBe(CHART_COLORS[0]);
    expect(areaColor(CHART_COLORS.length)).toBe(CHART_COLORS[0]);
    expect(areaColor(CHART_COLORS.length + 2)).toBe(CHART_COLORS[2]);
  });
});
