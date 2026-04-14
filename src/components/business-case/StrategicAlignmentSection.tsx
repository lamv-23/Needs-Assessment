'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useStrategicAlignmentStore } from '@/store/strategicAlignmentStore';
import { STRATEGY_HIERARCHY, CONNECTING_NSW_PRIORITIES, type PriorityCode } from '@/lib/data/strategy-data';
import { computeAlignmentStrength } from '@/lib/alignment-scoring';
import { useLiveData } from '@/hooks/useLiveData';
import { formatPercent } from '@/lib/utils';
import { getCarModeShare } from '@/lib/data/transport-helpers';

interface Props {
  areaId: string;
  areaName: string;
  year: number;
}

export function StrategicAlignmentSection({ areaId, areaName, year }: Props) {
  const { selectedStrategyIds, strategyNotes, selectedPriorities } = useStrategicAlignmentStore();
  const { demographics, transport, economy, growth } = useLiveData(areaId, year);

  const d = demographics.data;
  const t = transport.data;
  const e = economy.data;
  const g = growth.data;

  const pop2021 = g.populationHistory.find((row) => row.year === 2021)?.population ?? g.populationHistory[g.populationHistory.length - 1]?.population ?? 0;
  const pop2041 = g.populationProjections.find((row) => row.year === 2041)?.population ?? 0;
  const popGrowthPct = pop2021 > 0 ? ((pop2041 - pop2021) / pop2021) * 100 : 0;
  const carModeShare = getCarModeShare(t.journeyToWork);

  const flatStrategies = STRATEGY_HIERARCHY.flatMap((level) => level.items.map((item) => ({ ...item, level: level.level })));
  const activeStrategies = flatStrategies.filter((item) => item.mandatory || selectedStrategyIds.includes(item.id));

  const priorityRows = useMemo(() => {
    const metrics = {
      popGrowthPct,
      avgCommuteTime: t.avgCommute,
      carModeShare,
      seifaScore: d.seifaScore,
      unemploymentRate: e.unemploymentRate,
    };

    return CONNECTING_NSW_PRIORITIES
      .filter((priority) => selectedPriorities.includes(priority.code))
      .map((priority) => {
        const score = computeAlignmentStrength(priority.code, metrics);
        return {
          ...priority,
          score,
        };
      });
  }, [selectedPriorities, popGrowthPct, t.avgCommute, carModeShare, d.seifaScore, e.unemploymentRate]);

  if (activeStrategies.length === 0 && priorityRows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-600">
        No strategic alignment data configured. Visit <Link href="/strategic-alignment" className="text-primary-700 hover:underline">Strategic Alignment</Link> to select applicable strategies and priorities.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Strategic Alignment</h2>
        <p className="text-sm text-gray-500 mt-1">Summary of selected strategies and Connecting NSW priorities for {areaName}.</p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Selected Strategies</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2 border border-gray-200">Strategy</th>
                <th className="text-left px-3 py-2 border border-gray-200">Level</th>
                <th className="text-left px-3 py-2 border border-gray-200">ATAP Phase</th>
                <th className="text-left px-3 py-2 border border-gray-200">Notes</th>
              </tr>
            </thead>
            <tbody>
              {activeStrategies.map((strategy) => (
                <tr key={strategy.id}>
                  <td className="px-3 py-2 border border-gray-200 text-gray-800">{strategy.name}</td>
                  <td className="px-3 py-2 border border-gray-200 text-gray-600">{strategy.level}</td>
                  <td className="px-3 py-2 border border-gray-200 text-gray-600">{strategy.atapPhase ?? '—'}</td>
                  <td className="px-3 py-2 border border-gray-200 text-gray-600">{strategyNotes[strategy.id] || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Priority Alignment</h3>
        {priorityRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
            No Connecting NSW priorities selected yet. Visit the Strategic Alignment page to select the priorities relevant to this project.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 border border-gray-200">Priority</th>
                  <th className="text-left px-3 py-2 border border-gray-200">Alignment</th>
                  <th className="text-left px-3 py-2 border border-gray-200">Key Metric</th>
                  <th className="text-left px-3 py-2 border border-gray-200">Value</th>
                </tr>
              </thead>
              <tbody>
                {priorityRows.map((row) => (
                  <tr key={row.code}>
                    <td className="px-3 py-2 border border-gray-200 text-gray-800">{row.code} · {row.name}</td>
                    <td className="px-3 py-2 border border-gray-200 text-gray-600">{row.score.strength}</td>
                    <td className="px-3 py-2 border border-gray-200 text-gray-600">{row.score.metric}</td>
                    <td className="px-3 py-2 border border-gray-200 text-gray-600">
                      {row.score.metric.includes('SEIFA') ? row.score.value.toFixed(0) : formatPercent(row.score.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
