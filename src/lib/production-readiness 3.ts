import type { RepositoryDriver } from '@/lib/repositories';

export interface ProductionPreflightCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface ProductionPreflightReport {
  checks: ProductionPreflightCheck[];
  failed: number;
  warned: number;
}

function resolveDriver(
  explicitValue: string | undefined,
  fallback: RepositoryDriver
): RepositoryDriver | 'invalid' {
  if (!explicitValue) {
    return fallback;
  }

  if (explicitValue === 'sqlite' || explicitValue === 'postgres') {
    return explicitValue;
  }

  return 'invalid';
}

export function evaluateProductionReadiness(env: NodeJS.ProcessEnv): ProductionPreflightReport {
  const checks: ProductionPreflightCheck[] = [];
  const dataDriver = resolveDriver(env.DATA_REPOSITORY_DRIVER?.trim(), 'sqlite');
  const projectsDriver = resolveDriver(
    env.PROJECTS_REPOSITORY_DRIVER?.trim(),
    dataDriver === 'invalid' ? 'sqlite' : dataDriver
  );
  const isProduction = env.NODE_ENV === 'production';

  if (dataDriver === 'invalid' || projectsDriver === 'invalid') {
    checks.push({
      name: 'repository-drivers',
      status: 'fail',
      message: 'Repository drivers must be either sqlite or postgres.',
    });
  } else if (isProduction && (dataDriver !== 'postgres' || projectsDriver !== 'postgres')) {
    checks.push({
      name: 'repository-drivers',
      status: 'fail',
      message: 'Production deployments should use postgres for both data and project repositories.',
    });
  } else {
    checks.push({
      name: 'repository-drivers',
      status: 'pass',
      message: `Data driver=${dataDriver}, projects driver=${projectsDriver}.`,
    });
  }

  if ((dataDriver === 'postgres' || projectsDriver === 'postgres') && !env.DATABASE_URL?.trim()) {
    checks.push({
      name: 'database-url',
      status: 'fail',
      message: 'DATABASE_URL is required when any postgres repository driver is enabled.',
    });
  } else {
    checks.push({
      name: 'database-url',
      status: 'pass',
      message: 'Database connection configuration is present for the selected drivers.',
    });
  }

  if (isProduction && env.AUTH_MODE !== 'proxy') {
    checks.push({
      name: 'auth-mode',
      status: 'fail',
      message: 'Production deployments should use AUTH_MODE=proxy behind a trusted identity proxy.',
    });
  } else {
    checks.push({
      name: 'auth-mode',
      status: 'pass',
      message: `AUTH_MODE=${env.AUTH_MODE?.trim() || '(default)'}.`,
    });
  }

  if (!env.ADMIN_KEY?.trim()) {
    checks.push({
      name: 'admin-key',
      status: 'fail',
      message: 'ADMIN_KEY must be configured for admin operations.',
    });
  } else {
    checks.push({
      name: 'admin-key',
      status: 'pass',
      message: 'ADMIN_KEY is configured.',
    });
  }

  if (isProduction && env.RUN_INLINE_REFRESH_WORKER === 'true') {
    checks.push({
      name: 'refresh-worker-mode',
      status: 'warn',
      message: 'RUN_INLINE_REFRESH_WORKER=true keeps job execution in the web process; prefer a dedicated worker.',
    });
  } else {
    checks.push({
      name: 'refresh-worker-mode',
      status: 'pass',
      message: 'Refresh jobs are configured for a dedicated worker or local development fallback.',
    });
  }

  if ((dataDriver === 'postgres' || projectsDriver === 'postgres') && !env.POSTGRES_SSL?.trim()) {
    checks.push({
      name: 'postgres-ssl',
      status: 'warn',
      message: 'POSTGRES_SSL is not set; confirm your managed database SSL requirements before cutover.',
    });
  } else {
    checks.push({
      name: 'postgres-ssl',
      status: 'pass',
      message: 'Postgres SSL configuration is explicit or not required for the selected drivers.',
    });
  }

  const failed = checks.filter((check) => check.status === 'fail').length;
  const warned = checks.filter((check) => check.status === 'warn').length;

  return { checks, failed, warned };
}
