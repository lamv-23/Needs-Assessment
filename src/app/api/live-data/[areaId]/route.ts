import { NextRequest, NextResponse } from 'next/server';
import {
  getLiveDemographicsData,
  getLiveTransportData,
  getLiveEconomyData,
  getLiveEducationData,
  getLiveHousingData,
  getLiveGrowthData,
} from '@/lib/data/live-data';

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

  try {
    switch (domain) {
      case 'demographics':
        return NextResponse.json(getLiveDemographicsData(areaId, year));
      case 'transport':
        return NextResponse.json(getLiveTransportData(areaId, year));
      case 'economy':
        return NextResponse.json(getLiveEconomyData(areaId, year));
      case 'education':
        return NextResponse.json(getLiveEducationData(areaId, year));
      case 'housing':
        return NextResponse.json(getLiveHousingData(areaId, year));
      case 'growth':
        return NextResponse.json(getLiveGrowthData(areaId));
      default: {
        // Return all domains
        const [demo, transport, economy, education, housing, growth] = await Promise.all([
          Promise.resolve(getLiveDemographicsData(areaId, year)),
          Promise.resolve(getLiveTransportData(areaId, year)),
          Promise.resolve(getLiveEconomyData(areaId, year)),
          Promise.resolve(getLiveEducationData(areaId, year)),
          Promise.resolve(getLiveHousingData(areaId, year)),
          Promise.resolve(getLiveGrowthData(areaId)),
        ]);
        return NextResponse.json({ demographics: demo, transport, economy, education, housing, growth });
      }
    }
  } catch (err) {
    console.error(`[live-data API] Error for ${areaId}:`, err);
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  }
}
