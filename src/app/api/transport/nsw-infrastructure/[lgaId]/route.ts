import { NextRequest, NextResponse } from 'next/server';
import { getNSWInfrastructureForLGA, upsertNSWInfrastructure } from '@/lib/db';
import { getNSWInfrastructureLengths } from '@/lib/nsw-spatial-services';
import { LGA_CODE_MAP } from '@/lib/abs-fetchers';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';

const CACHE_DAYS = 30;

function isFresh(fetchedAt: string): boolean {
  return Date.now() - new Date(fetchedAt).getTime() < CACHE_DAYS * 24 * 60 * 60 * 1000;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { lgaId: string } }
) {
  const { lgaId } = params;
  const lgaCode = LGA_CODE_MAP[lgaId];
  if (!lgaCode) {
    return NextResponse.json({ error: 'Unknown LGA' }, { status: 404 });
  }

  // Check cache
  const cached = getNSWInfrastructureForLGA(lgaCode);
  if (cached.length > 0 && isFresh(cached[0].fetched_at)) {
    return NextResponse.json({ data: cached, cached: true });
  }

  // Fetch from NSW Spatial Services
  const area = SAMPLE_AREAS.find((a) => a.id === lgaId);
  const lgaName = area?.name ?? lgaId;
  const cleanName = lgaName.replace(/^City of\s+/i, '').replace(/^The\s+/i, '').trim();

  const fetched = await getNSWInfrastructureLengths(cleanName);
  for (const item of fetched) {
    upsertNSWInfrastructure({
      lga_code: lgaCode,
      feature_type: item.feature_type,
      total_length_km: item.total_length_km,
    });
  }

  const fresh = getNSWInfrastructureForLGA(lgaCode);
  return NextResponse.json({ data: fresh, cached: false });
}
