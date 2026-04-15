import {
  parseAdminAction,
  parseAdminConfigUpdates,
  parseAdminLgaId,
} from '@/lib/api/admin-api';

describe('admin API validation helpers', () => {
  it('accepts supported admin actions', () => {
    expect(parseAdminAction('seed_abs')).toBe('seed_abs');
    expect(parseAdminAction('seed_static')).toBe('seed_static');
    expect(parseAdminAction('update_config')).toBe('update_config');
  });

  it('rejects unsupported admin actions', () => {
    expect(parseAdminAction('delete_everything')).toBeNull();
  });

  it('allows only mutable config keys with valid values', () => {
    expect(
      parseAdminConfigUpdates({
        abs_refresh_interval_days: '14',
        auto_refresh_enabled: 'true',
      })
    ).toEqual({
      abs_refresh_interval_days: '14',
      auto_refresh_enabled: 'true',
    });
  });

  it('rejects invalid config updates', () => {
    expect(parseAdminConfigUpdates({ abs_last_refresh: 'today' })).toBeNull();
    expect(parseAdminConfigUpdates({ abs_refresh_interval_days: '0' })).toBeNull();
    expect(parseAdminConfigUpdates({ auto_refresh_enabled: 'maybe' })).toBeNull();
  });

  it('accepts valid ABS LGA filters and rejects benchmark/unknown IDs', () => {
    expect(parseAdminLgaId('lga_sydney')).toBe('lga_sydney');
    expect(parseAdminLgaId('benchmark_gsy')).toBeNull();
    expect(parseAdminLgaId('not_real')).toBeNull();
  });
});
