import { cn, formatNumber } from '@/lib/utils';

interface BenchmarkBarProps {
  label: string;
  areaName: string;
  areaValue: number;
  greaterSydneyValue: number;
  nswValue: number;
  unit?: string;
  direction?: 'higher_better' | 'lower_better';
}

export function BenchmarkBar({
  label,
  areaName,
  areaValue,
  greaterSydneyValue,
  nswValue,
  unit = '',
  direction = 'higher_better',
}: BenchmarkBarProps) {
  const max = Math.max(areaValue, greaterSydneyValue, nswValue, 1);
  const rows = [
    { name: areaName, value: areaValue, color: 'bg-primary-600' },
    { name: 'Greater Sydney avg', value: greaterSydneyValue, color: 'bg-sky-500' },
    { name: 'NSW avg', value: nswValue, color: 'bg-violet-500' },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <span className="text-xs text-gray-500">{direction === 'higher_better' ? 'Higher is better' : 'Lower is better'}</span>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>{row.name}</span>
              <span>{formatNumber(row.value, unit === '%' ? 1 : 0)}{unit}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div className={cn('h-full rounded-full', row.color)} style={{ width: `${Math.max((row.value / max) * 100, 4)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
