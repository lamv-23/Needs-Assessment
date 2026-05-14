'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import ChartWrapper from '@/components/charts/ChartWrapper';
import NeedsBarChart from '@/components/charts/BarChart';
import NeedsPieChart from '@/components/charts/PieChart';
import NeedsLineChart from '@/components/charts/LineChart';
import StackedBar from '@/components/charts/StackedBar';
import NeedsRadarChart, { type RadarDataPoint } from '@/components/charts/RadarChart';
import { useAppStore } from '@/store';
import { getTransportMetricsForArea, getLatestTransportMetrics } from '@/lib/data/tfnsw-transport';
import { formatNumber, formatPercent, CHART_COLORS } from '@/lib/utils';
import { Clock, Train, Car, Bus, TrendingDown } from 'lucide-react';
import { useLiveData } from '@/hooks/useLiveData';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';
import PageNav from '@/components/ui/PageNav';
import { StatCardSkeleton } from '@/components/ui/Skeleton';

export default function TransportPage() {
  const { selectedArea, selectedYear } = useAppStore();

  const area = selectedArea ?? { id: 'lga_sydney', name: 'City of Sydney' };
  const areaId = area.id;
  const year = selectedYear;

  const { transport: { data, meta }, isLoading } = useLiveData(areaId, year);

  // Static TfNSW transport metrics (from bundled data until TfNSW API key is set)
  const tfnswMetrics = getTransportMetricsForArea(areaId);
  const hasTfnswData = tfnswMetrics.length > 0;
  const latestTfnswMetrics = getLatestTransportMetrics(areaId);

  // Calculate car and PT mode shares from journey to work data
  const carModeShare = data.journeyToWork
    .filter((m: { name: string; value: number }) => m.name.startsWith('Car'))
    .reduce((sum: number, m: { name: string; value: number }) => sum + m.value, 0);

  const ptModeShare = data.journeyToWork
    .filter((m: { name: string; value: number }) => ['Train', 'Bus', 'Ferry'].includes(m.name))
    .reduce((sum: number, m: { name: string; value: number }) => sum + m.value, 0);

  const activeModeShare = data.journeyToWork
    .filter((m: { name: string; value: number }) => ['Cycling', 'Walking'].includes(m.name))
    .reduce((sum: number, m: { name: string; value: number }) => sum + m.value, 0);

  const liveTrafficTrend = data.trafficVolumeTrend ?? [];
  const liveCrashTrend = data.crashTrend ?? [];
  const hasLiveTraffic = liveTrafficTrend.length > 0;
  const hasLiveCrash = liveCrashTrend.length > 0;
  const latestTrafficPoint = hasLiveTraffic ? liveTrafficTrend[liveTrafficTrend.length - 1] : null;

  // ── Realtime transport intelligence ───────────────────────────────────────
  const [commuteTimes, setCommuteTimes] = useState<Array<{
    mode: string;
    duration_minutes: number | null;
    distance_km: number | null;
    destination: string;
    isIndicative?: boolean;
  }>>([]);
  const [reliabilityData, setReliabilityData] = useState<Array<{
    hour_of_day: number;
    pct_on_time: number | null;
    mode: string;
  }>>([]);
  const [infraData, setInfraData] = useState<Array<{
    feature_type: string;
    total_length_km: number | null;
  }>>([]);
  const [realtimeLoading, setRealtimeLoading] = useState(false);

  useEffect(() => {
    if (!areaId) return;
    setRealtimeLoading(true);
    Promise.allSettled([
      fetch(`/api/transport/commute-times/${areaId}`).then((r) => r.json()),
      fetch(`/api/transport/reliability/${areaId}`).then((r) => r.json()),
      fetch(`/api/transport/nsw-infrastructure/${areaId}`).then((r) => r.json()),
    ]).then(([commute, reliability, infra]) => {
      if (commute.status === 'fulfilled') {
        const rows = (commute.value.data ?? []) as Array<{ mode: string; duration_minutes: number | null; distance_km: number | null; destination: string }>;
        setCommuteTimes(rows.map((r) => ({ ...r, isIndicative: r.mode !== 'transit' })));
      }
      if (reliability.status === 'fulfilled') setReliabilityData(reliability.value.data ?? []);
      if (infra.status === 'fulfilled') setInfraData(infra.value.data ?? []);
      setRealtimeLoading(false);
    });
  }, [areaId]);

  // Visual 5: Traffic vs Population index (indexed to baseline)
  const trafficPopData = (() => {
    if (!liveTrafficTrend.length) return [];
    const baseTraffic = liveTrafficTrend[0].avgDailyVehicles;
    if (!baseTraffic) return [];
    return liveTrafficTrend.map((p) => ({
      year: p.year,
      'Traffic Index': Math.round((p.avgDailyVehicles / baseTraffic) * 100),
    }));
  })();

  // Visual 8: Multi-modal accessibility radar scores
  const ptStopDensity = data.ptStops?.total ?? 0;
  const avgReliability =
    reliabilityData.length > 0
      ? Math.round(reliabilityData.reduce((s, r) => s + (r.pct_on_time ?? 0), 0) / reliabilityData.length)
      : 0;
  const commuteCompetitiveness = (() => {
    const pt = commuteTimes.find((c) => c.mode === 'transit');
    const car = commuteTimes.find((c) => c.mode === 'driving');
    if (!pt?.duration_minutes || !car?.duration_minutes) return 0;
    return Math.max(0, Math.round(100 - (pt.duration_minutes / car.duration_minutes - 1) * 100));
  })();
  const cycleKm = infraData.find((i) => i.feature_type === 'CycleTrack')?.total_length_km ?? 0;
  const latestTrafficIdx = trafficPopData.length >= 2 ? trafficPopData[trafficPopData.length - 1]['Traffic Index'] : 100;

  const radarData: RadarDataPoint[] = [
    { axis: 'PT Coverage', value: Math.min(100, Math.round(ptStopDensity / 3)), benchmark: 50 },
    { axis: 'PT Reliability', value: avgReliability || 0, benchmark: 80 },
    { axis: 'Commute Competitiveness', value: commuteCompetitiveness, benchmark: 50 },
    { axis: 'Active Safety', value: liveCrashTrend.length > 0 ? Math.max(0, 100 - Math.round(liveCrashTrend[liveCrashTrend.length - 1].totalCrashes / 10)) : 50, benchmark: 60 },
    { axis: 'Cycle Infrastructure', value: Math.min(100, Math.round(cycleKm / 2)), benchmark: 40 },
    { axis: 'Traffic Pressure', value: Math.max(0, 100 - Math.round(latestTrafficIdx - 100)), benchmark: 50 },
  ];

  return (
    <div>
      <Header
        title="Transport & Commuting"
        subtitle={`${area.name} — ${year}`}
      />

      <PageNav sections={[
        { id: 'mode-share-census', label: 'Mode Share' },
        { id: 'traffic-crash', label: 'Traffic & Crash' },
        { id: 'modelled-trends', label: 'Modelled Trends' },
        { id: 'live-intel', label: 'Live Intelligence' },
      ]} />

      <div className="p-6 space-y-6">
        {/* Data source attribution — always visible */}
        <DataSourceBadge meta={meta} isLoading={isLoading} />

        {/* Stat Cards */}
        {isLoading ? (
          <StatCardSkeleton count={5} />
        ) : (
          <div className="flex flex-wrap gap-4">
            {data.avgCommute !== null && (
              <StatCard
                icon={Clock}
                accentColor="emerald"
                label="Average Commute Time"
                value={`${data.avgCommute} min`}
                subtitle="Latest available value"
              />
            )}
            {data.ptPatronage !== null && (
              <StatCard
                icon={Train}
                accentColor="emerald"
                label="PT Patronage"
                value={formatNumber(data.ptPatronage)}
                subtitle="Latest available value"
              />
            )}
            <StatCard
              icon={Car}
              accentColor="emerald"
              label="Car Mode Share"
              value={formatPercent(carModeShare)}
              subtitle="ABS Census 2021 — driver + passenger"
            />
            <StatCard
              icon={Bus}
              accentColor="emerald"
              label="Public Transport Mode Share"
              value={formatPercent(ptModeShare)}
              subtitle="ABS Census 2021 — train + bus + ferry"
            />
            <StatCard
              icon={TrendingDown}
              accentColor="emerald"
              label="Active Transport"
              value={formatPercent(activeModeShare)}
              subtitle="ABS Census 2021 — cycling + walking"
            />
          </div>
        )}

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Journey to Work */}
          <div data-section="mode-share" className="contents">
            <ChartWrapper
              title="Journey to Work — Mode Share"
              subtitle="Percentage of workers by transport mode"
              className="lg:col-span-2"
              data={data.journeyToWork}
              dataKeys={['value']}
            >
              <NeedsBarChart
                data={data.journeyToWork}
                dataKeys={['value']}
                colors={CHART_COLORS}
                layout="vertical"
                xAxisLabel="Mode Share (%)"
                yAxisLabel="Transport Mode"
                height={400}
              />
            </ChartWrapper>

            {/* TfNSW data disclaimer */}
            {hasTfnswData && (
              <div className="lg:col-span-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>
                  Some trend charts use modelled estimates, not official data. Use them as a guide
                  alongside the official source badges above.
                </span>
              </div>
            )}
          </div>

          <div data-section="traffic-crash" className="contents">
            {hasLiveTraffic && (
              <ChartWrapper
                title="Official Road Traffic Counts"
                subtitle={`${latestTrafficPoint?.stationCount ?? 0} nearby count sites matched in ${area.name}`}
                className="lg:col-span-2"
                data={liveTrafficTrend.map((point) => ({
                  year: point.year,
                  'Average daily vehicles': point.avgDailyVehicles,
                }))}
                dataKeys={['Average daily vehicles']}
                xAxisKey="year"
              >
                <NeedsLineChart
                  data={liveTrafficTrend.map((point) => ({
                    year: point.year,
                    'Average daily vehicles': point.avgDailyVehicles,
                  }))}
                  dataKeys={['Average daily vehicles']}
                  colors={[CHART_COLORS[1]]}
                  xAxisKey="year"
                  height={320}
                />
              </ChartWrapper>
            )}

            {hasLiveCrash && (
              <ChartWrapper
                title="Crash Trend by Year"
                subtitle="Annual crash totals for this area"
                className="lg:col-span-2"
                data={liveCrashTrend.map((point) => ({
                  year: point.year,
                  Total: point.totalCrashes,
                  Fatal: point.fatalCrashes,
                  Injury: point.injuryCrashes,
                }))}
                dataKeys={['Total', 'Fatal', 'Injury']}
                xAxisKey="year"
              >
                <NeedsLineChart
                  data={liveCrashTrend.map((point) => ({
                    year: point.year,
                    Total: point.totalCrashes,
                    Fatal: point.fatalCrashes,
                    Injury: point.injuryCrashes,
                  }))}
                  dataKeys={['Total', 'Fatal', 'Injury']}
                  colors={[CHART_COLORS[0], CHART_COLORS[4], CHART_COLORS[2]]}
                  xAxisKey="year"
                  height={320}
                />
              </ChartWrapper>
            )}

            {/* TfNSW Mode Share Trends - if available */}
            {hasTfnswData && (
              <ChartWrapper
                title="Mode Share Trends (2019-2026)"
                subtitle="Estimated travel mode mix over time"
                className="lg:col-span-2"
                data={tfnswMetrics.map(m => ({
                  year: m.year,
                  'Car': m.modeShareCar,
                  'PT': m.modeSharePT,
                  'Active': m.modeShareActive,
                }))}
                dataKeys={['Car', 'PT', 'Active']}
                xAxisKey="year"
              >
                <NeedsLineChart
                  data={tfnswMetrics.map(m => ({
                    year: m.year,
                    'Car': m.modeShareCar,
                    'PT': m.modeSharePT,
                    'Active': m.modeShareActive,
                  }))}
                  dataKeys={['Car', 'PT', 'Active']}
                  colors={[CHART_COLORS[0], CHART_COLORS[2], CHART_COLORS[5]]}
                  xAxisKey="year"
                  height={350}
                />
              </ChartWrapper>
            )}

            {/* PT Patronage Trend - if available */}
            {hasTfnswData && (
              <ChartWrapper
                title="PT Patronage Trend (2019-2026)"
                subtitle="Trips per capita per day — historical"
                className="lg:col-span-2"
                data={tfnswMetrics.map(m => ({
                  year: m.year,
                  'PT Patronage': m.ptPatronagePerCapita,
                }))}
                dataKeys={['PT Patronage']}
                xAxisKey="year"
              >
                <NeedsLineChart
                  data={tfnswMetrics.map(m => ({
                    year: m.year,
                    'PT Patronage': m.ptPatronagePerCapita,
                  }))}
                  dataKeys={['PT Patronage']}
                  colors={[CHART_COLORS[2]]}
                  xAxisKey="year"
                  height={350}
                />
              </ChartWrapper>
            )}

            {/* Commute Time Trend - if available */}
            {hasTfnswData && (
              <ChartWrapper
                title="Average Commute Time (2019-2026)"
                subtitle="Estimated one-way travel time"
                className="lg:col-span-2"
                data={tfnswMetrics.map(m => ({
                  year: m.year,
                  'Commute Time': m.averageCommuteTime,
                }))}
                dataKeys={['Commute Time']}
                xAxisKey="year"
              >
                <NeedsLineChart
                  data={tfnswMetrics.map(m => ({
                    year: m.year,
                    'Commute Time': m.averageCommuteTime,
                  }))}
                  dataKeys={['Commute Time']}
                  colors={[CHART_COLORS[1]]}
                  xAxisKey="year"
                  height={300}
                />
              </ChartWrapper>
            )}
          </div>

          <div data-section="mode-share" className="contents">
            {/* Mode Share Trend */}
            <ChartWrapper
              title="Mode Share Trend"
              subtitle="Change in transport modes across census years"
              data={data.modeShareTrend.map((d: { year: number; car: number; train: number; bus: number; active: number; wfh: number }) => ({ ...d, name: String(d.year) }))}
              dataKeys={['car', 'train', 'bus', 'active', 'wfh']}
              xAxisKey="year"
            >
              <NeedsLineChart
                data={data.modeShareTrend.map((d: { year: number; car: number; train: number; bus: number; active: number; wfh: number }) => ({ ...d, name: String(d.year) }))}
                dataKeys={['car', 'train', 'bus', 'active', 'wfh']}
                colors={[
                  CHART_COLORS[0],
                  CHART_COLORS[2],
                  CHART_COLORS[3],
                  CHART_COLORS[4],
                  CHART_COLORS[6],
                ]}
                xAxisLabel="Year"
                yAxisLabel="Mode Share (%)"
                height={350}
              />
            </ChartWrapper>

            {/* Vehicle Ownership */}
            <ChartWrapper
              title="Vehicle Ownership"
              subtitle="Households by number of vehicles"
              data={data.vehicleOwnership}
              dataKeys={['value']}
            >
              <NeedsPieChart
                data={data.vehicleOwnership}
                colors={CHART_COLORS}
                showLabels
                height={350}
                labelMode="value"
                valueSuffix="%"
              />
            </ChartWrapper>
          </div>
        </div>

        {/* ── Live & Recent Transport Intelligence ──────────────────────────── */}
        <div data-section="live-intel" className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Live &amp; Recent Transport Intelligence</h2>
              <p className="text-xs text-slate-500 mt-0.5">Recent travel patterns, infrastructure and safety indicators for this area</p>
            </div>
            {realtimeLoading && <span className="text-xs text-slate-400 animate-pulse">Loading…</span>}
          </div>

          <div className="p-5 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Visual 1: PT vs Car Commute Time */}
              <ChartWrapper
                title="PT vs Car Commute Time"
                subtitle={
                  commuteTimes.length > 0
                    ? `Typical travel time to ${commuteTimes[0]?.destination?.replace(/_/g, ' ')}`
                    : 'Travel time information will appear here when available'
                }
                data={commuteTimes.map((c) => ({ name: c.mode, value: c.duration_minutes ?? 0 }))}
                dataKeys={['value']}
              >
                {commuteTimes.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-sm text-slate-400">
                    {realtimeLoading
                      ? 'Loading commute times…'
                      : 'Commute time information is not available for this area yet.'}
                  </div>
                ) : (
                  <NeedsBarChart
                    data={commuteTimes.map((c) => ({ name: c.mode, value: c.duration_minutes ?? 0 }))}
                    dataKeys={['value']}
                    colors={commuteTimes.map((c) => (c.isIndicative ? CHART_COLORS[3] : CHART_COLORS[2]))}
                    layout="vertical"
                    xAxisLabel="Minutes"
                    height={220}
                  />
                )}
              </ChartWrapper>

              {/* Visual 2: PT On-Time Performance by Hour */}
              <ChartWrapper
                title="PT On-Time Performance by Hour"
                subtitle="Share of services arriving within 5 minutes of schedule"
                data={reliabilityData.map((r) => ({ name: `${r.hour_of_day}:00`, 'On Time': r.pct_on_time ?? 0 }))}
                dataKeys={['On Time']}
              >
                {reliabilityData.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-sm text-slate-400">
                    Reliability information is not available for this area yet.
                  </div>
                ) : (
                  <StackedBar
                    data={reliabilityData
                      .filter((r) => r.mode === 'bus' || r.mode === 'train')
                      .reduce((acc: Array<Record<string, string | number>>, r) => {
                        const existing = acc.find((a) => a.hour === r.hour_of_day);
                        if (existing) {
                          existing[r.mode] = r.pct_on_time ?? 0;
                        } else {
                          acc.push({ name: `${r.hour_of_day}:00`, hour: r.hour_of_day, [r.mode]: r.pct_on_time ?? 0 });
                        }
                        return acc;
                      }, [])
                      .sort((a, b) => (a.hour as number) - (b.hour as number))}
                    dataKeys={['bus', 'train']}
                    colors={[CHART_COLORS[1], CHART_COLORS[2]]}
                    xAxisLabel="Hour of Day"
                    yAxisLabel="% On Time"
                    height={220}
                  />
                )}
              </ChartWrapper>

              {/* Visual 3: Active Transport Infrastructure */}
              <ChartWrapper
                title="Active Transport Infrastructure"
                subtitle="Walking and cycling links mapped for this area"
                data={infraData.map((i) => ({ name: i.feature_type, value: i.total_length_km ?? 0 }))}
                dataKeys={['value']}
              >
                {infraData.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-sm text-slate-400">
                    {realtimeLoading ? 'Loading infrastructure data…' : 'Infrastructure information is not available yet.'}
                  </div>
                ) : (
                  <NeedsBarChart
                    data={[
                      ...infraData.map((i) => ({ name: i.feature_type, 'Length (km)': i.total_length_km ?? 0 })),
                      { name: 'Active Mode Share', 'Mode Share (%)': activeModeShare },
                    ]}
                    dataKeys={['Length (km)', 'Mode Share (%)']}
                    colors={[CHART_COLORS[5], CHART_COLORS[4]]}
                    layout="horizontal"
                    yAxisLabel="km / %"
                    height={220}
                  />
                )}
              </ChartWrapper>

              {/* Visual 4: PT Stop Density vs Mode Share */}
              <ChartWrapper
                title="PT Stop Density vs Mode Share"
                subtitle="How stop coverage compares with public transport use"
                data={[{ name: area.name, stops: ptStopDensity, modeShare: ptModeShare }]}
                dataKeys={['stops', 'modeShare']}
              >
                <div className="space-y-3 p-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-700">{ptStopDensity.toLocaleString()}</div>
                      <div className="text-xs text-blue-600 mt-1">PT stops in LGA</div>
                      <div className="text-xs text-slate-500 mt-0.5">Train + Bus + Ferry + Light Rail + Metro</div>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-700">{formatPercent(ptModeShare)}</div>
                      <div className="text-xs text-emerald-600 mt-1">PT commute mode share</div>
                      <div className="text-xs text-slate-500 mt-0.5">ABS Census 2021 journey-to-work</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {ptStopDensity > 200 && ptModeShare < 20
                      ? `⚠️ ${area.name} has high PT stop coverage (${ptStopDensity} stops) but low mode share (${formatPercent(ptModeShare)}), suggesting a service frequency or reliability gap rather than a coverage gap.`
                      : ptStopDensity < 50 && ptModeShare < 15
                      ? `⚠️ ${area.name} has low PT stop coverage (${ptStopDensity} stops) and low mode share, indicating a supply gap — additional stops and routes are needed.`
                      : `${area.name} has ${ptStopDensity} PT stops serving a ${formatPercent(ptModeShare)} commute mode share.`}
                  </p>
                </div>
              </ChartWrapper>

              {/* Visual 5: Traffic Volume vs Population Growth Index */}
              <ChartWrapper
                title="Traffic Volume vs Population Growth"
                subtitle={`Indexed to ${trafficPopData[0]?.year ?? 'baseline'} = 100`}
                className="lg:col-span-2"
                data={trafficPopData}
                dataKeys={['Traffic Index']}
                xAxisKey="year"
              >
                {trafficPopData.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-sm text-slate-400">
                    Traffic trend data is not available for {area.name} yet.
                  </div>
                ) : (
                  <NeedsLineChart
                    data={trafficPopData}
                    dataKeys={['Traffic Index']}
                    colors={[CHART_COLORS[0]]}
                    xAxisKey="year"
                    yAxisLabel="Index (baseline = 100)"
                    height={280}
                  />
                )}
              </ChartWrapper>

              {/* Visual 6: Road Safety — Crash Trend by Severity */}
              <ChartWrapper
                title="Road Safety — Crash Trend by Severity"
                subtitle="Annual crashes by severity"
                className="lg:col-span-2"
                data={liveCrashTrend.map((p) => ({
                  name: String(p.year),
                  Fatal: p.fatalCrashes,
                  Injury: p.injuryCrashes,
                  'Non-injury': Math.max(0, p.totalCrashes - p.fatalCrashes - p.injuryCrashes),
                }))}
                dataKeys={['Fatal', 'Injury', 'Non-injury']}
                xAxisKey="name"
              >
                {liveCrashTrend.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-sm text-slate-400">
                    No crash data available for {area.name}.
                  </div>
                ) : (
                  <StackedBar
                    data={liveCrashTrend.map((p) => ({
                      name: String(p.year),
                      Fatal: p.fatalCrashes,
                      Injury: p.injuryCrashes,
                      'Non-injury': Math.max(0, p.totalCrashes - p.fatalCrashes - p.injuryCrashes),
                    }))}
                    dataKeys={['Fatal', 'Injury', 'Non-injury']}
                    colors={[CHART_COLORS[5], CHART_COLORS[3], CHART_COLORS[1]]}
                    xAxisLabel="Year"
                    yAxisLabel="Crashes"
                    height={280}
                  />
                )}
              </ChartWrapper>

              {/* Visual 7: Projected Transport Demand vs PT Capacity */}
              <ChartWrapper
                title="Projected Transport Demand vs PT Capacity"
                subtitle="Indicative comparison of projected demand and current network capacity"
                className="lg:col-span-2"
                data={[]}
                dataKeys={[]}
              >
                {(data.ptRoutes?.total ?? 0) === 0 ? (
                  <div className="flex items-center justify-center h-48 text-sm text-slate-400">
                    Demand projections will appear here when enough route and growth data is available.
                  </div>
                ) : (() => {
                  const ptShareFrac = ptModeShare / 100;
                  const ptCapEst = (data.ptRoutes?.total ?? 0) * 12 * 16;
                  const years = [2021, 2026, 2031, 2036, 2041];
                  const growthRates: Record<number, number> = { 2021: 1, 2026: 1.08, 2031: 1.17, 2036: 1.26, 2041: 1.35 };
                  const baselinePop = 100000;
                  const demandGapData = years.map((y) => ({
                    year: y,
                    'Projected Demand (000s trips/yr)': Math.round(baselinePop * (growthRates[y] ?? 1) * ptShareFrac * 365 / 1000),
                    'Current Capacity Est. (000s trips/yr)': Math.round(ptCapEst * 365 / 1000),
                  }));
                  return (
                      <>
                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 mb-3">
                          <span>⚠</span>
                          <span>This is a high-level estimate designed to highlight whether demand may outpace current service levels.</span>
                        </div>
                      <NeedsLineChart
                        data={demandGapData}
                        dataKeys={['Projected Demand (000s trips/yr)', 'Current Capacity Est. (000s trips/yr)']}
                        colors={[CHART_COLORS[0], CHART_COLORS[5]]}
                        xAxisKey="year"
                        yAxisLabel="000s trips/year"
                        height={280}
                      />
                    </>
                  );
                })()}
              </ChartWrapper>

              {/* Visual 8: Multi-Modal Accessibility Radar */}
              <ChartWrapper
                title="Multi-Modal Accessibility Score"
                subtitle="6-axis radar — 0–100 score per dimension vs Greater Sydney benchmark (grey)"
                className="lg:col-span-2"
                data={radarData as unknown as Array<Record<string, unknown>>}
                dataKeys={['value', 'benchmark']}
              >
                <NeedsRadarChart
                  data={radarData}
                  subjectLabel={area.name}
                  benchmarkLabel="Greater Sydney Avg (indicative)"
                  height={380}
                />
              </ChartWrapper>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
