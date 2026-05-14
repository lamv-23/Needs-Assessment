'use client';

import { useEffect, useState } from 'react';
import { Clock, Tag } from 'lucide-react';

interface DataStatusInfo {
  absLastRefresh: string | null;
  staticLastSeed: string | null;
  tfnswLastRefresh: string | null;
  effectiveDate: string | null;
  snapshotTag: string | null;
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

  return (
    <div className="bg-slate-50 border-b border-slate-200 px-4 py-1.5 text-xs text-slate-600 flex items-center gap-3 justify-center">
      {dateStr && (
        <span className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          <span>Data as at <strong>{dateStr}</strong></span>
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