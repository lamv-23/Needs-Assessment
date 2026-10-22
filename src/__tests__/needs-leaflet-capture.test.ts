import { parseTranslate3d } from '@/lib/export/leaflet-capture';

describe('parseTranslate3d', () => {
  test('reads the offset Leaflet sets on a pane, tile or SVG overlay', () => {
    expect(parseTranslate3d('translate3d(-86px, -50px, 0px)')).toEqual([-86, -50]);
    expect(parseTranslate3d('translate3d(0px, 0px, 0px)')).toEqual([0, 0]);
    expect(parseTranslate3d('translate3d(12.5px, 300px, 0)')).toEqual([12.5, 300]);
  });

  test('leaves any other transform alone', () => {
    // a zoom animation also scales; replacing only the offset would misplace it
    expect(parseTranslate3d('translate3d(10px, 20px, 0px) scale(1.5)')).toBeNull();
    expect(parseTranslate3d('translate(3px, 4px)')).toBeNull();
    expect(parseTranslate3d('translate3d(10px, 20px, 5px)')).toBeNull();
    expect(parseTranslate3d('')).toBeNull();
  });
});
