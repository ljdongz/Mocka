import { useState } from 'react';
import { Plus, FolderPlus, ListChecks, Trash2 } from 'lucide-react';
import { useSettingsStore } from '../../stores/settings.store';
import { useUIStore } from '../../stores/ui.store';
import { useTranslation } from '../../i18n';
import { CollectionTree } from './CollectionTree';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

export function Sidebar() {
  const t = useTranslation();
  const serverStatus = useSettingsStore(s => s.serverStatus);
  const showHistory = useUIStore(s => s.showHistory);
  const setShowNewEndpoint = useUIStore(s => s.setShowNewEndpoint);
  const setShowNewCollection = useUIStore(s => s.setShowNewCollection);
  const editMode = useUIStore(s => s.editMode);
  const setEditMode = useUIStore(s => s.setEditMode);
  const selectedCollectionIds = useUIStore(s => s.selectedCollectionIds);
  const selectedEndpointIds = useUIStore(s => s.selectedEndpointIds);
  const clearSelection = useUIStore(s => s.clearSelection);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');

  const panelTitle = showHistory ? t.sidebar.history : t.sidebar.collections;
  const selectedCount = selectedCollectionIds.length + selectedEndpointIds.length;

  const handleDeleted = (failed: number) => {
    setConfirmOpen(false);
    clearSelection();
    if (failed > 0) {
      // Stay in edit mode so the rows that survived are still in reach.
      setError(t.sidebar.deleteFailed.replace('{0}', String(failed)));
    } else {
      setEditMode(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-bg-sidebar">
      {/* Header */}
      <div className="flex flex-col px-3 pt-3 pb-2">
        <span className="text-sm font-bold text-text-primary tracking-tight">Mocka</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`h-1.5 w-1.5 rounded-full ${serverStatus.running ? 'bg-server-running' : 'bg-server-stopped'}`} />
          <span className="text-[11px] text-text-tertiary font-mono">
            {serverStatus.localIp}:{serverStatus.port}
          </span>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{panelTitle}</span>
          {!showHistory && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setEditMode(!editMode); setError(''); }}
                className={`flex items-center rounded p-0.5 hover:bg-bg-hover ${editMode ? 'text-accent-primary' : 'text-text-muted hover:text-text-secondary'}`}
                title={editMode ? t.sidebar.exitEditMode : t.sidebar.editMode}
              >
                <ListChecks size={14} strokeWidth={2} />
              </button>
              {!editMode && (
                <button
                  onClick={() => setShowNewCollection(true)}
                  className="flex items-center rounded p-0.5 text-text-muted hover:bg-bg-hover hover:text-text-secondary"
                  title={t.sidebar.newCollection}
                >
                  <FolderPlus size={14} strokeWidth={2} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Collection tree */}
      <div className="flex-1 overflow-y-auto px-2">
        <CollectionTree />
      </div>

      {/* Footer */}
      <div className="border-t border-border-primary p-2 flex flex-col gap-1">
        {error && <span className="px-1 text-[11px] text-method-delete">{error}</span>}
        {editMode ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate px-1 text-xs text-text-tertiary">
              {t.sidebar.selectedCount.replace('{0}', String(selectedCount))}
            </span>
            <button
              onClick={() => setEditMode(false)}
              className="rounded px-2 py-1.5 text-xs text-text-secondary hover:bg-bg-hover"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={selectedCount === 0}
              className="flex items-center gap-1 rounded bg-method-delete px-2.5 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={13} strokeWidth={2.5} />
              {t.sidebar.deleteSelected}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewEndpoint(true)}
            className="flex w-full items-center gap-1.5 rounded px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover"
          >
            <Plus size={14} strokeWidth={2} />
            {t.sidebar.newEndpoint}
          </button>
        )}
      </div>

      <DeleteConfirmDialog
        open={confirmOpen}
        collectionIds={selectedCollectionIds}
        endpointIds={selectedEndpointIds}
        onClose={() => setConfirmOpen(false)}
        onDone={handleDeleted}
      />
    </div>
  );
}
