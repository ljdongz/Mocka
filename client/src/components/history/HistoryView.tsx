import { useEffect } from 'react';
import { useHistoryStore } from '../../stores/history.store';
import { useSettingsStore } from '../../stores/settings.store';
import { HttpMethodBadge } from '../shared/HttpMethodBadge';
import { StatusCodeBadge } from '../shared/StatusCodeBadge';
import { HistoryDetail } from './HistoryDetail';
import type { HttpMethod } from '../../types';
import clsx from 'clsx';

const METHODS = ['', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

export function HistoryView() {
  const records = useHistoryStore(s => s.records);
  const selectedRecord = useHistoryStore(s => s.selectedRecord);
  const selectRecord = useHistoryStore(s => s.selectRecord);
  const filterMethod = useHistoryStore(s => s.filterMethod);
  const search = useHistoryStore(s => s.search);
  const setFilterMethod = useHistoryStore(s => s.setFilterMethod);
  const setSearch = useHistoryStore(s => s.setSearch);
  const clearAll = useHistoryStore(s => s.clearAll);
  const fetch = useHistoryStore(s => s.fetch);
  const serverStatus = useSettingsStore(s => s.serverStatus);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-primary px-6 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-text-primary">Request History</h2>
          <span className={clsx('flex items-center gap-1.5 text-xs', serverStatus.running ? 'text-server-running' : 'text-server-stopped')}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', serverStatus.running ? 'bg-server-running' : 'bg-server-stopped')} />
            {serverStatus.running ? 'Server Running' : 'Server Stopped'}
          </span>
        </div>
        <button
          onClick={clearAll}
          className="rounded px-3 py-1.5 text-sm text-method-delete bg-[#EF444418] hover:bg-[#EF444430]"
        >
          Clear All
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 border-b border-border-primary px-6 py-2">
        <input
          type="text"
          placeholder="Search Requests..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 rounded border border-border-secondary bg-bg-input px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
        />
        <select
          value={filterMethod}
          onChange={e => setFilterMethod(e.target.value)}
          className="rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none"
        >
          {METHODS.map(m => (
            <option key={m} value={m}>{m || 'All Methods'}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-bg-surface border-b border-border-primary">
              <tr className="text-left text-text-muted">
                <th className="px-4 py-2 font-medium w-16">Time</th>
                <th className="px-4 py-2 font-medium w-16">Method</th>
                <th className="px-4 py-2 font-medium">Path</th>
                <th className="px-4 py-2 font-medium w-16">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr
                  key={r.id}
                  onClick={() => selectRecord(r)}
                  className={clsx(
                    'cursor-pointer border-b border-border-primary',
                    selectedRecord?.id === r.id ? 'bg-bg-hover' : 'hover:bg-bg-hover',
                  )}
                >
                  <td className="px-4 py-2 text-text-muted font-mono">
                    {new Date(r.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                  </td>
                  <td className="px-4 py-2">
                    <HttpMethodBadge method={r.method as HttpMethod} />
                  </td>
                  <td className="px-4 py-2 text-text-secondary font-mono truncate max-w-[400px]">{r.path}</td>
                  <td className="px-4 py-2">
                    <StatusCodeBadge code={r.statusCode} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {records.length === 0 && (
            <div className="flex items-center justify-center py-20 text-text-muted text-sm">
              No requests recorded yet.
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedRecord && (
          <div className="w-[400px] border-l border-border-primary overflow-y-auto">
            <HistoryDetail record={selectedRecord} onClose={() => selectRecord(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
