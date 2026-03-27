import { CheckCircle, AlertCircle, Info } from 'lucide-react';
import type { DataMeta } from '@/hooks/useLiveData';
import { formatDataSource } from '@/hooks/useLiveData';

interface DataSourceBadgeProps {
  meta: DataMeta;
  className?: string;
}

/**
 * Displays data source attribution and last-refresh date.
 * Always shown — users should know where data comes from.
 */
export function DataSourceBadge({ meta, className = '' }: DataSourceBadgeProps) {
  const isLive = meta.hasLiveData;
  const hasPartialLive = isLive && meta.sampleFields.length > 0;

  return (
    <div
      className={`flex items-start gap-2 text-xs px-3 py-2 rounded-md border ${
        isLive && !hasPartialLive
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : isLive && hasPartialLive
          ? 'bg-blue-50 border-blue-200 text-blue-700'
          : 'bg-gray-50 border-gray-200 text-gray-500'
      } ${className}`}
    >
      {isLive ? (
        hasPartialLive ? (
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        ) : (
          <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        )
      ) : (
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      )}
      <span>
        <strong>Source:</strong> {formatDataSource(meta)}
        {hasPartialLive && meta.sampleFields.length > 0 && (
          <span className="ml-1 opacity-70">
            · Indicative: {meta.sampleFields.slice(0, 3).join(', ')}
            {meta.sampleFields.length > 3 ? ` +${meta.sampleFields.length - 3} more` : ''}
          </span>
        )}
      </span>
    </div>
  );
}
