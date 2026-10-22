/**
 * P2-R22: the straight-line walking catchment is carried in the live transport result for the needs engine (which
 * cites it through NEEDS_SOURCES), but /transport does not show it, so its DataSourceBadge must not name its source or
 * list it under "Reference values used for".
 */

const catchment = { persons: 396703, frequentPersons: 235572, anyPersons: 376789, frequentShare: 59.3825, anyShare: 94.9801 };
let catchmentRow: typeof catchment | null = catchment;

// No SQLite: every cache read misses, so only the catchment is "live".
jest.mock('@/lib/repositories', () => {
  const miss = new Proxy({}, { get: () => async () => null });
  return { getLiveDataRepository: () => miss, getSeedWriteRepository: () => miss };
});
jest.mock('@/lib/tfnsw-api', () => ({ getLiveTfNSWTransportData: async () => ({}) }));
jest.mock('@/lib/data/transport-service-demand', () => ({
  getCatchment: async () => catchmentRow,
  getPtFrequency: async () => null,
  getTravelSurvey: async () => null,
  getCommuteFlows: () => null,
}));

import { getLiveTransportData } from '@/lib/data/live-data';

describe('getLiveTransportData: walking catchments (P2-R22)', () => {
  afterEach(() => { catchmentRow = catchment; });

  test('the catchment is in the data but its source is not in the badge sources', async () => {
    const { data, meta } = await getLiveTransportData('lga_blacktown', 2021);
    expect(data.catchment).toEqual(catchment);
    expect(meta.source).not.toMatch(/Mesh Block|catchment/i);
    expect(meta.sampleFields).not.toContain('catchment');
  });

  test('an LGA with no catchment row is not listed under reference values either', async () => {
    catchmentRow = null;
    const { data, meta } = await getLiveTransportData('lga_blacktown', 2021);
    expect(data.catchment).toBeUndefined();
    expect(meta.sampleFields).not.toContain('catchment');
    expect(meta.source).not.toMatch(/Mesh Block|catchment/i);
  });
});
