import { NextRequest, NextResponse } from 'next/server';
import {
  getLiveDemographicsData,
  getLiveTransportData,
  getLiveEconomyData,
  getLiveEducationData,
  getLiveHousingData,
  getLiveGrowthData,
} from '@/lib/data/live-data';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';
import { logServerError, logServerWarn } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';
// 1-hour ISR cache — data only changes when admin runs seed
export const revalidate = 3600;

export async function GET(
  _req: NextRequest,
  { params }: { params: { areaId: string } }
) {
  const { areaId } = params;
  const year = parseInt(_req.nextUrl.searchParams.get('year') ?? '2021', 10);
  const domain = _req.nextUrl.searchParams.get('domain');
  const validDomains = new Set(['demographics', 'transport', 'economy', 'education', 'housing', 'growth']);
  const validAreaIds = new Set(SAMPLE_AREAS.map((area) => area.id));

  if (!validAreaIds.has(areaId)) {
    return NextResponse.json({ error: 'Unknown area' }, { status: 404 });
  }

  if (!Number.isInteger(year) || year < 2001 || year > 2066) {
    return NextResponse.json({ error: 'Year must be between 2001 and 2066.' }, { status: 400 });
  }

  if (domain && !validDomains.has(domain)) {
    logServerWarn('live_data_invalid_domain', { areaId, domain });
    return NextResponse.json({ error: 'Unsupported domain.' }, { status: 400 });
  }

  try {
    switch (domain) {
      case 'demographics':
        return NextResponse.json(await getLiveDemographicsData(areaId, year));
      case 'transport':
        return NextResponse.json(await getLiveTransportData(areaId, year));
      case 'economy':
        return NextResponse.json(await getLiveEconomyData(areaId, year));
      case 'education':
        return NextResponse.json(await getLiveEducationData(areaId, year));
      case 'housing':
        return NextResponse.json(await getLiveHousingData(areaId, year));
      case 'growth':
        return NextResponse.json(await getLiveGrowthData(areaId));
      default: {
        // Return all domains
        const [demo, transport, economy, education, housing, growth] = await Promise.all([
          getLiveDemographicsData(areaId, year),
          getLiveTransportData(areaId, year),
          getLiveEconomyData(areaId, year),
          getLiveEducationData(areaId, year),
          getLiveHousingData(areaId, year),
          getLiveGrowthData(areaId),
        ]);
        return NextResponse.json({ demographics: demo, transport, economy, education, housing, growth });
      }
    }
  } catch (err) {
    logServerError('live_data_request_failed', {
      areaId,
      domain: domain ?? 'all',
      year,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  }
}
