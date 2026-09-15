import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Pencil, X, Power, Upload, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { useSettingsStore } from '../../stores/settings.store';
import { useStompStore } from '../../stores/stomp.store';
import { useUIStore } from '../../stores/ui.store';
import { useTranslation, fmt } from '../../i18n';
import { TriggerBadge } from './badges';
import type { StompConnection, StompDestination } from '../../types';

export function StompSidebar() {
  const t = useTranslation();
  const serverStatus = useSettingsStore(s => s.serverStatus);
  const connections = useStompStore(s => s.connections);
  const stats = useStompStore(s => s.stats);
  const selectedConnectionId = useStompStore(s => s.selectedConnectionId);
  const selectedDestinationId = useStompStore(s => s.selectedDestinationId);
  const select = useStompStore(s => s.select);
  const updateConnection = useStompStore(s => s.updateConnection);
  const deleteConnection = useStompStore(s => s.deleteConnection);
  const toggleConnection = useStompStore(s => s.toggleConnection);
  const deleteDestination = useStompStore(s => s.deleteDestination);
  const importConnection = useStompStore(s => s.importConnection);
  const setShowNewStompConnection = useUIStore(s => s.setShowNewStompConnection);
  const setShowNewStompDestination = useUIStore(s => s.setShowNewStompDestination);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<{ text: string; error: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleCollapsed = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const startRename = (c: StompConnection) => { setEditingId(c.id); setEditName(c.name); };
  const commitRename = (id: string) => {
    const name = editName.trim();
    const current = connections.find(c => c.id === id);
    if (current && name !== current.name) updateConnection(id, { name });
    setEditingId(null);
  };

  const handleImportFile = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      await importConnection(json, 'overwrite');
      const path: string | undefined = json?.connection?.path;
      const imported = useStompStore.getState().connections.find(c => c.path === path);
      if (imported) select(imported.id, null);
      setImportMessage({ text: fmt(t.stomp.imported, path ?? ''), error: false });
    } catch (e: any) {
      setImportMessage({ text: fmt(t.stomp.importFailed, e.message ?? String(e)), error: true });
    }
    setTimeout(() => setImportMessage(null), 4000);
  };

  const subscriberCount = (c: StompConnection, d: StompDestination): number | undefined => stats[c.id]?.subscribers?.[d.id];

  return (
    <div className="flex h-full flex-col bg-bg-sidebar">
      {/* Header */}
      <div className="flex flex-col px-3 pt-3 pb-2">
        <span className="text-sm font-bold text-text-primary tracking-tight">Mocka</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`h-1.5 w-1.5 rounded-full ${serverStatus.running ? 'bg-server-running' : 'bg-server-stopped'}`} />
          <span className="text-[11px] text-text-tertiary font-mono">
            ws://{serverStatus.localIp}:{serverStatus.port}
          </span>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t.stomp.connections}</span>
          <button
            onClick={() => setShowNewStompConnection(true)}
            className="flex items-center rounded p-0.5 text-text-muted hover:bg-bg-hover hover:text-text-secondary"
            title={t.stomp.newConnection}
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-2">
        <div className="flex flex-col gap-1 py-1">
          {connections.length === 0 && (
            <p className="px-2 py-4 text-xs text-text-muted leading-relaxed">{t.stomp.noConnections}</p>
          )}
          {connections.map(c => {
            const isOpen = !collapsed.has(c.id);
            const isSelected = selectedConnectionId === c.id && !selectedDestinationId;
            return (
              <div key={c.id}>
                <div
                  className={clsx(
                    'flex items-center gap-1.5 rounded px-2 py-1.5 text-sm cursor-pointer',
                    isSelected ? 'bg-bg-hover' : 'hover:bg-bg-hover',
                    !c.isEnabled && 'opacity-50',
                  )}
                  onClick={() => select(c.id, null)}
                  onMouseEnter={() => setHoveredId(c.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <span
                    className="text-text-muted flex items-center"
                    onClick={e => { e.stopPropagation(); toggleCollapsed(c.id); }}
                  >
                    {isOpen ? <ChevronDown size={14} strokeWidth={2.5} /> : <ChevronRight size={14} strokeWidth={2.5} />}
                  </span>
                  {editingId === c.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => commitRename(c.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitRename(c.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 bg-bg-input text-text-primary text-xs px-1 py-0.5 rounded border border-accent-primary outline-none"
                    />
                  ) : (
                    <span className="flex-1 min-w-0 flex flex-col leading-tight">
                      <span className="font-medium text-text-primary truncate">{c.name || c.path}</span>
                      {c.name && <span className="text-[11px] text-text-muted font-mono truncate">{c.path}</span>}
                    </span>
                  )}
                  {hoveredId === c.id && editingId !== c.id ? (
                    <div className="flex gap-1.5 items-center">
                      <button
                        onClick={e => { e.stopPropagation(); setShowNewStompDestination(true, c.id); }}
                        className="text-text-muted hover:text-text-secondary flex items-center"
                        title={t.stomp.newDestination}
                      >
                        <Plus size={14} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); startRename(c); }}
                        className="text-text-muted hover:text-text-secondary flex items-center"
                        title={t.stomp.rename}
                      >
                        <Pencil size={13} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); toggleConnection(c.id); }}
                        className={clsx('flex items-center', c.isEnabled ? 'text-text-muted hover:text-method-post' : 'text-method-delete hover:text-method-get')}
                        title={t.stomp.toggle}
                      >
                        <Power size={13} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteConnection(c.id); }}
                        className="text-text-muted hover:text-method-delete flex items-center"
                        title={t.stomp.deleteConnection}
                      >
                        <X size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  ) : (
                    editingId !== c.id && (
                      <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0', c.isEnabled ? 'bg-server-running' : 'bg-server-stopped')} />
                    )
                  )}
                </div>

                {isOpen && (
                  <div className="ml-4">
                    {c.destinations.length === 0 && (
                      <div className="px-2 py-1 text-[11px] text-text-muted">{t.stomp.noDestinations}</div>
                    )}
                    {c.destinations.map(d => {
                      const count = subscriberCount(c, d);
                      const warn = count === 0 && d.trigger !== 'send' && c.isEnabled;
                      return (
                        <div
                          key={d.id}
                          onClick={() => select(c.id, d.id)}
                          className={clsx(
                            'group flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer',
                            selectedDestinationId === d.id ? 'bg-bg-hover' : 'hover:bg-bg-hover',
                            !d.isEnabled && 'opacity-40',
                          )}
                        >
                          <TriggerBadge trigger={d.trigger} compact />
                          <span className={clsx('flex-1 truncate text-text-secondary', !d.name && 'font-mono text-xs')}>
                            {d.name || d.pattern}
                          </span>
                          {warn ? (
                            <span className="text-method-post flex items-center group-hover:hidden" title={t.stomp.noSubscribers}>
                              <AlertTriangle size={12} strokeWidth={2.5} />
                            </span>
                          ) : (
                            count !== undefined && count > 0 && (
                              <span className="text-[10px] font-mono text-text-muted group-hover:hidden" title={fmt(t.stomp.subscribers, count)}>{count}</span>
                            )
                          )}
                          <span
                            onClick={e => { e.stopPropagation(); deleteDestination(d.id); }}
                            className="hidden group-hover:flex items-center text-text-muted hover:text-method-delete"
                            title={t.stomp.deleteDestination}
                          >
                            <X size={14} strokeWidth={2.5} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border-primary p-2 flex flex-col gap-1">
        <button
          onClick={() => setShowNewStompConnection(true)}
          className="flex w-full items-center gap-1.5 rounded px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover"
        >
          <Plus size={14} strokeWidth={2} />
          {t.stomp.newConnection}
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center gap-1.5 rounded px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover"
        >
          <Upload size={14} strokeWidth={2} />
          {t.stomp.importConnection}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
            e.target.value = '';
          }}
        />
        {importMessage && (
          <p className={clsx('px-3 text-xs break-all', importMessage.error ? 'text-method-delete' : 'text-method-get')}>{importMessage.text}</p>
        )}
      </div>
    </div>
  );
}
