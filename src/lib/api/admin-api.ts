import { LGA_CODE_MAP } from '@/lib/abs-fetchers';

export type AdminAction = 'update_config' | 'seed_static' | 'seed_abs';

export const MUTABLE_ADMIN_CONFIG_KEYS = [
  'abs_refresh_interval_days',
  'tfnsw_refresh_interval_days',
  'auto_refresh_enabled',
] as const;

type MutableAdminConfigKey = (typeof MUTABLE_ADMIN_CONFIG_KEYS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseAdminAction(value: unknown): AdminAction | null {
  if (value === 'update_config' || value === 'seed_static' || value === 'seed_abs') {
    return value;
  }

  return null;
}

export function parseAdminConfigUpdates(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) {
    return null;
  }

  const updates: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(value)) {
    if (!MUTABLE_ADMIN_CONFIG_KEYS.includes(key as MutableAdminConfigKey)) {
      return null;
    }

    if (typeof rawValue !== 'string') {
      return null;
    }

    if (key === 'auto_refresh_enabled') {
      if (rawValue !== 'true' && rawValue !== 'false') {
        return null;
      }
      updates[key] = rawValue;
      continue;
    }

    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
      return null;
    }

    updates[key] = String(parsed);
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

export function parseAdminLgaId(value: unknown): string | undefined | null {
  if (value == null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed === 'benchmark_gsy' || !(trimmed in LGA_CODE_MAP)) {
    return null;
  }

  return trimmed;
}
