import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { PROJECTION_LGAS, getProjectionsForArea, resolveProjectionName } from '@/lib/data/nsw-projections-data';

/** The two lookups getLiveGrowthData makes: by area id, then by the id as words. */
const resolveLikeLiveData = (areaId: string) =>
  resolveProjectionName(areaId) ?? resolveProjectionName(areaId.replace('lga_', '').replace(/_/g, ' '));

describe('resolveProjectionName (R60)', () => {
  test('ignores case, hyphens, underscores and spaces on both sides', () => {
    expect(resolveProjectionName('port macquarie hastings')).toBe('Port Macquarie-Hastings');
    expect(resolveProjectionName('Port Macquarie-Hastings')).toBe('Port Macquarie-Hastings');
    expect(resolveProjectionName('lga_port_macquarie_hastings')).toBe('Port Macquarie-Hastings');
    expect(resolveProjectionName('mid coast')).toBe('Mid-Coast');
    expect(resolveProjectionName('queanbeyan palerang')).toBe('Queanbeyan-Palerang Regional');
    expect(resolveProjectionName('mid western')).toBe('Mid-Western Regional');
    expect(resolveProjectionName('cootamundra gundagai')).toBe('Cootamundra-Gundagai Regional');
  });

  test('keeps the mapped and exact names it already resolved', () => {
    expect(resolveProjectionName('lga_sydney')).toBe('Sydney');
    expect(resolveProjectionName('lga_campbelltown')).toBe('Campbelltown (NSW)');
    expect(resolveProjectionName('liverpool plains')).toBe('Liverpool Plains');
    expect(resolveProjectionName('Liverpool')).toBe('Liverpool');
    expect(resolveProjectionName('nowhere at all')).toBeUndefined();
  });

  test('every NSW LGA in the snapshot resolves to a projection series of its own', () => {
    const ids = NEEDS_SNAPSHOT.records.map(r => r.areaId);
    const resolved = ids.map(id => ({ id, name: resolveLikeLiveData(id) }));
    expect(resolved.filter(r => r.name === undefined).map(r => r.id)).toEqual([]);
    expect(new Set(resolved.map(r => r.name)).size).toBe(ids.length);
    for (const { name } of resolved) {
      expect(PROJECTION_LGAS).toContain(name);
      expect(getProjectionsForArea(name!).map(p => p.year)).toContain(2041);
    }
  });
});
