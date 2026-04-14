import { evaluateProductionReadiness } from '../src/lib/production-readiness';

const report = evaluateProductionReadiness(process.env);

for (const check of report.checks) {
  const marker = check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARN' : 'FAIL';
  console.log(`[${marker}] ${check.name}: ${check.message}`);
}

console.log(
  `[SUMMARY] ${report.checks.length} checks, ${report.failed} failed, ${report.warned} warnings`
);

if (report.failed > 0) {
  process.exit(1);
}
