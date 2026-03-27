import { NextRequest, NextResponse } from 'next/server';
import {
  getDb,
  getABSCacheCount,
  getNSWProjectionCount,
  getAllConfig,
  getRecentRefreshLogs,
  setConfigValue,
} from '@/lib/db';

// ─── GET: Status ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') ?? req.headers.get('x-admin-key');
  if (!isAuthorized(key)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  void db;

  const [config, logs] = await Promise.all([
    Promise.resolve(getAllConfig()),
    Promise.resolve(getRecentRefreshLogs(20)),
  ]);

  return NextResponse.json({
    absCacheCount: getABSCacheCount(),
    nswProjectionCount: getNSWProjectionCount(),
    config,
    recentLogs: logs,
  });
}

// ─── POST: Trigger refresh or update config ───────────────────────────────────

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') ?? req.headers.get('x-admin-key');
  if (!isAuthorized(key)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = body.action as string;

  if (action === 'update_config') {
    const updates = body.updates as Record<string, string>;
    for (const [k, v] of Object.entries(updates)) {
      setConfigValue(k, v);
    }
    return NextResponse.json({ success: true, message: 'Config updated' });
  }

  if (action === 'seed_static') {
    // Run static seed in background (non-blocking for the response)
    void runStaticSeedBackground();
    return NextResponse.json({ success: true, message: 'Static seed started in background' });
  }

  if (action === 'seed_abs') {
    const lgaId = body.lgaId as string | undefined;
    void runABSSeedBackground(lgaId);
    return NextResponse.json({ success: true, message: lgaId ? `ABS seed started for ${lgaId}` : 'ABS seed started for all LGAs' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(key: string | null): boolean {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return false; // must set ADMIN_KEY to use admin features
  return key === adminKey;
}

// ─── Background runners ───────────────────────────────────────────────────────

async function runStaticSeedBackground(): Promise<void> {
  try {
    // Import inline to avoid bundling large data at startup
    const { default: runSeed } = await import('../../../../lib/seed-runner');
    await runSeed('static');
  } catch (err) {
    console.error('[Admin] Static seed failed:', err);
  }
}

async function runABSSeedBackground(lgaId?: string): Promise<void> {
  try {
    const { default: runSeed } = await import('../../../../lib/seed-runner');
    await runSeed('abs', lgaId);
  } catch (err) {
    console.error('[Admin] ABS seed failed:', err);
  }
}
