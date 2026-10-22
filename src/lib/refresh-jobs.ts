import { randomUUID } from 'crypto';
import { getOperationsRepository } from '@/lib/repositories';
import { logServerError, logServerInfo } from '@/lib/server/logger';
import runSeed, { type SeedMode } from '@/lib/seed-runner';
import { OFFICIAL_TRANSPORT_LAST_SEED_KEY } from '@/lib/official-transport-seed';

let workerRunning = false;
const INLINE_WORKER_ENABLED = process.env.RUN_INLINE_REFRESH_WORKER === 'true'
  || process.env.NODE_ENV !== 'production';

export async function enqueueRefreshJob(input: {
  jobType: SeedMode;
  requestedBy: string;
  lgaId?: string | null;
}) {
  const operationsRepository = getOperationsRepository();
  const job = await operationsRepository.enqueueRefreshJob(input);
  logServerInfo('refresh_job_created', {
    jobId: job.id,
    jobType: job.jobType,
    requestedBy: job.requestedBy,
    lgaId: job.lgaId,
  });
  if (INLINE_WORKER_ENABLED) {
    void processRefreshQueue();
  }
  return job;
}

export async function processRefreshQueue(): Promise<void> {
  if (workerRunning) {
    return;
  }

  workerRunning = true;
  const operationsRepository = getOperationsRepository();

  try {
    while (true) {
      const lockToken = randomUUID();
      const job = await operationsRepository.claimNextRefreshJob(lockToken);

      if (!job) {
        break;
      }

      try {
        logServerInfo('refresh_job_started', {
          jobId: job.id,
          jobType: job.jobType,
          attemptCount: job.attemptCount,
          maxAttempts: job.maxAttempts,
          lgaId: job.lgaId,
        });
        await runSeed(job.jobType, job.lgaId ?? undefined);
        await operationsRepository.completeRefreshJob(job.id, lockToken, 'success');
        logServerInfo('refresh_job_completed', {
          jobId: job.id,
          status: 'success',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await operationsRepository.completeRefreshJob(job.id, lockToken, 'error', message);
        logServerError('refresh_job_failed', {
          jobId: job.id,
          attemptCount: job.attemptCount,
          maxAttempts: job.maxAttempts,
          error: message,
        });
      }
    }
  } finally {
    workerRunning = false;
  }
}

// ─── Scheduled refresh ───────────────────────────────────────────────────────
// When auto_refresh_enabled is 'true', the worker queues each refresh once its
// interval (days) has passed since the last successful run.

const SCHEDULES: Array<{ jobType: SeedMode; lastRefreshKey: string; intervalKey: string }> = [
  { jobType: 'abs', lastRefreshKey: 'abs_last_refresh', intervalKey: 'abs_refresh_interval_days' },
  { jobType: 'transport', lastRefreshKey: OFFICIAL_TRANSPORT_LAST_SEED_KEY, intervalKey: 'tfnsw_refresh_interval_days' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Job types due for a scheduled refresh, skipping any already queued or running. */
export function dueScheduledRefreshes(
  config: Record<string, string | undefined>,
  activeJobTypes: ReadonlySet<string>,
  now: Date,
): SeedMode[] {
  if (config.auto_refresh_enabled !== 'true') return [];

  return SCHEDULES.filter(({ jobType, lastRefreshKey, intervalKey }) => {
    if (activeJobTypes.has(jobType) || activeJobTypes.has('all')) return false;
    const intervalDays = Number(config[intervalKey]);
    const interval = (Number.isFinite(intervalDays) && intervalDays >= 1 ? intervalDays : 7) * DAY_MS;
    const last = Date.parse(config[lastRefreshKey] ?? '');
    return !Number.isFinite(last) || now.getTime() - last >= interval;
  }).map(({ jobType }) => jobType);
}

export async function enqueueDueScheduledRefreshes(now = new Date()): Promise<SeedMode[]> {
  const operationsRepository = getOperationsRepository();
  const [config, recentJobs] = await Promise.all([
    operationsRepository.getAllConfig(),
    operationsRepository.getRecentRefreshJobs(50),
  ]);
  const active = new Set(
    recentJobs.filter((job) => job.status === 'queued' || job.status === 'running').map((job) => job.jobType),
  );

  const due = dueScheduledRefreshes(config, active, now);
  for (const jobType of due) {
    const job = await operationsRepository.enqueueRefreshJob({ jobType, requestedBy: 'scheduler' });
    logServerInfo('refresh_job_scheduled', { jobId: job.id, jobType });
  }
  return due;
}

export async function startRefreshWorker(options?: {
  pollIntervalMs?: number;
  once?: boolean;
}): Promise<void> {
  const pollIntervalMs = options?.pollIntervalMs ?? 5000;
  logServerInfo('refresh_worker_started', {
    pollIntervalMs,
    once: Boolean(options?.once),
    inlineWorkerEnabled: INLINE_WORKER_ENABLED,
  });

  do {
    try {
      await enqueueDueScheduledRefreshes();
    } catch (error) {
      logServerError('refresh_schedule_check_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await processRefreshQueue();

    if (options?.once) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  } while (true);
}
