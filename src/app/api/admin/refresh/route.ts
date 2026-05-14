import { NextRequest, NextResponse } from 'next/server';
import {
  parseAdminAction,
  parseAdminConfigUpdates,
  parseAdminLgaId,
} from '@/lib/api/admin-api';
import { getRequestUserIdentity } from '@/lib/auth/dev-session';
import { enqueueRefreshJob } from '@/lib/refresh-jobs';
import { getOperationsRepository } from '@/lib/repositories';
import { logServerError, logServerInfo, logServerWarn } from '@/lib/server/logger';
import { getABSDatasetCoverage } from '@/lib/db';

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function resolveAdminRequestContext(req: NextRequest): Promise<{
  authorized: boolean;
  requestedBy: string | null;
}> {
  const key = req.nextUrl.searchParams.get('key') ?? req.headers.get('x-admin-key');
  if (isAuthorizedByKey(key)) {
    try {
      const identity = await getRequestUserIdentity(req);
      if (identity.role === 'admin') {
        return { authorized: true, requestedBy: identity.userId };
      }
    } catch {}
    return { authorized: true, requestedBy: 'admin-key' };
  }

  try {
    const identity = await getRequestUserIdentity(req);
    return {
      authorized: identity.role === 'admin',
      requestedBy: identity.role === 'admin' ? identity.userId : null,
    };
  } catch {
    return { authorized: false, requestedBy: null };
  }
}

export async function GET(req: NextRequest) {
  const operationsRepository = getOperationsRepository();
  const auth = await resolveAdminRequestContext(req);
  if (!auth.authorized) {
    logServerWarn('admin_refresh_unauthorized', {
      method: 'GET',
      path: '/api/admin/refresh',
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [config, logs, recentJobs, absCacheCount, nswProjectionCount, jobSummary, datasetCoverage] = await Promise.all([
    operationsRepository.getAllConfig(),
    operationsRepository.getRecentRefreshLogs(20),
    operationsRepository.getRecentRefreshJobs(20),
    operationsRepository.getABSCacheCount(),
    operationsRepository.getNSWProjectionCount(),
    operationsRepository.getRefreshJobSummary(),
    Promise.resolve(getABSDatasetCoverage()),
  ]);

  return NextResponse.json({
    absCacheCount,
    nswProjectionCount,
    config,
    recentLogs: logs,
    recentJobs,
    jobSummary,
    datasetCoverage,
  });
}

// ─── POST: Trigger refresh or update config ───────────────────────────────────

export async function POST(req: NextRequest) {
  const operationsRepository = getOperationsRepository();
  const auth = await resolveAdminRequestContext(req);
  if (!auth.authorized) {
    logServerWarn('admin_refresh_unauthorized', {
      method: 'POST',
      path: '/api/admin/refresh',
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = parseAdminAction(body.action);

  if (!action) {
    return badRequest('A valid admin action is required.');
  }

  if (action === 'update_config') {
    const updates = parseAdminConfigUpdates(body.updates);
    if (!updates || Object.keys(updates).length === 0) {
      return badRequest('Config updates must be a non-empty string map.');
    }
    for (const [k, v] of Object.entries(updates)) {
      await operationsRepository.setConfigValue(k, v);
    }
    logServerInfo('admin_config_updated', {
      requestedBy: auth.requestedBy,
      keys: Object.keys(updates),
    });
    return NextResponse.json({ success: true, message: 'Config updated' });
  }

  if (action === 'seed_static') {
    const job = await enqueueRefreshJob({
      jobType: 'static',
      requestedBy: auth.requestedBy ?? 'admin',
    });
    logServerInfo('refresh_job_enqueued', {
      requestedBy: auth.requestedBy,
      jobType: job.jobType,
      jobId: job.id,
    });
    return NextResponse.json({
      success: true,
      message: 'Static seed queued',
      job,
    });
  }

  if (action === 'seed_abs') {
    const lgaId = parseAdminLgaId(body.lgaId);
    if (lgaId === null) {
      return badRequest('A valid LGA ID is required when filtering ABS refresh jobs.');
    }
    const job = await enqueueRefreshJob({
      jobType: 'abs',
      requestedBy: auth.requestedBy ?? 'admin',
      lgaId,
    });
    logServerInfo('refresh_job_enqueued', {
      requestedBy: auth.requestedBy,
      jobType: job.jobType,
      jobId: job.id,
      lgaId: job.lgaId,
    });
    return NextResponse.json({
      success: true,
      message: lgaId ? `ABS seed queued for ${lgaId}` : 'ABS seed queued for all LGAs',
      job,
    });
  }

  logServerError('admin_refresh_unknown_action', {
    requestedBy: auth.requestedBy,
    action,
  });
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

function isAuthorizedByKey(key: string | null): boolean {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return false;
  return key === adminKey;
}
