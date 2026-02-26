import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { Pencil, Check, X, FolderInput } from 'lucide-react';
import { useEndpointStore } from '../../stores/endpoint.store';
import { useCollectionStore } from '../../stores/collection.store';
import { useUIStore } from '../../stores/ui.store';
import { HttpMethodBadge } from '../shared/HttpMethodBadge';
import { StatusCodeBadge } from '../shared/StatusCodeBadge';
import type { Endpoint, HttpMethod } from '../../types';
import { buildFullUrl } from '../../utils/url';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

export function EndpointItem({ endpoint }: { endpoint: Endpoint }) {
  const selectedId = useEndpointStore(s => s.selectedId);
  const select = useEndpointStore(s => s.select);
  const deleteEndpoint = useEndpointStore(s => s.deleteEndpoint);
  const updateEndpoint = useEndpointStore(s => s.updateEndpoint);
  const setShowHistory = useUIStore(s => s.setShowHistory);
  const collections = useCollectionStore(s => s.collections);
  const moveEndpoint = useCollectionStore(s => s.moveEndpoint);
  const removeEndpointFromCollection = useCollectionStore(s => s.removeEndpointFromCollection);
  const isSelected = selectedId === endpoint.id;
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const moveRef = useRef<HTMLDivElement>(null);

  // Inline editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editMethod, setEditMethod] = useState<HttpMethod>(endpoint.method);
  const [editPath, setEditPath] = useState(endpoint.path);
  const [showMethodMenu, setShowMethodMenu] = useState(false);
  const methodMenuRef = useRef<HTMLDivElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);

  const activeVariant = endpoint.responseVariants?.find(v => v.id === endpoint.activeVariantId)
    ?? endpoint.responseVariants?.[0];

  const currentCollId = collections.find(c => c.endpointIds?.includes(endpoint.id))?.id ?? null;

  const handleMove = async (targetCollId: string | null) => {
    setShowMoveMenu(false);
    if (targetCollId === currentCollId) return;

    if (targetCollId === null && currentCollId) {
      await removeEndpointFromCollection(currentCollId, endpoint.id);
    } else if (targetCollId) {
      await moveEndpoint(endpoint.id, currentCollId, targetCollId, 0);
    }
  };

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditMethod(endpoint.method);
    setEditPath(endpoint.path);
    setIsEditing(true);
    setTimeout(() => pathInputRef.current?.focus(), 0);
  };

  const saveEdit = async () => {
    const trimmed = editPath.trim();
    if (!trimmed) { cancelEdit(); return; }
    if (editMethod !== endpoint.method || trimmed !== endpoint.path) {
      try {
        await updateEndpoint(endpoint.id, { method: editMethod, path: trimmed });
      } catch { /* ignore */ }
    }
    setIsEditing(false);
    setShowMethodMenu(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setShowMethodMenu(false);
  };

  useEffect(() => {
    if (!showMoveMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) {
        setShowMoveMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMoveMenu]);

  useEffect(() => {
    if (!showMethodMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (methodMenuRef.current && !methodMenuRef.current.contains(e.target as Node)) {
        setShowMethodMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMethodMenu]);

  if (isEditing) {
    return (
      <div
        onClick={e => e.stopPropagation()}
        className="relative flex w-full items-center gap-1.5 rounded px-2 py-1.5 bg-bg-hover"
      >
        <div ref={methodMenuRef} className="relative">
          <div
            onClick={() => setShowMethodMenu(!showMethodMenu)}
            className="cursor-pointer"
          >
            <HttpMethodBadge method={editMethod} />
          </div>
          {showMethodMenu && (
            <div className="absolute left-0 top-full mt-1 z-50 rounded border border-border-secondary bg-bg-surface py-1 shadow-lg">
              {METHODS.map(m => (
                <div
                  key={m}
                  onClick={() => { setEditMethod(m); setShowMethodMenu(false); }}
                  className={clsx(
                    'px-3 py-1 text-xs font-mono font-bold cursor-pointer hover:bg-bg-hover whitespace-nowrap',
                    m === editMethod ? 'text-accent-primary' : 'text-text-secondary',
                  )}
                >
                  {m}
                </div>
              ))}
            </div>
          )}
        </div>
        <input
          ref={pathInputRef}
          value={editPath}
          onChange={e => setEditPath(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') cancelEdit();
          }}
          className="flex-1 min-w-0 rounded border border-border-secondary bg-bg-input px-1.5 py-0.5 text-xs text-text-primary font-mono outline-none focus:border-accent-primary"
        />
        <span
          onClick={saveEdit}
          className="text-text-muted hover:text-accent-primary cursor-pointer flex items-center"
          title="Save"
        >
          <Check size={14} strokeWidth={2.5} />
        </span>
        <span
          onClick={cancelEdit}
          className="text-text-muted hover:text-method-delete cursor-pointer flex items-center"
          title="Cancel"
        >
          <X size={14} strokeWidth={2.5} />
        </span>
      </div>
    );
  }

  return (
    <div
      onClick={() => { select(endpoint.id); setShowHistory(false); }}
      className={clsx(
        'group relative flex w-full items-center gap-2 rounded px-2 py-1.5 text-left cursor-pointer',
        isSelected ? 'bg-bg-hover' : 'hover:bg-bg-hover',
        !endpoint.isEnabled && 'opacity-40',
      )}
    >
      <HttpMethodBadge method={endpoint.method} />
      <span className={clsx('flex-1 truncate text-sm text-text-secondary', !endpoint.name && 'font-mono')}>
        {endpoint.name || buildFullUrl(endpoint.path, endpoint.queryParams)}
      </span>
      {activeVariant && (
        <StatusCodeBadge code={activeVariant.statusCode} className={clsx(showMoveMenu ? 'hidden' : 'group-hover:hidden')} />
      )}
      <span
        onClick={startEdit}
        className={clsx(
          'items-center justify-center text-text-muted hover:text-accent-primary cursor-pointer',
          showMoveMenu ? 'flex' : 'hidden group-hover:flex',
        )}
        title="Edit Endpoint"
      >
        <Pencil size={13} strokeWidth={2.5} />
      </span>
      <div ref={moveRef} className={clsx(
        'relative items-center justify-center text-text-muted hover:text-text-secondary cursor-pointer',
        showMoveMenu ? 'flex' : 'hidden group-hover:flex',
      )}>
        <span
          onClick={e => { e.stopPropagation(); setShowMoveMenu(!showMoveMenu); }}
          title="Move to Collection"
          className="flex items-center"
        >
          <FolderInput size={13} strokeWidth={2.5} />
        </span>
        {showMoveMenu && (
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded border border-border-secondary bg-bg-surface py-1 shadow-lg">
            <div
              onClick={e => { e.stopPropagation(); handleMove(null); }}
              className={clsx(
                'px-3 py-1.5 text-xs cursor-pointer hover:bg-bg-hover',
                !currentCollId ? 'text-accent-primary font-medium' : 'text-text-secondary',
              )}
            >
              Uncollected
            </div>
            {collections.map(c => (
              <div
                key={c.id}
                onClick={e => { e.stopPropagation(); handleMove(c.id); }}
                className={clsx(
                  'px-3 py-1.5 text-xs cursor-pointer hover:bg-bg-hover',
                  currentCollId === c.id ? 'text-accent-primary font-medium' : 'text-text-secondary',
                )}
              >
                {c.name}
              </div>
            ))}
          </div>
        )}
      </div>
      <span
        onClick={e => { e.stopPropagation(); deleteEndpoint(endpoint.id); }}
        className={clsx(
          'items-center justify-center text-text-muted hover:text-method-delete cursor-pointer',
          showMoveMenu ? 'flex' : 'hidden group-hover:flex',
        )}
        title="Delete Endpoint"
      >
        <X size={14} strokeWidth={2.5} />
      </span>
    </div>
  );
}
