/**
 * Scheduled refresh: auto_refresh_enabled used to be a setting nothing acted on.
 */

import { dueScheduledRefreshes } from '../lib/refresh-jobs';

const NOW = new Date('2026-10-22T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe('dueScheduledRefreshes', () => {
  const base = {
    auto_refresh_enabled: 'true',
    abs_refresh_interval_days: '7',
    tfnsw_refresh_interval_days: '7',
  };

  it('does nothing when auto refresh is disabled', () => {
    expect(dueScheduledRefreshes({ ...base, auto_refresh_enabled: 'false' }, new Set(), NOW)).toEqual([]);
  });

  it('queues refreshes whose interval has passed', () => {
    const config = { ...base, abs_last_refresh: daysAgo(8), official_transport_last_seed: daysAgo(2) };
    expect(dueScheduledRefreshes(config, new Set(), NOW)).toEqual(['abs']);
  });

  it('treats a missing or empty last-refresh time as due', () => {
    expect(dueScheduledRefreshes({ ...base, abs_last_refresh: '' }, new Set(), NOW)).toEqual(['abs', 'transport']);
  });

  it('respects each interval setting', () => {
    const config = { ...base, tfnsw_refresh_interval_days: '1', abs_last_refresh: daysAgo(3), official_transport_last_seed: daysAgo(3) };
    expect(dueScheduledRefreshes(config, new Set(), NOW)).toEqual(['transport']);
  });

  it('skips job types already queued or running', () => {
    const config = { ...base, abs_last_refresh: daysAgo(30), official_transport_last_seed: daysAgo(30) };
    expect(dueScheduledRefreshes(config, new Set(['abs']), NOW)).toEqual(['transport']);
    expect(dueScheduledRefreshes(config, new Set(['all']), NOW)).toEqual([]);
  });
});
