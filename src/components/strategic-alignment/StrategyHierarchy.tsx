'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, MessageSquarePlus } from 'lucide-react';
import { useStrategicAlignmentStore } from '@/store/strategicAlignmentStore';
import type { StrategyLevel } from '@/lib/data/strategy-data';
import { cn } from '@/lib/utils';

export function StrategyHierarchy({ hierarchy }: { hierarchy: StrategyLevel[] }) {
  const { selectedStrategyIds, strategyNotes, toggleStrategy, setStrategyNote } = useStrategicAlignmentStore();
  const [openLevels, setOpenLevels] = useState<Record<string, boolean>>(() => Object.fromEntries(hierarchy.map((level) => [level.level, true])));
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  const selectedCount = useMemo(
    () => hierarchy.flatMap((level) => level.items).filter((item) => item.mandatory || selectedStrategyIds.includes(item.id)).length,
    [hierarchy, selectedStrategyIds]
  );
  const totalCount = hierarchy.flatMap((level) => level.items).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Applicable Strategy Hierarchy</h3>
        <p className="mt-1 text-sm text-gray-500">{selectedCount} of {totalCount} selected. Mandatory items stay selected because they are normally required under NSW / ATAP business case practice.</p>
      </div>

      {hierarchy.map((level) => {
        const Icon = level.icon;
        const isOpen = openLevels[level.level];
        return (
          <div key={level.level} className="rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setOpenLevels((current) => ({ ...current, [level.level]: !current[level.level] }))}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100"
            >
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-800">{level.level}</span>
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {isOpen && (
              <div className="p-4 space-y-3">
                {level.items.map((item) => {
                  const selected = item.mandatory || selectedStrategyIds.includes(item.id);
                  const noteOpen = expandedNotes[item.id] || Boolean(strategyNotes[item.id]);
                  return (
                    <div key={item.id} className={cn('rounded-xl border p-4', selected ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-200')}>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={item.mandatory}
                          onChange={() => !item.mandatory && toggleStrategy(item.id)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 accent-primary-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">{item.name}</span>
                            {item.mandatory && <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-700"><CheckCircle2 className="w-3 h-3" />Required</span>}
                            {item.atapPhase && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{item.atapPhase}</span>}
                          </div>
                          <p className="mt-1 text-sm text-gray-600 leading-relaxed">{item.description}</p>

                          <button
                            onClick={() => setExpandedNotes((current) => ({ ...current, [item.id]: !noteOpen }))}
                            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-800"
                          >
                            <MessageSquarePlus className="w-3.5 h-3.5" />
                            {noteOpen ? 'Hide note' : 'Add note'}
                          </button>

                          {noteOpen && (
                            <textarea
                              value={strategyNotes[item.id] ?? ''}
                              onChange={(event) => setStrategyNote(item.id, event.target.value)}
                              placeholder="Why is this strategy relevant to the project?"
                              className="mt-2 w-full rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                              rows={3}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
