import { PriorityCard } from '@/components/strategic-alignment/PriorityCard';
import type { ConnectingNSWPriority, PriorityCode } from '@/lib/data/strategy-data';
import type { AlignmentScoreResult } from '@/lib/alignment-scoring';

interface PriorityGridProps {
  priorities: ConnectingNSWPriority[];
  scores: Record<PriorityCode, AlignmentScoreResult>;
}

export function PriorityGrid({ priorities, scores }: PriorityGridProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Click a priority to select it. Selected priorities filter the evidence panels below and are saved for the business case report.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {priorities.map((priority) => (
          <PriorityCard key={priority.code} priority={priority} score={scores[priority.code]} />
        ))}
      </div>
    </div>
  );
}
