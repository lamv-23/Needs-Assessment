import { NextResponse } from 'next/server';
import { getOperationsRepository } from '@/lib/repositories';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ops = getOperationsRepository();
  const config = await ops.getAllConfig();

  const absLastRefresh = config['abs_last_refresh'] ?? null;
  const staticLastSeed = config['static_last_seed'] ?? null;
  const tfnswLastRefresh = config['tfnsw_last_refresh'] ?? null;
  const snapshotTag = config['data_snapshot_tag'] ?? null;

  const effectiveDate = [absLastRefresh, staticLastSeed, tfnswLastRefresh]
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  return NextResponse.json({
    absLastRefresh,
    staticLastSeed,
    tfnswLastRefresh,
    effectiveDate,
    snapshotTag,
  });
}