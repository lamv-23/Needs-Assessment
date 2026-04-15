import { cn } from '@/lib/utils';
import type { AlignmentStrength } from '@/lib/alignment-scoring';

const STYLES: Record<AlignmentStrength, string> = {
  Strong: 'bg-emerald-100 text-emerald-800',
  Moderate: 'bg-amber-100 text-amber-800',
  Weak: 'bg-gray-100 text-gray-700',
};

export function AlignmentStrengthBadge({ strength, className }: { strength: AlignmentStrength; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', STYLES[strength], className)}>
      {strength}
    </span>
  );
}
