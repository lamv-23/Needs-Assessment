import { CheckCircle, AlertCircle, Info, Clock, Loader2 } from 'lucide-react';
import type { DataMeta } from '@/hooks/useLiveData';
import { formatDataSource } from '@/hooks/useLiveData';

interface DataSourceBadgeProps {
  meta: DataMeta;
  isLoading?: boolean;
  className?: string;
}

/**
 * Displays data source attribution and last-refresh date.
 * Always shown — users should know where data comes from.
 */
export function DataSourceBadge({ meta, isLoading = false, className = '' }: DataSourceBadgeProps) {
  const isLive = meta.hasLiveData;
  const hasPartialLive = isLive && meta.sampleFields.length > 0;

  const refreshDate = meta.lastRefreshed
    ? new Date(meta.lastRefreshed).toLocaleDateString('en-AU', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : null;

  return (
    <div
      className={`flex items-start gap-2.5 text-xs px-3.5 py-2.5 rounded-lg border ${
        isLoading && !isLive
          ? 'bg-blue-50 border-blue-200 text-blue-700'
          : 
        isLive && !hasPartialLive
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : isLive && hasPartialLive
          ? 'bg-blue-50 border-blue-200 text-blue-700'
          : 'bg-amber-50 border-amber-200 text-amber-700'
      } ${className}`}
    >
      {isLoading && !isLive ? (
        <Loader2 className="w-3.5 h-3.5 mt-0.5 shrink-0 animate-spin" />
      ) : isLive ? (
        hasPartialLive ? (
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        ) : (
          <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        )
      ) : (
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        {isLoading && !isLive ? (
          <span>
            <strong>Source:</strong> Loading refreshed official data...
          </span>
        ) : (
          <span>
            <strong>Source:</strong> {formatDataSource(meta)}
          </span>
        )}
        {hasPartialLive && meta.sampleFields.length > 0 && (
          <span className="ml-1 opacity-70">
            · No official source loaded for: {meta.sampleFields.slice(0, 3).join(', ')}
            {meta.sampleFields.length > 3 ? ` +${meta.sampleFields.length - 3} more` : ''}
          </span>
        )}
        {!isLive && !isLoading && (
          <span className="ml-1 opacity-75">
            · Run <code className="bg-amber-100 px-1 rounded font-mono text-[11px]">npm run seed:abs</code> to refresh the ABS cache
          </span>
        )}
      </div>
      {refreshDate && (
        <span className="flex items-center gap-1 flex-shrink-0 opacity-70 font-medium">
          <Clock className="w-3 h-3" />
          {refreshDate}
        </span>
      )}
    </div>
  );
}
