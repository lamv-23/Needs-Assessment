import type {
  LiveDataRepository,
  OperationsRepository,
  SeedWriteRepository,
  TransitStopsRepository,
} from './contracts';
import type { ProjectsRepository } from './projects-sqlite';
import {
  getLiveDataRepository as getPostgresLiveDataRepository,
  getOperationsRepository as getPostgresOperationsRepository,
  getSeedWriteRepository as getPostgresSeedWriteRepository,
  getTransitStopsRepository as getPostgresTransitStopsRepository,
} from './postgres';
import { getProjectsRepository as getPostgresProjectsRepository } from './projects-postgres';
import {
  getLiveDataRepository as getSqliteLiveDataRepository,
  getOperationsRepository as getSqliteOperationsRepository,
  getSeedWriteRepository as getSqliteSeedWriteRepository,
  getTransitStopsRepository as getSqliteTransitStopsRepository,
} from './sqlite';
import { getProjectsRepository as getSqliteProjectsRepository } from './projects-sqlite';

export type RepositoryDriver = 'sqlite' | 'postgres';

function getRepositoryDriver(): RepositoryDriver {
  const configured = process.env.DATA_REPOSITORY_DRIVER?.trim();
  if (!configured) return 'sqlite';
  if (configured === 'sqlite' || configured === 'postgres') return configured;
  throw new Error(`Unsupported DATA_REPOSITORY_DRIVER: ${configured}`);
}

function getProjectsRepositoryDriver(): RepositoryDriver {
  const configured = process.env.PROJECTS_REPOSITORY_DRIVER?.trim();
  if (!configured) return getRepositoryDriver();
  if (configured === 'sqlite' || configured === 'postgres') return configured;
  throw new Error(`Unsupported PROJECTS_REPOSITORY_DRIVER: ${configured}`);
}

function unsupportedPostgresRepository(message: string): never {
  throw new Error(
    `${message} Postgres repositories are not configured yet; keep DATA_REPOSITORY_DRIVER=sqlite for now.`
  );
}

export function getLiveDataRepository(): LiveDataRepository {
  switch (getRepositoryDriver()) {
    case 'sqlite':
      return getSqliteLiveDataRepository();
    case 'postgres':
      return getPostgresLiveDataRepository();
  }
}

export function getSeedWriteRepository(): SeedWriteRepository {
  switch (getRepositoryDriver()) {
    case 'sqlite':
      return getSqliteSeedWriteRepository();
    case 'postgres':
      return getPostgresSeedWriteRepository();
  }
}

export function getOperationsRepository(): OperationsRepository {
  switch (getRepositoryDriver()) {
    case 'sqlite':
      return getSqliteOperationsRepository();
    case 'postgres':
      return getPostgresOperationsRepository();
  }
}

export function getTransitStopsRepository(): TransitStopsRepository {
  switch (getRepositoryDriver()) {
    case 'sqlite':
      return getSqliteTransitStopsRepository();
    case 'postgres':
      return getPostgresTransitStopsRepository();
  }
}

export function getProjectsRepository(): ProjectsRepository {
  switch (getProjectsRepositoryDriver()) {
    case 'sqlite':
      return getSqliteProjectsRepository();
    case 'postgres':
      return getPostgresProjectsRepository();
  }
}
