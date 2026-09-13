'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, Tag } from 'lucide-react';

// Data is refreshed manually (npm run seed). Warn once it is older than this.
const STALE_AFTER_DAYS = 60;

interface DataStatusInfo {
  absLastRefresh: string | null;
  staticLastSeed: string | null;
  tfnswLastRefresh: string | null;
  effectiveDate: string | null;
  snapshotTag: string | null;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function DataAsAtBanner() {
  const [status, setStatus] = useState<DataStatusInfo | null>(null);

  useEffect(() => {
    fetch('/api/data-status')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status) return null;

  const dateStr = formatDate(status.effectiveDate);
  if (!dateStr && !status.snapshotTag) return null;

  const age = daysSince(status.effectiveDate);
  const isStale = age !== null && age > STALE_AFTER_DAYS;

  return (
    <div
      className={
        isStale
          ? 'bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-xs text-amber-800 flex items-center gap-3 justify-center'
          : 'bg-slate-50 border-b border-slate-200 px-4 py-1.5 text-xs text-slate-600 flex items-center gap-3 justify-center'
      }
    >
      {dateStr && (
        <span className="flex items-center gap-1.5">
          {isStale ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
          <span>Data as at <strong>{dateStr}</strong></span>
          {isStale && <span>· {age} days old — run <code>npm run seed</code></span>}
        </span>
      )}
      {status.snapshotTag && (
        <span className="flex items-center gap-1.5">
          <Tag className="w-3 h-3" />
          <span>Snapshot: <strong>{status.snapshotTag}</strong></span>
        </span>
      )}
    </div>
  );
}