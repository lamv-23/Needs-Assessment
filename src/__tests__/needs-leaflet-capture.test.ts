import { parseTranslation } from '@/lib/export/leaflet-capture';

describe('parseTranslation', () => {
  test('reads the offset Leaflet sets on a pane, tile or SVG overlay', () => {
    expect(parseTranslation('translate3d(-86px, -50px, 0px)')).toEqual([-86, -50]);
    expect(parseTranslation('translate3d(0px, 0px, 0px)')).toEqual([0, 0]);
    expect(parseTranslation('translate3d(12.5px, 300px, 0)')).toEqual([12.5, 300]);
  });

  test('treats a trailing scale(1) as no scale', () => {
    // after an animated zoom (e.g. a fit to a new selection) Leaflet leaves the overlay at translate3d(...) scale(1)
    expect(parseTranslation('translate3d(-92.0513px, -49.7136px, 0px) scale(1)')).toEqual([-92.0513, -49.7136]);
    expect(parseTranslation('translate3d(10px, 20px, 0px) scale(1.5)')).toBeNull();
  });

  test('reads the matrix form of a pure translation', () => {
    // html2canvas copies the computed style onto the cloned SVG overlay, so there the offset is a matrix
    expect(parseTranslation('matrix(1, 0, 0, 1, -92, -50)')).toEqual([-92, -50]);
    expect(parseTranslation('matrix(1, 0, 0, 1, 0, 0)')).toEqual([0, 0]);
    expect(parseTranslation('matrix(1, 0, 0, 1, -92.0513, -49.7136)')).toEqual([-92.0513, -49.7136]);
  });

  test('leaves any other transform alone', () => {
    // a zoom animation also scales; replacing only the offset would misplace it
    expect(parseTranslation('translate3d(10px, 20px, 0px) scale(1.5)')).toBeNull();
    expect(parseTranslation('matrix(2, 0, 0, 2, -92, -50)')).toBeNull();
    expect(parseTranslation('matrix(1, 0.5, 0, 1, -92, -50)')).toBeNull();
    expect(parseTranslation('translate(3px, 4px)')).toBeNull();
    expect(parseTranslation('translate3d(10px, 20px, 5px)')).toBeNull();
    expect(parseTranslation('')).toBeNull();
  });
});
