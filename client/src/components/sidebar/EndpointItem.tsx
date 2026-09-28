import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { Pencil, Check, X, FolderInput, Power } from 'lucide-react';
import { useEndpointStore } from '../../stores/endpoint.store';
import { useCollectionStore } from '../../stores/collection.store';
import { useUIStore } from '../../stores/ui.store';
import { useTranslation } from '../../i18n';
import { HttpMethodBadge } from '../shared/HttpMethodBadge';
import { StatusCodeBadge } from '../shared/StatusCodeBadge';
import type { Endpoint } from '../../types';
import { buildFullUrl } from '../../utils/url';

export function EndpointItem({ endpoint }: { endpoint: Endpoint }) {
  const t = useTranslation();
  const selectedId = useEndpointStore(s => s.selectedId);
  const select = useEndpointStore(s => s.select);
  const deleteEndpoint = useEndpointStore(s => s.deleteEndpoint);
  const updateEndpoint = useEndpointStore(s => s.updateEndpoint);
  const toggleEnabled = useEndpointStore(s => s.toggleEnabled);
  const setShowHistory = useUIStore(s => s.setShowHistory);
  const editMode = useUIStore(s => s.editMode);
  const isChecked = useUIStore(s => s.selectedEndpointIds.includes(endpoint.id));
  const toggleEndpointSelection = useUIStore(s => s.toggleEndpointSelection);
  const collections = useCollectionStore(s => s.collections);
  const moveEndpoint = useCollectionStore(s => s.moveEndpoint);
  const removeEndpointFromCollection = useCollectionStore(s => s.removeEndpointFromCollection);
  const isSelected = selectedId === endpoint.id;
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const moveRef = useRef<HTMLDivElement>(null);

  // Inline alias editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(endpoint.name ?? '');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const activeVariant = endpoint.responseVariants?.find(v => v.id === endpoint.activeVariantId)
    ?? endpoint.responseVariants?.[0];

  const currentCollId = collections.find(c => c.endpointIds?.includes(endpoint.id))?.id ?? null;

  const label = endpoint.name || buildFullUrl(endpoint.path, endpoint.queryParams);

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

  // Entering edit mode swaps the row out from under an open popover or inline
  // editor, so close them before they are hidden rather than stranded.
  useEffect(() => {
    if (editMode) {
      setShowMoveMenu(false);
      setIsEditing(false);
    }
  }, [editMode]);

  // One definition for both branches: a one-sided tweak would give the same
  // endpoint two different looks depending on whether edit mode is on.
  const identity = (
    <div className={clsx('flex min-w-0 flex-1 items-center gap-2', !endpoint.isEnabled && 'opacity-40')}>
      <HttpMethodBadge method={endpoint.method} />
      <span className={clsx('flex-1 truncate text-sm text-text-secondary', !endpoint.name && 'font-mono')}>
        {label}
      </span>
    </div>
  );

  if (editMode) {
    return (
      <div
        onClick={() => toggleEndpointSelection(endpoint.id, currentCollId)}
        className={clsx(
          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left cursor-pointer',
          isChecked ? 'bg-bg-hover' : 'hover:bg-bg-hover',
        )}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => toggleEndpointSelection(endpoint.id, currentCollId)}
          onClick={e => e.stopPropagation()}
          className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-accent-primary"
        />
        {identity}
      </div>
    );
  }

  if (isEditing) {
    return (
      <div
        onClick={e => e.stopPropagation()}
        className="relative flex w-full items-center gap-1.5 rounded px-2 py-1.5 bg-bg-hover"
      >
        <HttpMethodBadge method={endpoint.method} />
        <input
          ref={nameInputRef}
          value={editName}
          onChange={e => setEditName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveEdit();
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
      onClick={() => { select(endpoint.id); setShowHistory(false); }}
      className={clsx(
        'group relative flex w-full items-center gap-2 rounded px-2 py-1.5 text-left cursor-pointer',
        isSelected ? 'bg-bg-hover' : 'hover:bg-bg-hover',
      )}
    >
      {/* Dim only the identity, never the actions — a disabled row must stay operable. */}
      {identity}
      {activeVariant && (
        <StatusCodeBadge
          code={activeVariant.statusCode}
          className={clsx(!endpoint.isEnabled && 'opacity-40', showMoveMenu ? 'hidden' : 'group-hover:hidden')}
        />
      )}
      <button
        type="button"
        role="switch"
        aria-checked={endpoint.isEnabled}
        aria-label={endpoint.isEnabled ? t.endpointItem.disable : t.endpointItem.enable}
        onClick={e => { e.stopPropagation(); toggleEnabled(endpoint.id); }}
        className={clsx(
          'items-center justify-center cursor-pointer',
          endpoint.isEnabled
            ? 'text-text-muted hover:text-accent-primary'
            : 'text-method-delete hover:text-accent-primary',
          // A disabled endpoint keeps its switch on screen, otherwise there is no visible way back.
          !endpoint.isEnabled || showMoveMenu ? 'flex' : 'hidden group-hover:flex',
        )}
        title={endpoint.isEnabled ? t.endpointItem.disable : t.endpointItem.enable}
      >
        <Power size={13} strokeWidth={2.5} />
      </button>
      <span
        onClick={startEdit}
        className={clsx(
          'items-center justify-center text-text-muted hover:text-accent-primary cursor-pointer',
          showMoveMenu ? 'flex' : 'hidden group-hover:flex',
        )}
        title={t.endpointItem.editAlias}
      >
        <Pencil size={13} strokeWidth={2.5} />
      </span>
      <div ref={moveRef} className={clsx(
        'relative items-center justify-center text-text-muted hover:text-text-secondary cursor-pointer',
        showMoveMenu ? 'flex' : 'hidden group-hover:flex',
      )}>
        <span
          onClick={e => { e.stopPropagation(); setShowMoveMenu(!showMoveMenu); }}
          title={t.endpointItem.moveToCollection}
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
              {t.endpointItem.uncollected}
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
        title={t.endpointItem.deleteEndpoint}
      >
        <X size={14} strokeWidth={2.5} />
      </span>
    </div>
  );
}
