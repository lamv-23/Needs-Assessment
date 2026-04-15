import { startRefreshWorker } from '../src/lib/refresh-jobs';

const pollIntervalMs = Number(process.env.REFRESH_WORKER_POLL_MS ?? '5000');
const once = process.argv.includes('--once');

if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 1000) {
  throw new Error('REFRESH_WORKER_POLL_MS must be a number greater than or equal to 1000.');
}

void startRefreshWorker({ pollIntervalMs, once }).catch((error) => {
  console.error('[RefreshWorker] Worker failed:', error);
  process.exit(1);
});
