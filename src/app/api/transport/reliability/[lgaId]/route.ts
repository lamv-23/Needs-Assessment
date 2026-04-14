import { NextRequest, NextResponse } from 'next/server';
import { getLatestReliabilityWeek, getReliabilityForLGA } from '@/lib/db';
import { LGA_CODE_MAP } from '@/lib/abs-fetchers';

export async function GET(
  _req: NextRequest,
  { params }: { params: { lgaId: string } }
) {
  const { lgaId } = params;
  const lgaCode = LGA_CODE_MAP[lgaId];
  if (!lgaCode) {
    return NextResponse.json({ error: 'Unknown LGA' }, { status: 404 });
  }

  const latestWeek = getLatestReliabilityWeek(lgaCode);
  if (!latestWeek) {
    return NextResponse.json({
      data: [],
      note: 'No reliability data available. Run npm run seed:reliability to populate.',
    });
  }

  const rows = getReliabilityForLGA(lgaCode, latestWeek);
  return NextResponse.json({ data: rows, weekStart: latestWeek });
}
