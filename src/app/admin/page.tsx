'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { Database, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle, Tag, Plus, Trash2, Bookmark, AlertTriangle } from 'lucide-react';

interface AdminStatus {
  absCacheCount: number;
  nswProjectionCount: number;
  config: Record<string, string>;
  recentLogs: Array<{
    id: number;
    source: string;
    status: string;
    lgasUpdated: number;
    errorMessage: string | null;
    changeSummary: {
      before_abs_cache_count: number;
      after_abs_cache_count: number;
      before_projection_count: number;
      after_projection_count: number;
      datasets_changed: Record<string, { before: number; after: number }>;
    } | null;
    startedAt: string;
    completedAt: string | null;
  }>;
  recentJobs: Array<{
    id: number;
    jobType: 'static' | 'abs' | 'all';
    status: 'queued' | 'running' | 'success' | 'error';
    requestedBy: string;
    lgaId: string | null;
    attemptCount: number;
    maxAttempts: number;
    startedAt: string | null;
    completedAt: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
  jobSummary: {
    queued: number;
    running: number;
    success: number;
    error: number;
  };
  datasetCoverage?: Array<{ dataset: string; count: number; expected: number }>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'success') return <CheckCircle className="w-4 h-4 text-emerald-500" />;
  if (status === 'error') return <XCircle className="w-4 h-4 text-red-500" />;
  if (status === 'partial') return <AlertCircle className="w-4 h-4 text-amber-500" />;
  return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('');
  const [isAuth, setIsAuth] = useState(false);
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [intervalDays, setIntervalDays] = useState('7');
  const [snapshots, setSnapshots] = useState<Array<{
    id: number; tag: string; description: string | null;
    absLastRefresh: string | null; staticLastSeed: string | null;
    tfnswLastRefresh: string | null; absCacheCount: number | null;
    projectionCount: number | null; createdAt: string;
  }>>([]);
  const [newSnapshotTag, setNewSnapshotTag] = useState('');
  const [newSnapshotDesc, setNewSnapshotDesc] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ action: string; label: string; description: string } | null>(null);

  const fetchStatus = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/refresh?key=${encodeURIComponent(key)}`);
      if (!res.ok) {
        if (res.status === 401) {
          setMessage({ type: 'error', text: 'Invalid admin key' });
          setIsAuth(false);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data: AdminStatus = await res.json();
      setStatus(data);
      setIsAuth(true);
      setIntervalDays(data.config.abs_refresh_interval_days ?? '7');
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to load status: ${err}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Try key from URL hash for convenience
    const hash = window.location.hash.slice(1);
    if (hash) {
      setAdminKey(hash);
      fetchStatus(hash);
    }
  }, [fetchStatus]);

  useEffect(() => {
    if (!isAuth) {
      return;
    }

    const interval = window.setInterval(() => {
      void fetchStatus(adminKey);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [adminKey, fetchStatus, isAuth]);

  const handleLogin = () => {
    fetchStatus(adminKey);
  };

  const triggerAction = async (action: string, extra: Record<string, unknown> = {}) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/refresh?key=${encodeURIComponent(adminKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        // Refresh status after a delay
        setTimeout(() => fetchStatus(adminKey), 2000);
      } else {
        setMessage({ type: 'error', text: data.error ?? 'Action failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Request failed: ${err}` });
    } finally {
      setLoading(false);
    }
  };

  const saveInterval = () => {
    triggerAction('update_config', {
      updates: {
        abs_refresh_interval_days: intervalDays,
        tfnsw_refresh_interval_days: intervalDays,
      },
    });
  };

  const handleConfirmedAction = () => {
    if (!confirmAction) return;
    triggerAction(confirmAction.action);
    setConfirmAction(null);
  };

  const incompleteDatasets = status?.datasetCoverage?.filter(ds => ds.count < ds.expected) ?? [];
  const absRefreshDescription = incompleteDatasets.length > 0
    ? `Will refresh all {status?.absCacheCount ?? 128} LGAs. ${incompleteDatasets.length} dataset${incompleteDatasets.length !== 1 ? 's' : ''} currently incomplete (will be filled). This takes 10-30 minutes and runs in the background.`
    : `Will refresh all ${status?.absCacheCount ?? 128} LGAs from the ABS API. This takes 10-30 minutes and runs in the background.`;

  const fetchSnapshots = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/snapshot?key=${encodeURIComponent(adminKey)}`);
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data.snapshots ?? []);
      }
    } catch {}
  }, [adminKey]);

  useEffect(() => {
    if (isAuth) fetchSnapshots();
  }, [isAuth, fetchSnapshots]);

  const createNewSnapshot = async () => {
    if (!newSnapshotTag.trim()) return;
    try {
      const res = await fetch(`/api/admin/snapshot?key=${encodeURIComponent(adminKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', tag: newSnapshotTag.trim(), description: newSnapshotDesc.trim() || undefined }),
      });
      const data = await res.json();
      if (data.snapshot) {
        setMessage({ type: 'success', text: `Snapshot "${newSnapshotTag.trim()}" created` });
        setNewSnapshotTag('');
        setNewSnapshotDesc('');
        fetchSnapshots();
        fetchStatus(adminKey);
      } else {
        setMessage({ type: 'error', text: data.error ?? 'Failed to create snapshot' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Request failed: ${err}` });
    }
  };

  const activateSnapshot = async (tag: string) => {
    try {
      const res = await fetch(`/api/admin/snapshot?key=${encodeURIComponent(adminKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate', tag }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Snapshot "${tag}" activated` });
        fetchStatus(adminKey);
      } else {
        setMessage({ type: 'error', text: data.error ?? 'Failed to activate snapshot' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Request failed: ${err}` });
    }
  };

  const deleteSnapshot = async (tag: string) => {
    try {
      const res = await fetch(`/api/admin/snapshot?key=${encodeURIComponent(adminKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', tag }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Snapshot "${tag}" deleted` });
        fetchSnapshots();
        fetchStatus(adminKey);
      } else {
        setMessage({ type: 'error', text: data.error ?? 'Failed to delete snapshot' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Request failed: ${err}` });
    }
  };

  if (!isAuth) {
    return (
      <div>
        <Header title="Admin" subtitle="Data refresh management" />
        <div className="p-8 max-w-sm mx-auto">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center gap-2 text-gray-700">
              <Database className="w-5 h-5" />
              <span className="font-medium">Admin Access</span>
            </div>
            <p className="text-sm text-gray-500">
              Enter your admin key to access the data management interface.
            </p>
            <input
              type="password"
              value={adminKey}
              onChange={e => setAdminKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Admin key"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {message && (
              <p className="text-sm text-red-600">{message.text}</p>
            )}
            <button
              onClick={handleLogin}
              disabled={loading || !adminKey}
              className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Checking...' : 'Login'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Admin" subtitle="Data refresh management (restricted access)" />

      <div className="p-6 space-y-6">

        {message && (
          <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {message.text}
          </div>
        )}

        {/* Confirmation dialog */}
        {confirmAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full mx-4 p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{confirmAction.label}</h3>
                  <p className="text-sm text-gray-600 mt-2">{confirmAction.description}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmedAction}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Data Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-sm text-gray-500 mb-1">ABS Census LGAs</div>
            <div className="text-2xl font-semibold text-gray-900">{status?.absCacheCount ?? '—'}</div>
            <div className="text-xs text-gray-400 mt-1">
              Last refresh: {formatDate(status?.config.abs_last_refresh ?? null)}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-sm text-gray-500 mb-1">NSW Projection Records</div>
            <div className="text-2xl font-semibold text-gray-900">{status?.nswProjectionCount ?? '—'}</div>
            <div className="text-xs text-gray-400 mt-1">
              Last seed: {formatDate(status?.config.static_last_seed ?? null)}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-sm text-gray-500 mb-1">Refresh Interval</div>
            <div className="text-2xl font-semibold text-gray-900">
              {status?.config.abs_refresh_interval_days ?? '7'} days
            </div>
            <div className="text-xs text-gray-400 mt-1">Admin-adjustable</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-sm text-gray-500 mb-1">Queued Jobs</div>
            <div className="text-2xl font-semibold text-gray-900">{status?.jobSummary.queued ?? 0}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-sm text-gray-500 mb-1">Running Jobs</div>
            <div className="text-2xl font-semibold text-blue-600">{status?.jobSummary.running ?? 0}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-sm text-gray-500 mb-1">Successful Jobs</div>
            <div className="text-2xl font-semibold text-emerald-600">{status?.jobSummary.success ?? 0}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-sm text-gray-500 mb-1">Failed Jobs</div>
            <div className="text-2xl font-semibold text-red-600">{status?.jobSummary.error ?? 0}</div>
          </div>
        </div>

        {/* ABS Dataset Coverage */}
        {status?.datasetCoverage && status.datasetCoverage.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">ABS Dataset Coverage</h2>
            <p className="text-xs text-gray-500 mb-3">Expected: 128 LGAs per dataset. Datasets with gaps may need a re-seed.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {status.datasetCoverage
                .filter(ds => ds.count < ds.expected)
                .map(ds => (
                  <div key={ds.dataset} className="bg-amber-50 border border-amber-200 rounded px-2 py-1 text-xs">
                    <span className="font-mono font-medium">{ds.dataset}</span>
                    <span className="text-amber-700 ml-1">{ds.count}/{ds.expected}</span>
                  </div>
                ))}
              {status.datasetCoverage.filter(ds => ds.count >= ds.expected).length > 0 && (
                <div className="text-xs text-gray-400 flex items-center">
                  <CheckCircle className="w-3 h-3 mr-1 text-emerald-500" />
                  {status.datasetCoverage.filter(ds => ds.count >= ds.expected).length} complete
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Data Actions</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setConfirmAction({ action: 'seed_static', label: 'Seed Static Data', description: 'Reloads NSW DPE projections and TZP24 employment from bundled files (~5 sec).' })}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Seed Static Data
            </button>
            <button
              onClick={() => setConfirmAction({ action: 'seed_abs', label: 'Refresh All ABS Data', description: absRefreshDescription })}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh All ABS Data
            </button>
            <button
              onClick={() => fetchStatus(adminKey)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh Status
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">
              <strong>Seed Static Data</strong> — loads NSW DPE projections and TZP24 employment from bundled files (~5 sec)
            </p>
            <p className="text-xs text-gray-500">
              <strong>Refresh All ABS Data</strong> — fetches Census data for all {status?.absCacheCount ?? 128} LGAs from ABS API (~10-20 min, runs in background)
            </p>
          </div>
        </div>

        {/* Config */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Configuration</h2>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 w-48">Refresh interval (days):</label>
            <input
              type="number"
              value={intervalDays}
              onChange={e => setIntervalDays(e.target.value)}
              min="1"
              max="365"
              className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={saveInterval}
              disabled={loading}
              className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>

        {/* Refresh Log */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Queued Refresh Jobs</h2>
          {status?.recentJobs.length === 0 ? (
            <p className="text-sm text-gray-400">No background jobs yet. Queue a refresh to monitor job state here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Job</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Status</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Scope</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Queued</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Started</th>
                    <th className="text-left py-2 text-gray-500 font-medium">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {status?.recentJobs.map(job => (
                    <tr key={job.id} className="border-b border-gray-50 hover:bg-gray-50 align-top">
                      <td className="py-2 pr-4">
                        <div className="font-medium text-gray-700 capitalize">{job.jobType}</div>
                        <div className="text-xs text-gray-400">
                          Requested by {job.requestedBy} - attempt {job.attemptCount} of {job.maxAttempts}
                        </div>
                        {job.errorMessage && (
                          <div className="text-xs text-red-600 mt-1">{job.errorMessage}</div>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon status={job.status} />
                          <span className="capitalize text-gray-600">{job.status}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-gray-600">
                        {job.lgaId ? job.lgaId : 'All LGAs'}
                      </td>
                      <td className="py-2 pr-4 text-gray-500 text-xs">{formatDate(job.createdAt)}</td>
                      <td className="py-2 pr-4 text-gray-500 text-xs">{formatDate(job.startedAt)}</td>
                      <td className="py-2 text-gray-500 text-xs">{formatDate(job.completedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Recent Refresh Log</h2>
          {status?.recentLogs.length === 0 ? (
            <p className="text-sm text-gray-400">No refresh history yet. Run &quot;Seed Static Data&quot; to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Source</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Status</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">LGAs</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Changes</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Started</th>
                    <th className="text-left py-2 text-gray-500 font-medium">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {status?.recentLogs.map(log => (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50 align-top">
                      <td className="py-2 pr-4 font-medium text-gray-700 capitalize">{log.source}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon status={log.status} />
                          <span className="capitalize text-gray-600">{log.status}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-gray-600">{log.lgasUpdated}</td>
                      <td className="py-2 pr-4 text-gray-600 text-xs">
                        {log.changeSummary ? (
                          <div>
                            <div>LGAs: {log.changeSummary.before_abs_cache_count} → {log.changeSummary.after_abs_cache_count}</div>
                            {Object.keys(log.changeSummary.datasets_changed).length > 0 && (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                                  {Object.keys(log.changeSummary.datasets_changed).length} dataset{Object.keys(log.changeSummary.datasets_changed).length !== 1 ? 's' : ''} changed
                                </summary>
                                <div className="mt-1 ml-2 text-xs text-gray-500 space-y-0.5">
                                  {Object.entries(log.changeSummary.datasets_changed).map(([ds, { before, after }]) => (
                                    <div key={ds}>{ds}: {before} → {after} ({after > before ? '+' : ''}{after - before})</div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-gray-500 text-xs">{formatDate(log.startedAt)}</td>
                      <td className="py-2 text-gray-500 text-xs">{formatDate(log.completedAt)}</td>
                    </tr>
                  ))}
</tbody>
              </table>
            </div>
          )}

          {/* Data Snapshots */}
          <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Data Snapshots
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Tag the current data state so users can cite a specific version in professional documents.
            Activating a snapshot sets the &quot;Data as at&quot; label site-wide.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <input
              type="text"
              placeholder="Snapshot tag (e.g. v2026-Census-May)"
              value={newSnapshotTag}
              onChange={e => setNewSnapshotTag(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newSnapshotDesc}
              onChange={e => setNewSnapshotDesc(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <button
              onClick={createNewSnapshot}
              disabled={!newSnapshotTag.trim() || loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Create
            </button>
          </div>

          {snapshots.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="py-2 pr-4 font-medium text-gray-600">Tag</th>
                    <th className="py-2 pr-4 font-medium text-gray-600">Description</th>
                    <th className="py-2 pr-4 font-medium text-gray-600">ABS Cache</th>
                    <th className="py-2 pr-4 font-medium text-gray-600">Projections</th>
                    <th className="py-2 pr-4 font-medium text-gray-600">Created</th>
                    <th className="py-2 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map(snap => (
                    <tr key={snap.id} className={`border-b border-gray-100 ${
                      status?.config?.data_snapshot_tag === snap.tag ? 'bg-emerald-50' : ''
                    }`}>
                      <td className="py-2 pr-4 font-mono text-xs">{snap.tag}</td>
                      <td className="py-2 pr-4 text-xs text-gray-600">{snap.description || '—'}</td>
                      <td className="py-2 pr-4 text-xs">{snap.absCacheCount ?? '—'} LGAs</td>
                      <td className="py-2 pr-4 text-xs">{snap.projectionCount ?? '—'}</td>
                      <td className="py-2 pr-4 text-xs">{formatDate(snap.createdAt)}</td>
                      <td className="py-2 flex gap-1">
                        {status?.config?.data_snapshot_tag !== snap.tag && (
                          <button
                            onClick={() => activateSnapshot(snap.tag)}
                            className="px-2 py-1 text-xs bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 flex items-center gap-1"
                            title="Activate this snapshot"
                          >
                            <Bookmark className="w-3 h-3" />
                            Activate
                          </button>
                        )}
                        {status?.config?.data_snapshot_tag === snap.tag && (
                          <span className="px-2 py-1 text-xs bg-emerald-600 text-white rounded">Active</span>
                        )}
                        <button
                          onClick={() => deleteSnapshot(snap.tag)}
                          className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1"
                          title="Delete this snapshot"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No snapshots yet. Create one to tag the current data state.</p>
          )}


        </div>


      </div>
    </div>
  );
}


