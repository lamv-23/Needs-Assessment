export type MaybePromise<T> = T | Promise<T>;

export interface CacheEntryRecord {
  dataJson: string;
  fetchedAt: string;
  year: number;
}

export interface TfnswCacheEntryRecord {
  dataJson: string;
  fetchedAt: string;
  dataYear: number;
}

export interface RefreshLogRecord {
  id: number;
  source: string;
  status: string;
  lgasUpdated: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface RefreshJobRecord {
  id: number;
  jobType: 'static' | 'abs' | 'all';
  status: 'queued' | 'running' | 'success' | 'error';
  requestedBy: string;
  lgaId: string | null;
  attemptCount: number;
  maxAttempts: number;
  lockToken: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RefreshJobSummary {
  queued: number;
  running: number;
  success: number;
  error: number;
}

export interface TransitStopRecord {
  stopId: string;
  stopName: string;
  lat: number;
  lng: number;
  mode: string;
  feed: string;
}

export interface LiveDataRepository {
  getABSCacheEntry(lgaCode: string, dataset: string): MaybePromise<CacheEntryRecord | undefined>;
  getTfNSWCacheEntry(lgaCode: string, dataset: string): MaybePromise<TfnswCacheEntryRecord | undefined>;
  getNSWProjection(lgaName: string, projectionType: string): MaybePromise<unknown | null>;
  getTransportStaticForLGA(
    lgaName: string
  ): MaybePromise<Array<{ year: number } & Record<string, unknown>>>;
}

export interface SeedWriteRepository {
  upsertABSCache(
    lgaCode: string,
    dataset: string,
    data: unknown,
    censusYear: number
  ): MaybePromise<void>;
  upsertTfNSWCache(
    lgaCode: string,
    dataset: string,
    data: unknown,
    dataYear: number
  ): MaybePromise<void>;
  upsertNSWProjection(lgaName: string, projectionType: string, data: unknown): MaybePromise<void>;
  upsertTransportStatic(lgaName: string, year: number, data: unknown): MaybePromise<void>;
}

export interface OperationsRepository {
  getABSCacheCount(): MaybePromise<number>;
  getNSWProjectionCount(): MaybePromise<number>;
  getAllConfig(): MaybePromise<Record<string, string>>;
  setConfigValue(key: string, value: string): MaybePromise<void>;
  getRecentRefreshLogs(limit?: number): MaybePromise<RefreshLogRecord[]>;
  startRefreshLog(source: string): MaybePromise<number>;
  completeRefreshLog(
    id: number,
    status: 'success' | 'error' | 'partial',
    lgasUpdated: number,
    errorMessage?: string
  ): MaybePromise<void>;
  enqueueRefreshJob(input: {
    jobType: 'static' | 'abs' | 'all';
    requestedBy: string;
    lgaId?: string | null;
    maxAttempts?: number;
  }): MaybePromise<RefreshJobRecord>;
  getRefreshJobSummary(): MaybePromise<RefreshJobSummary>;
  getRecentRefreshJobs(limit?: number): MaybePromise<RefreshJobRecord[]>;
  claimNextRefreshJob(lockToken: string): MaybePromise<RefreshJobRecord | null>;
  completeRefreshJob(
    id: number,
    lockToken: string,
    status: 'success' | 'error',
    errorMessage?: string
  ): MaybePromise<void>;
}

export interface TransitStopsRepository {
  queryStopsInBounds(
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number
  ): MaybePromise<TransitStopRecord[]>;
  clearStops(): MaybePromise<void>;
  upsertStopsBatch(stops: TransitStopRecord[]): MaybePromise<void>;
  getStopsCount(): MaybePromise<number>;
}
