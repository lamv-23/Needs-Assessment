import { ensurePostgresAppSchema, getPostgresPool } from '@/lib/postgres';
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

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

const postgresLiveDataRepository: LiveDataRepository = {
  async getABSCacheEntry(lgaCode, dataset) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const result = await pool.query<{
      data_json: unknown;
      fetched_at: Date | string;
      census_year: number;
    }>(
      `SELECT data_json, fetched_at, census_year
       FROM abs_cache
       WHERE lga_code = $1 AND dataset = $2`,
      [lgaCode, dataset]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      dataJson: JSON.stringify(row.data_json),
      fetchedAt: toIsoString(row.fetched_at),
      year: row.census_year,
    } satisfies CacheEntryRecord;
  },
  async getTfNSWCacheEntry(lgaCode, dataset) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const result = await pool.query<{
      data_json: unknown;
      fetched_at: Date | string;
      data_year: number;
    }>(
      `SELECT data_json, fetched_at, data_year
       FROM tfnsw_cache
       WHERE lga_code = $1 AND dataset = $2`,
      [lgaCode, dataset]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      dataJson: JSON.stringify(row.data_json),
      fetchedAt: toIsoString(row.fetched_at),
      dataYear: row.data_year,
    } satisfies TfnswCacheEntryRecord;
  },
  async getNSWProjection(lgaName, projectionType) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const result = await pool.query<{ data_json: unknown }>(
      `SELECT data_json
       FROM nsw_projections
       WHERE lga_name = $1 AND projection_type = $2`,
      [lgaName, projectionType]
    );
    return result.rows[0]?.data_json ?? null;
  },
  async getTransportStaticForLGA(lgaName) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const result = await pool.query<{ year: number; data_json: Record<string, unknown> }>(
      `SELECT year, data_json
       FROM transport_static
       WHERE lga_name = $1
       ORDER BY year`,
      [lgaName]
    );
    return result.rows.map((row) => ({ year: row.year, ...row.data_json }));
  },
};

const postgresSeedWriteRepository: SeedWriteRepository = {
  async upsertABSCache(lgaCode, dataset, data, censusYear) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO abs_cache (lga_code, dataset, data_json, census_year, fetched_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW())
       ON CONFLICT (lga_code, dataset) DO UPDATE SET
         data_json = EXCLUDED.data_json,
         census_year = EXCLUDED.census_year,
         fetched_at = NOW()`,
      [lgaCode, dataset, JSON.stringify(data), censusYear]
    );
  },
  async upsertTfNSWCache(lgaCode, dataset, data, dataYear) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO tfnsw_cache (lga_code, dataset, data_json, data_year, fetched_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW())
       ON CONFLICT (lga_code, dataset) DO UPDATE SET
         data_json = EXCLUDED.data_json,
         data_year = EXCLUDED.data_year,
         fetched_at = NOW()`,
      [lgaCode, dataset, JSON.stringify(data), dataYear]
    );
  },
  async upsertNSWProjection(lgaName, projectionType, data) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO nsw_projections (lga_name, projection_type, data_json, uploaded_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (lga_name, projection_type) DO UPDATE SET
         data_json = EXCLUDED.data_json,
         uploaded_at = NOW()`,
      [lgaName, projectionType, JSON.stringify(data)]
    );
  },
  async upsertTransportStatic(lgaName, year, data) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO transport_static (lga_name, year, data_json, seeded_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (lga_name, year) DO UPDATE SET
         data_json = EXCLUDED.data_json,
         seeded_at = NOW()`,
      [lgaName, year, JSON.stringify(data)]
    );
  },
};

const postgresOperationsRepository: OperationsRepository = {
  async getABSCacheCount() {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(DISTINCT lga_code) AS count FROM abs_cache'
    );
    return Number(result.rows[0]?.count ?? 0);
  },
  async getNSWProjectionCount() {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM nsw_projections'
    );
    return Number(result.rows[0]?.count ?? 0);
  },
  async getAllConfig() {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const result = await pool.query<{ key: string; value: string }>(
      'SELECT key, value FROM refresh_config'
    );
    return Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
  },
  async setConfigValue(key, value) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO refresh_config (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         updated_at = NOW()`,
      [key, value]
    );
  },
  async getRecentRefreshLogs(limit = 10) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const result = await pool.query<{
      id: string;
      source: string;
      status: string;
      lgas_updated: number;
      error_message: string | null;
      started_at: Date | string;
      completed_at: Date | string | null;
    }>(
      `SELECT id, source, status, lgas_updated, error_message, started_at, completed_at
       FROM refresh_log
       ORDER BY started_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      source: row.source,
      status: row.status,
      lgasUpdated: row.lgas_updated,
      errorMessage: row.error_message,
      startedAt: toIsoString(row.started_at),
      completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
    } satisfies RefreshLogRecord));
  },
  async startRefreshLog(source) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const result = await pool.query<{ id: string }>(
      `INSERT INTO refresh_log (source, status, started_at)
       VALUES ($1, 'running', NOW())
       RETURNING id`,
      [source]
    );
    return Number(result.rows[0].id);
  },
  async completeRefreshLog(id, status, lgasUpdated, errorMessage) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    await pool.query(
      `UPDATE refresh_log
       SET status = $1,
           lgas_updated = $2,
           error_message = $3,
           completed_at = NOW()
       WHERE id = $4`,
      [status, lgasUpdated, errorMessage ?? null, id]
    );
  },
  async enqueueRefreshJob(input) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const result = await pool.query<{
      id: string;
      job_type: 'static' | 'abs' | 'all';
      status: 'queued' | 'running' | 'success' | 'error';
      requested_by: string;
      lga_id: string | null;
      attempt_count: number;
      max_attempts: number;
      lock_token: string | null;
      started_at: Date | string | null;
      completed_at: Date | string | null;
      error_message: string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `INSERT INTO refresh_jobs (
         job_type,
         status,
         requested_by,
         lga_id,
         attempt_count,
         max_attempts,
         created_at,
         updated_at
       )
       VALUES ($1, 'queued', $2, $3, 0, $4, NOW(), NOW())
       RETURNING *`,
      [input.jobType, input.requestedBy, input.lgaId ?? null, input.maxAttempts ?? 3]
    );
    const row = result.rows[0];
    return {
      id: Number(row.id),
      jobType: row.job_type,
      status: row.status,
      requestedBy: row.requested_by,
      lgaId: row.lga_id,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      lockToken: row.lock_token,
      startedAt: row.started_at ? toIsoString(row.started_at) : null,
      completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
      errorMessage: row.error_message,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    } satisfies RefreshJobRecord;
  },
  async getRecentRefreshJobs(limit = 10) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const result = await pool.query<{
      id: string;
      job_type: 'static' | 'abs' | 'all';
      status: 'queued' | 'running' | 'success' | 'error';
      requested_by: string;
      lga_id: string | null;
      attempt_count: number;
      max_attempts: number;
      lock_token: string | null;
      started_at: Date | string | null;
      completed_at: Date | string | null;
      error_message: string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `SELECT *
       FROM refresh_jobs
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      jobType: row.job_type,
      status: row.status,
      requestedBy: row.requested_by,
      lgaId: row.lga_id,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      lockToken: row.lock_token,
      startedAt: row.started_at ? toIsoString(row.started_at) : null,
      completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
      errorMessage: row.error_message,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    } satisfies RefreshJobRecord));
  },
  async getRefreshJobSummary() {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const result = await pool.query<{
      status: 'queued' | 'running' | 'success' | 'error';
      total: string;
    }>(
      `SELECT status, COUNT(*)::text AS total
       FROM refresh_jobs
       GROUP BY status`
    );

    return result.rows.reduce<RefreshJobSummary>(
      (summary, row) => ({
        ...summary,
        [row.status]: Number(row.total),
      }),
      { queued: 0, running: 0, success: 0, error: 0 }
    );
  },
  async claimNextRefreshJob(lockToken) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const result = await pool.query<{
      id: string;
      job_type: 'static' | 'abs' | 'all';
      status: 'queued' | 'running' | 'success' | 'error';
      requested_by: string;
      lga_id: string | null;
      attempt_count: number;
      max_attempts: number;
      lock_token: string | null;
      started_at: Date | string | null;
      completed_at: Date | string | null;
      error_message: string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `WITH next_job AS (
         SELECT id
         FROM refresh_jobs
         WHERE status = 'queued'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
        UPDATE refresh_jobs
        SET status = 'running',
           attempt_count = attempt_count + 1,
           lock_token = $1,
           started_at = NOW(),
           completed_at = NULL,
           updated_at = NOW(),
           error_message = NULL
       WHERE id IN (SELECT id FROM next_job)
       RETURNING *`,
      [lockToken]
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      jobType: row.job_type,
      status: row.status,
      requestedBy: row.requested_by,
      lgaId: row.lga_id,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      lockToken: row.lock_token,
      startedAt: row.started_at ? toIsoString(row.started_at) : null,
      completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
      errorMessage: row.error_message,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    } satisfies RefreshJobRecord;
  },
  async completeRefreshJob(id, lockToken, status, errorMessage) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const currentResult = await pool.query<{
      attempt_count: number;
      max_attempts: number;
    }>(
      `SELECT attempt_count, max_attempts
       FROM refresh_jobs
       WHERE id = $1 AND lock_token = $2`,
      [id, lockToken]
    );
    const current = currentResult.rows[0];
    if (!current) {
      return;
    }

    if (status === 'error' && current.attempt_count < current.max_attempts) {
      await pool.query(
        `UPDATE refresh_jobs
         SET status = 'queued',
             lock_token = NULL,
             started_at = NULL,
             completed_at = NULL,
             error_message = $1,
             updated_at = NOW()
         WHERE id = $2 AND lock_token = $3`,
        [errorMessage ?? null, id, lockToken]
      );
      return;
    }

    await pool.query(
      `UPDATE refresh_jobs
       SET status = $1,
           error_message = $2,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $3 AND lock_token = $4`,
      [status, errorMessage ?? null, id, lockToken]
    );
  },
};

const postgresTransitStopsRepository: TransitStopsRepository = {
  async queryStopsInBounds(minLat, maxLat, minLng, maxLng) {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const result = await pool.query<{
      stop_id: string;
      stop_name: string;
      lat: number;
      lng: number;
      mode: string;
      feed: string;
    }>(
      `SELECT stop_id, stop_name, lat, lng, mode, feed
       FROM gtfs_stops
       WHERE lat >= $1 AND lat <= $2 AND lng >= $3 AND lng <= $4`,
      [minLat, maxLat, minLng, maxLng]
    );
    return result.rows.map((row) => ({
      stopId: row.stop_id,
      stopName: row.stop_name,
      lat: row.lat,
      lng: row.lng,
      mode: row.mode,
      feed: row.feed,
    } satisfies TransitStopRecord));
  },
  async clearStops() {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    await pool.query('DELETE FROM gtfs_stops');
  },
  async upsertStopsBatch(stops) {
    if (stops.length === 0) return;
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const stop of stops) {
        await client.query(
          `INSERT INTO gtfs_stops (stop_id, stop_name, lat, lng, mode, feed)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (stop_id) DO UPDATE SET
             stop_name = EXCLUDED.stop_name,
             lat = EXCLUDED.lat,
             lng = EXCLUDED.lng,
             mode = EXCLUDED.mode,
             feed = EXCLUDED.feed`,
          [stop.stopId, stop.stopName, stop.lat, stop.lng, stop.mode, stop.feed]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
  async getStopsCount() {
    await ensurePostgresAppSchema();
    const pool = getPostgresPool();
    const result = await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM gtfs_stops');
    return Number(result.rows[0]?.count ?? 0);
  },
};

export function getLiveDataRepository(): LiveDataRepository {
  return postgresLiveDataRepository;
}

export function getSeedWriteRepository(): SeedWriteRepository {
  return postgresSeedWriteRepository;
}

export function getOperationsRepository(): OperationsRepository {
  return postgresOperationsRepository;
}

export function getTransitStopsRepository(): TransitStopsRepository {
  return postgresTransitStopsRepository;
}
