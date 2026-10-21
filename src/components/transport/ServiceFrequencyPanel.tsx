'use client';

import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsBarChart from '@/components/charts/BarChart';
import { formatNumber, formatPercent, CHART_COLORS } from '@/lib/utils';
import type { TransportData } from '@/lib/data/sample-data';

interface Props {
  areaName: string;
  ptFrequency: TransportData['ptFrequency'];
}

const formatServiceDate = (ymd: string) => `${ymd.slice(6, 8)}/${ymd.slice(4, 6)}/${ymd.slice(0, 4)}`;

/** Weekday 7–9am scheduled PT service frequency from the TfNSW GTFS timetable. */
export default function ServiceFrequencyPanel({ areaName, ptFrequency }: Props) {
  const byModeData = ptFrequency
    ? ([
        ['Train', ptFrequency.frequentStopsByMode.train],
        ['Metro', ptFrequency.frequentStopsByMode.metro],
        ['Light Rail', ptFrequency.frequentStopsByMode.lightRail],
        ['Ferry', ptFrequency.frequentStopsByMode.ferry],
        ['Bus', ptFrequency.frequentStopsByMode.bus],
      ] as const)
        .filter(([, n]) => n > 0)
        .map(([name, n]) => ({ name, 'Frequent stops': n }))
    : [];

  return (
    <ChartWrapper
      title="Peak Service Frequency"
      subtitle={
        ptFrequency
          ? `Scheduled departures 7–9am, weekday timetable for ${formatServiceDate(ptFrequency.serviceDate)} (TfNSW GTFS)`
          : 'Scheduled weekday 7–9am departures from the TfNSW GTFS timetable'
      }
      className="lg:col-span-2"
      data={byModeData}
      dataKeys={['Frequent stops']}
    >
      {!ptFrequency ? (
        <div className="flex items-center justify-center h-48 text-sm text-slate-400">
          Service frequency is not available for {areaName} yet.
        </div>
      ) : (
        <div className="space-y-4 p-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{ptFrequency.frequentStops.toLocaleString()}</div>
              <div className="text-xs text-blue-600 mt-1">Frequent stops</div>
              <div className="text-xs text-slate-500 mt-0.5">4+ departures an hour, 7–9am</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-emerald-700">{formatPercent(ptFrequency.frequentStopShare)}</div>
              <div className="text-xs text-emerald-600 mt-1">Share of stops that are frequent</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {ptFrequency.benchmarks
                  ? `Greater Sydney ${formatPercent(ptFrequency.benchmarks.greaterSydneyFrequentStopShare)} · NSW ${formatPercent(ptFrequency.benchmarks.nswFrequentStopShare)}`
                  : 'Share of all stops in the LGA'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {ptFrequency.totalStops - ptFrequency.servicedStops > 0
                  ? `${(ptFrequency.totalStops - ptFrequency.servicedStops).toLocaleString()} of ${ptFrequency.totalStops.toLocaleString()} stops have no 7–9am service`
                  : `All ${ptFrequency.totalStops.toLocaleString()} stops have 7–9am service`}
              </div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-700">
                {ptFrequency.departuresPer1000Residents !== null ? formatNumber(ptFrequency.departuresPer1000Residents, 1) : 'N/A'}
              </div>
              <div className="text-xs text-amber-600 mt-1">Peak departures per 1,000 residents</div>
              <div className="text-xs text-slate-500 mt-0.5">Stop departures 7–9am ÷ ABS estimated resident population</div>
            </div>
          </div>
          {byModeData.length > 0 && (
            <NeedsBarChart
              data={byModeData}
              dataKeys={['Frequent stops']}
              colors={[CHART_COLORS[2]]}
              layout="vertical"
              xAxisLabel="Frequent stops"
              height={Math.max(140, byModeData.length * 44)}
            />
          )}
          <p className="text-xs text-slate-500 leading-relaxed">
            A stop counts as frequent when all routes serving it combined give a departure every 15 minutes or better.
            Counts come from the published timetable, not observed services.
          </p>
        </div>
      )}
    </ChartWrapper>
  );
}
