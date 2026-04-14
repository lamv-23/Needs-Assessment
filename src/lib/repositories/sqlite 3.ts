import {
  clearGtfsStops,
  getDb,
  completeRefreshLog,
  getABSCacheCount,
  getABSCacheEntry,
  getAllConfig,
  getGtfsStopsCount,
  getNSWProjection,
  getNSWProjectionCount,
  getRecentRefreshLogs,
  getTfNSWCacheEntry,
  getTransportStaticForLGA,
  queryGtfsStopsInBounds,
  setConfigValue,
  startRefreshLog,
  upsertABSCache,
  upsertGtfsStopsBatch,
  upsertNSWProjection,
  upsertTfNSWCache,
  upsertTransportStatic,
  type GtfsStop,
} from '@/lib/db';
import type {
  CacheEntryRecord,
  LiveDataRepository,
  OperationsRepository,
  RefreshLogRecord,
  RefreshJobRecord,
  RefreshJobSummary,
  SeedWriteRepository,
  TfnswCacheEntryRecord,
  TransitStopRecord,
  TransitStopsRepository,
} from './contracts';

function mapRefreshLog(log: ReturnType<typeof getRecentRefreshLogs>[number]): RefreshLogRecord {
  return {
    id: log.id,
    source: log.source,
    status: log.status,
    lgasUpdated: log.lgas_updated,
    errorMessage: log.error_message,
    startedAt: log.started_at,
    completedAt: log.completed_at,
  };
}

function mapRefreshJob(
  row: {
    id: number;
    job_type: 'static' | 'abs' | 'all';
    status: 'queued' | 'running' | 'success' | 'error';
    requested_by: string;
    lga_id: string | null;
    attempt_count: number;
    max_attempts: number;
    lock_token: string | null;
    started_at: string | null;
    completed_at: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
  }
): RefreshJobRecord {
  return {
    id: row.id,
    jobType: row.job_type,
    status: row.status,
    requestedBy: row.requested_by,
    lgaId: row.lga_id,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    lockToken: row.lock_token,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTransitStop(stop: GtfsStop): TransitStopRecord {
  return {
    stopId: stop.stop_id,
    stopName: stop.stop_name,
    lat: stop.lat,
    lng: stop.lng,
    mode: stop.mode,
    feed: stop.feed,
  };
}

function mapTransitStopsToDb(stops: TransitStopRecord[]): GtfsStop[] {
  return stops.map((stop) => ({
    stop_id: stop.stopId,
    stop_name: stop.stopName,
    lat: stop.lat,
    lng: stop.lng,
    mode: stop.mode,
    feed: stop.feed,
  }));
}

const sqliteLiveDataRepository: LiveDataRepository = {
  getABSCacheEntry(lgaCode, dataset) {
    const row = getABSCacheEntry(lgaCode, dataset);
    if (!row) return undefined;
    return {
      dataJson: row.data_json,
      fetchedAt: row.fetched_at,
      year: row.census_year,
    } satisfies CacheEntryRecord;
  },
  getTfNSWCacheEntry(lgaCode, dataset) {
    const row = getTfNSWCacheEntry(lgaCode, dataset);
    if (!row) return undefined;
    return {
      dataJson: row.data_json,
      fetchedAt: row.fetched_at,
      dataYear: row.data_year,
    } satisfies TfnswCacheEntryRecord;
  },
  getNSWProjection,
  getTransportStaticForLGA,
};

const sqliteSeedWriteRepository: SeedWriteRepository = {
  upsertABSCache,
  upsertTfNSWCache,
  upsertNSWProjection,
  upsertTransportStatic,
};

const sqliteOperationsRepository: OperationsRepository = {
  getABSCacheCount,
  getNSWProjectionCount,
  getAllConfig,
  setConfigValue,
  getRecentRefreshLogs(limit = 10) {
    return getRecentRefreshLogs(limit).map(mapRefreshLog);
  },
  startRefreshLog,
  completeRefreshLog,
  enqueueRefreshJob(input) {
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO refresh_jobs (
        job_type,
        status,
        requested_by,
        lga_id,
        attempt_count,
        max_attempts,
        created_at,
        updated_at
      )
      VALUES (?, 'queued', ?, ?, 0, ?, datetime('now'), datetime('now'))
    `).run(input.jobType, input.requestedBy, input.lgaId ?? null, input.maxAttempts ?? 3);

    const row = db.prepare(`
      SELECT *
      FROM refresh_jobs
      WHERE id = ?
    `).get(result.lastInsertRowid) as {
      id: number;
      job_type: 'static' | 'abs' | 'all';
      status: 'queued' | 'running' | 'success' | 'error';
      requested_by: string;
      lga_id: string | null;
      attempt_count: number;
      max_attempts: number;
      lock_token: string | null;
      started_at: string | null;
      completed_at: string | null;
      error_message: string | null;
      created_at: string;
      updated_at: string;
    };

    return mapRefreshJob(row);
  },
  getRecentRefreshJobs(limit = 10) {
    const db = getDb();
    const rows = db.prepare(`
      SELECT *
      FROM refresh_jobs
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as Array<{
      id: number;
      job_type: 'static' | 'abs' | 'all';
      status: 'queued' | 'running' | 'success' | 'error';
      requested_by: string;
      lga_id: string | null;
      attempt_count: number;
      max_attempts: number;
      lock_token: string | null;
      started_at: string | null;
      completed_at: string | null;
      error_message: string | null;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map(mapRefreshJob);
  },
  getRefreshJobSummary() {
    const db = getDb();
    const rows = db.prepare(`
      SELECT status, COUNT(*) AS total
      FROM refresh_jobs
      GROUP BY status
    `).all() as Array<{ status: 'queued' | 'running' | 'success' | 'error'; total: number }>;

    return rows.reduce<RefreshJobSummary>(
      (summary, row) => ({
        ...summary,
        [row.status]: row.total,
      }),
      { queued: 0, running: 0, success: 0, error: 0 }
    );
  },
  claimNextRefreshJob(lockToken) {
    const db = getDb();
    const claim = db.transaction(() => {
      const next = db.prepare(`
        SELECT *
        FROM refresh_jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
      `).get() as {
        id: number;
        job_type: 'static' | 'abs' | 'all';
        status: 'queued' | 'running' | 'success' | 'error';
        requested_by: string;
        lga_id: string | null;
        attempt_count: number;
        max_attempts: number;
        lock_token: string | null;
        started_at: string | null;
        completed_at: string | null;
        error_message: string | null;
        created_at: string;
        updated_at: string;
      } | undefined;

      if (!next) {
        return null;
      }

      db.prepare(`
        UPDATE refresh_jobs
        SET status = 'running',
            attempt_count = attempt_count + 1,
            lock_token = ?,
            started_at = datetime('now'),
            completed_at = NULL,
            updated_at = datetime('now'),
            error_message = NULL
        WHERE id = ?
      `).run(lockToken, next.id);

      const claimed = db.prepare(`
        SELECT *
        FROM refresh_jobs
        WHERE id = ?
      `).get(next.id) as {
        id: number;
        job_type: 'static' | 'abs' | 'all';
        status: 'queued' | 'running' | 'success' | 'error';
        requested_by: string;
        lga_id: string | null;
        attempt_count: number;
        max_attempts: number;
        lock_token: string | null;
        started_at: string | null;
        completed_at: string | null;
        error_message: string | null;
        created_at: string;
        updated_at: string;
      };

      return mapRefreshJob(claimed);
    });

    return claim();
  },
  completeRefreshJob(id, lockToken, status, errorMessage) {
    const db = getDb();
    const current = db.prepare(`
      SELECT attempt_count, max_attempts
      FROM refresh_jobs
      WHERE id = ? AND lock_token = ?
    `).get(id, lockToken) as { attempt_count: number; max_attempts: number } | undefined;

    if (!current) {
      return;
    }

    if (status === 'error' && current.attempt_count < current.max_attempts) {
      db.prepare(`
        UPDATE refresh_jobs
        SET status = 'queued',
            lock_token = NULL,
            started_at = NULL,
            completed_at = NULL,
            error_message = ?,
            updated_at = datetime('now')
        WHERE id = ? AND lock_token = ?
      `).run(errorMessage ?? null, id, lockToken);
      return;
    }

    db.prepare(`
      UPDATE refresh_jobs
      SET status = ?,
          error_message = ?,
          completed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ? AND lock_token = ?
    `).run(status, errorMessage ?? null, id, lockToken);
  },
};

const sqliteTransitStopsRepository: TransitStopsRepository = {
  queryStopsInBounds(minLat, maxLat, minLng, maxLng) {
    return queryGtfsStopsInBounds(minLat, maxLat, minLng, maxLng).map(mapTransitStop);
  },
  clearStops() {
    clearGtfsStops();
  },
  upsertStopsBatch(stops) {
    upsertGtfsStopsBatch(mapTransitStopsToDb(stops));
  },
  getStopsCount() {
    return getGtfsStopsCount();
  },
};

export function getLiveDataRepository(): LiveDataRepository {
  return sqliteLiveDataRepository;
}

export function getSeedWriteRepository(): SeedWriteRepository {
  return sqliteSeedWriteRepository;
}

export function getOperationsRepository(): OperationsRepository {
  return sqliteOperationsRepository;
}

export function getTransitStopsRepository(): TransitStopsRepository {
  return sqliteTransitStopsRepository;
}
