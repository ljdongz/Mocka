import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { Pencil, Check, X } from 'lucide-react';
import { useWsEndpointStore } from '../../stores/ws-endpoint.store';
import { useEndpointStore } from '../../stores/endpoint.store';
import { useUIStore } from '../../stores/ui.store';
import { useTranslation } from '../../i18n';
import type { WsEndpoint } from '../../types';

export function WsEndpointItem({ endpoint }: { endpoint: WsEndpoint }) {
  const t = useTranslation();
  const selectedId = useWsEndpointStore(s => s.selectedId);
  const select = useWsEndpointStore(s => s.select);
  const deleteEndpoint = useWsEndpointStore(s => s.deleteEndpoint);
  const updateEndpoint = useWsEndpointStore(s => s.updateEndpoint);
  const selectHttp = useEndpointStore(s => s.select);
  const setShowHistory = useUIStore(s => s.setShowHistory);
  const isSelected = selectedId === endpoint.id;

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(endpoint.name ?? '');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(endpoint.name ?? '');
    setIsEditing(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const saveEdit = async () => {
    const trimmed = editName.trim();
    if (trimmed !== (endpoint.name ?? '')) {
      try {
        await updateEndpoint(endpoint.id, { name: trimmed });
      } catch { /* ignore */ }
    }
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div
        onClick={e => e.stopPropagation()}
        className="relative flex w-full items-center gap-1.5 rounded px-2 py-1.5 bg-bg-hover"
      >
        <WsBadge />
        <input
          ref={nameInputRef}
          value={editName}
          onChange={e => setEditName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') cancelEdit();
          }}
          onBlur={saveEdit}
          placeholder={endpoint.path}
          className="flex-1 min-w-0 rounded border border-border-secondary bg-bg-input px-1.5 py-0.5 text-xs text-text-primary outline-none focus:border-accent-primary"
        />
        <span
          onClick={saveEdit}
          className="text-text-muted hover:text-accent-primary cursor-pointer flex items-center"
          title={t.common.save}
        >
          <Check size={14} strokeWidth={2.5} />
        </span>
        <span
          onClick={cancelEdit}
          className="text-text-muted hover:text-method-delete cursor-pointer flex items-center"
          title={t.common.cancel}
        >
          <X size={14} strokeWidth={2.5} />
        </span>
      </div>
    );
  }

  return (
    <div
      onClick={() => { select(endpoint.id); selectHttp(null); setShowHistory(false); }}
      className={clsx(
        'group relative flex w-full items-center gap-2 rounded px-2 py-1.5 text-left cursor-pointer',
        isSelected ? 'bg-bg-hover' : 'hover:bg-bg-hover',
        !endpoint.isEnabled && 'opacity-40',
      )}
    >
      <WsBadge />
      <span className={clsx('flex-1 truncate text-sm text-text-secondary', !endpoint.name && 'font-mono')}>
        {endpoint.name || endpoint.path}
      </span>
      <span
        onClick={startEdit}
        className="hidden group-hover:flex items-center justify-center text-text-muted hover:text-accent-primary cursor-pointer"
        title={t.endpointItem.editAlias}
      >
        <Pencil size={13} strokeWidth={2.5} />
      </span>
      <span
        onClick={e => { e.stopPropagation(); deleteEndpoint(endpoint.id); }}
        className="hidden group-hover:flex items-center justify-center text-text-muted hover:text-method-delete cursor-pointer"
        title={t.endpointItem.deleteEndpoint}
      >
        <X size={14} strokeWidth={2.5} />
      </span>
    </div>
  );
}

function WsBadge() {
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold bg-accent-primary/15 text-accent-primary flex-shrink-0">
      WS
    </span>
  );
}
