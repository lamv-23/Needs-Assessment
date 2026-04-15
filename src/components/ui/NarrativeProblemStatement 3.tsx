'use client';

import { cn } from '@/lib/utils';

interface NarrativeProblemStatementProps {
  areaName: string;
  urbanType: 'inner' | 'middle' | 'outer' | 'regional';
  carModeShare: number;
  ptModeShare: number;
  activeModeShare: number;
  avgCommute: number | null;
  pop2021: number;
  pop2041: number;
  popGrowthPct: number;
  ptTarget: number;
  carTarget: number;
  className?: string;
}

function fmt(n: number) {
  return n.toLocaleString();
}

export function NarrativeProblemStatement({
  areaName,
  urbanType,
  carModeShare,
  ptModeShare,
  activeModeShare,
  avgCommute,
  pop2021,
  pop2041,
  popGrowthPct,
  ptTarget,
  carTarget,
  className,
}: NarrativeProblemStatementProps) {
  const ptGap = ptModeShare - ptTarget;
  const carGap = carTarget - carModeShare; // positive = below (good), negative = over (bad)

  const ptSeverity = ptGap >= 0 ? 'meets' : ptGap >= -5 ? 'near' : 'below';
  const carSeverity = carGap >= 0 ? 'meets' : carGap >= -5 ? 'near' : 'over';

  const ptDesc =
    ptSeverity === 'meets'
      ? `a public transport mode share of ${ptModeShare.toFixed(1)}%, which meets the ${ptTarget}% target for ${urbanType} areas`
      : ptSeverity === 'near'
      ? `a public transport mode share of ${ptModeShare.toFixed(1)}%, just below the ${ptTarget}% target for ${urbanType} areas`
      : `a public transport mode share of only ${ptModeShare.toFixed(1)}%, well below the ${ptTarget}% benchmark for ${urbanType} areas — a gap of ${Math.abs(ptGap).toFixed(1)} percentage points`;

  const carDesc =
    carSeverity === 'meets'
      ? `car driver mode share of ${carModeShare.toFixed(1)}% is within the ${carTarget}% target`
      : carSeverity === 'near'
      ? `car driver mode share of ${carModeShare.toFixed(1)}% is slightly above the ${carTarget}% benchmark`
      : `car driver mode share of ${carModeShare.toFixed(1)}% significantly exceeds the ${carTarget}% benchmark for ${urbanType} areas`;

  const growthSentence =
    pop2041 > 0
      ? ` The population is projected to grow ${popGrowthPct > 0 ? 'by ' + popGrowthPct.toFixed(1) + '%' : 'modestly'} from ${fmt(pop2021)} to ${fmt(pop2041)} residents by 2041, amplifying demand for transport services.`
      : '';

  const activeDesc =
    activeModeShare > 0
      ? ` Active transport (walking and cycling) accounts for ${activeModeShare.toFixed(1)}% of journeys to work.`
      : '';

  const commuteDesc =
    avgCommute !== null && avgCommute > 0
      ? ` The average one-way commute is ${avgCommute} minutes.`
      : '';

  const urgencySentence =
    ptSeverity === 'below' || carSeverity === 'over'
      ? ' These gaps provide the primary justification for transport investment under the ATAP Strategic Merit Test.'
      : ptSeverity === 'near' || carSeverity === 'near'
      ? ' Performance is approaching — but has not yet reached — Connecting NSW mode share targets.'
      : ' Current transport performance broadly meets Connecting NSW benchmarks for this area type.';

  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 shadow-sm p-6', className)}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-6 bg-primary-500 rounded-full" />
        <h2 className="text-base font-bold text-gray-900">Problem Statement</h2>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed">
        <span className="font-semibold text-gray-900">{areaName}</span> has {ptDesc}.{' '}
        The {carDesc}.{activeDesc}{commuteDesc}
        {growthSentence}
        {urgencySentence}
      </p>
      <p className="text-xs text-gray-400 mt-3">
        Sources: ABS Census 2021; NSW DPE Population Projections; TfNSW TZP24; Connecting NSW benchmarks.
        Urban type classified as <span className="font-medium capitalize">{urbanType}</span>.
      </p>
    </div>
  );
}
