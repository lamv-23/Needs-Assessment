import { SAMPLE_AREAS, NSW_REGIONS, lgasInRegion } from '@/lib/data/sample-areas';
import { parseNeedsParams, serializeNeedsParams } from '@/lib/needs/selection';

describe('parseNeedsParams', () => {
  test('keeps valid LGA ids, de-duplicates, and reports invalid ids in URL order', () => {
    const p = parseNeedsParams(
      new URLSearchParams('lgas=lga_blacktown,lga_blacktown,lga_x,sa2_sydney_cbd&mode=combined&universe=gsyd'),
    );
    expect(p).toEqual({
      areaIds: ['lga_blacktown'],
      invalidIds: ['lga_x', 'sa2_sydney_cbd'],
      mode: 'combined',
      universe: 'gsyd',
    });
  });

  test('defaults to separate / nsw and never falls back to lga_sydney', () => {
    expect(parseNeedsParams(new URLSearchParams('mode=bogus'))).toEqual({
      areaIds: [], invalidIds: [], mode: 'separate', universe: 'nsw',
    });
    expect(parseNeedsParams(new URLSearchParams(''))).toEqual({
      areaIds: [], invalidIds: [], mode: 'separate', universe: 'nsw',
    });
  });

  test('accepts every universe and rejects unknown ones', () => {
    expect(parseNeedsParams(new URLSearchParams('universe=peer')).universe).toBe('peer');
    expect(parseNeedsParams(new URLSearchParams('universe=region')).universe).toBe('region');
    expect(parseNeedsParams(new URLSearchParams('universe=gsyd')).universe).toBe('gsyd');
    expect(parseNeedsParams(new URLSearchParams('universe=world')).universe).toBe('nsw');
  });

  test('tolerates blanks and whitespace around ids', () => {
    const p = parseNeedsParams(new URLSearchParams('lgas=, lga_penrith ,,lga_sydney,'));
    expect(p.areaIds).toEqual(['lga_penrith', 'lga_sydney']);
    expect(p.invalidIds).toEqual([]);
  });

  test('treats the Greater Sydney benchmark as invalid', () => {
    const p = parseNeedsParams(new URLSearchParams('lgas=benchmark_gsy,lga_sydney'));
    expect(p.areaIds).toEqual(['lga_sydney']);
    expect(p.invalidIds).toEqual(['benchmark_gsy']);
  });

  test('de-duplicates invalid ids', () => {
    const p = parseNeedsParams(new URLSearchParams('lgas=lga_x,lga_x,lga_y'));
    expect(p.invalidIds).toEqual(['lga_x', 'lga_y']);
  });
});

describe('serializeNeedsParams', () => {
  test('omits defaults', () => {
    expect(serializeNeedsParams({ areaIds: [], mode: 'separate', universe: 'nsw' })).toBe('');
    expect(serializeNeedsParams({ areaIds: ['lga_sydney'], mode: 'separate', universe: 'nsw' })).toBe('lgas=lga_sydney');
  });

  test('writes non-default mode and universe', () => {
    expect(
      serializeNeedsParams({ areaIds: ['lga_a', 'lga_b'], mode: 'combined', universe: 'gsyd' }),
    ).toBe('lgas=lga_a,lga_b&mode=combined&universe=gsyd');
    expect(serializeNeedsParams({ areaIds: [], mode: 'combined', universe: 'nsw' })).toBe('mode=combined');
  });

  test('round-trips through parseNeedsParams', () => {
    const input = { areaIds: ['lga_blacktown', 'lga_penrith'], mode: 'combined' as const, universe: 'peer' as const };
    const parsed = parseNeedsParams(new URLSearchParams(serializeNeedsParams(input)));
    expect(parsed).toEqual({ ...input, invalidIds: [] });
  });
});

describe('NSW regions', () => {
  test('lgasInRegion returns only LGAs of that region', () => {
    const hunter = lgasInRegion('Hunter');
    expect(hunter.length).toBeGreaterThan(0);
    expect(hunter.every(a => a.type === 'lga' && a.region === 'Hunter')).toBe(true);
  });

  test('lgasInRegion returns nothing for an unknown region', () => {
    expect(lgasInRegion('Atlantis')).toEqual([]);
  });

  test('NSW_REGIONS covers every LGA region', () => {
    expect(NSW_REGIONS).toHaveLength(10);
    const lgaRegions = new Set(SAMPLE_AREAS.filter(a => a.type === 'lga').map(a => a.region));
    for (const region of lgaRegions) expect(NSW_REGIONS).toContain(region);
  });
});
