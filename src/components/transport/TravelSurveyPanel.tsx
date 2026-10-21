'use client';

import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsBarChart from '@/components/charts/BarChart';
import NeedsLineChart from '@/components/charts/LineChart';
import { formatNumber, formatPercent, CHART_COLORS } from '@/lib/utils';
import type { TransportData } from '@/lib/data/sample-data';
import type { HTSReliability } from '@/lib/hts-parser';

interface Props {
  areaName: string;
  travelSurvey: TransportData['travelSurvey'];
}

const FLAG: Record<HTSReliability, string> = { ok: '', caution: '*', unreliable: '**' };

/** All-purpose weekday travel from the TfNSW Household Travel Survey. */
export default function TravelSurveyPanel({ areaName, travelSurvey }: Props) {
  if (!travelSurvey) {
    return (
      <ChartWrapper
        title="All Weekday Travel (Household Travel Survey)"
        subtitle="Every trip residents make on an average weekday, not just the journey to work"
        className="lg:col-span-2"
      >
        <div className="flex items-center justify-center h-32 text-sm text-slate-400 text-center px-6">
          The TfNSW Household Travel Survey only publishes LGA estimates for Greater Sydney, the Central Coast,
          Hunter and Illawarra, so it does not cover {areaName}.
        </div>
      </ChartWrapper>
    );
  }

  const { latestYear, modes, purposes, modeShareTrend, tripsPerPerson, lgaTotalReliable } = travelSurvey;
  const share = (...keys: string[]) => modes.filter(m => keys.includes(m.mode)).reduce((s, m) => s + m.modeShare, 0);
  const modeData = modes.map(m => ({ name: `${m.label}${FLAG[m.reliability]}`, 'Share of trips (%)': m.modeShare }));
  const purposeData = purposes.map(p => ({ name: `${p.purpose}${FLAG[p.reliability]}`, 'Share of journeys (%)': p.share }));
  const trendData = modeShareTrend.map(p => ({
    name: p.financialYear,
    Car: p.car,
    'Public transport': p.publicTransport,
    Walk: p.walk,
    Other: p.other,
  }));
  const hasFlags = modes.some(m => m.reliability !== 'ok') || purposes.some(p => p.reliability !== 'ok');

  return (
    <ChartWrapper
      title="All Weekday Travel (Household Travel Survey)"
      subtitle={`Average weekday trips by ${areaName} residents, ${latestYear} (pooled 3-year TfNSW estimate). Covers every trip purpose, not just the journey to work.`}
      className="lg:col-span-2"
      data={modeData}
      dataKeys={['Share of trips (%)']}
    >
      <div className="space-y-5 p-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{tripsPerPerson !== null ? formatNumber(tripsPerPerson, 2) : 'N/A'}</div>
            <div className="text-xs text-blue-600 mt-1">Trips per resident per weekday</div>
            <div className="text-xs text-slate-500 mt-0.5">Linked journeys ÷ population</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-slate-700">{formatPercent(share('vehicleDriver', 'vehiclePassenger'))}</div>
            <div className="text-xs text-slate-600 mt-1">Car share of all trips</div>
            <div className="text-xs text-slate-500 mt-0.5">Driver + passenger</div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-emerald-700">{formatPercent(share('publicTransport'))}</div>
            <div className="text-xs text-emerald-600 mt-1">Public transport share of all trips</div>
            <div className="text-xs text-slate-500 mt-0.5">Compare with the Census journey-to-work share above</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-2">Mode share, {latestYear}</h4>
            <NeedsBarChart
              data={modeData}
              dataKeys={['Share of trips (%)']}
              colors={[CHART_COLORS[0]]}
              layout="vertical"
              xAxisLabel="Share of trips (%)"
              height={240}
            />
          </div>
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-2">Trip purpose, {latestYear}</h4>
            <NeedsBarChart
              data={purposeData}
              dataKeys={['Share of journeys (%)']}
              colors={[CHART_COLORS[4]]}
              layout="vertical"
              xAxisLabel="Share of journeys (%)"
              height={240}
            />
          </div>
        </div>

        {trendData.length > 1 && (
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-2">Mode share trend</h4>
            <NeedsLineChart
              data={trendData}
              dataKeys={['Car', 'Public transport', 'Walk', 'Other']}
              colors={[CHART_COLORS[0], CHART_COLORS[2], CHART_COLORS[4], CHART_COLORS[6]]}
              xAxisKey="name"
              yAxisLabel="Share of trips (%)"
              height={260}
            />
          </div>
        )}

        <p className="text-xs text-slate-500 leading-relaxed">
          No LGA estimates were released for 2020/21, and 2021/22 reflects COVID-19 conditions. Before 2020/21, light rail and
          ferry trips are counted in Other; from 2021/22 they are in Public transport. Cycling is included in Other.
          {hasFlags && ' * use with caution (relative standard error 25–50%); ** too unreliable for general use (over 50%).'}
          {!lgaTotalReliable && ` The overall ${areaName} estimate has a relative standard error of 25% or more.`}
        </p>
      </div>
    </ChartWrapper>
  );
}
