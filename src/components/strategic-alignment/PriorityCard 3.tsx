'use client';

import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AlignmentStrengthBadge } from '@/components/strategic-alignment/AlignmentStrengthBadge';
import { useStrategicAlignmentStore } from '@/store/strategicAlignmentStore';
import type { ConnectingNSWPriority } from '@/lib/data/strategy-data';
import type { AlignmentScoreResult } from '@/lib/alignment-scoring';

interface PriorityCardProps {
  priority: ConnectingNSWPriority;
  score: AlignmentScoreResult;
}

export function PriorityCard({ priority, score }: PriorityCardProps) {
  const { selectedPriorities, priorityNotes, togglePriority, setPriorityNote } = useStrategicAlignmentStore();
  const selected = selectedPriorities.includes(priority.code);

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-colors',
        selected ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-200 bg-white hover:border-gray-300'
      )}
    >
      <button onClick={() => togglePriority(priority.code)} className="w-full text-left">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded', priority.color)}>{priority.code}</span>
            <span className="text-sm font-semibold text-gray-900">{priority.name}</span>
            {selected && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
          </div>
          <AlignmentStrengthBadge strength={score.strength} />
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">{priority.description}</p>
        <p className="mt-2 text-xs text-gray-500">{score.metric}: {score.value.toFixed(score.metric.includes('SEIFA') ? 0 : 1)}</p>
      </button>

      {selected && (
        <textarea
          value={priorityNotes[priority.code] ?? ''}
          onChange={(event) => setPriorityNote(priority.code, event.target.value)}
          placeholder="Add project-specific alignment notes for this priority..."
          className="mt-3 w-full rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          rows={3}
        />
      )}
    </div>
  );
}
