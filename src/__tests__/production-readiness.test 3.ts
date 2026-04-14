import { evaluateProductionReadiness } from '@/lib/production-readiness';

describe('production readiness preflight', () => {
  it('fails production configs that still point at sqlite', () => {
    const report = evaluateProductionReadiness({
      NODE_ENV: 'production',
      AUTH_MODE: 'proxy',
      ADMIN_KEY: 'secret',
      DATA_REPOSITORY_DRIVER: 'sqlite',
      PROJECTS_REPOSITORY_DRIVER: 'sqlite',
    });

    expect(report.failed).toBeGreaterThan(0);
    expect(report.checks.find((check) => check.name === 'repository-drivers')?.status).toBe('fail');
  });

  it('passes a postgres production configuration', () => {
    const report = evaluateProductionReadiness({
      NODE_ENV: 'production',
      AUTH_MODE: 'proxy',
      ADMIN_KEY: 'secret',
      DATA_REPOSITORY_DRIVER: 'postgres',
      PROJECTS_REPOSITORY_DRIVER: 'postgres',
      DATABASE_URL: 'postgres://example',
      POSTGRES_SSL: 'true',
    });

    expect(report.failed).toBe(0);
  });
});
