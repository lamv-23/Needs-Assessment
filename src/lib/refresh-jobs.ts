import { randomUUID } from 'crypto';
import { getOperationsRepository } from '@/lib/repositories';
import { logServerError, logServerInfo } from '@/lib/server/logger';
import runSeed, { type SeedMode } from '@/lib/seed-runner';

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
    await processRefreshQueue();

    if (options?.once) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  } while (true);
}
