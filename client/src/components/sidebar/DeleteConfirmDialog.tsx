import { useState } from 'react';
import { useEndpointStore } from '../../stores/endpoint.store';
import { useCollectionStore } from '../../stores/collection.store';
import { useTranslation } from '../../i18n';
import { ModalOverlay } from '../shared/ModalOverlay';

interface Props {
  open: boolean;
  collectionIds: string[];
  /** Every endpoint to delete, including those pulled in by a selected collection. */
  endpointIds: string[];
  onClose: () => void;
  /** Called after the deletes settle; `failed` is how many rejected. */
  onDone: (failed: number) => void;
}

/**
 * Confirms and runs a collection/endpoint delete. Shared by the single X on a
 * collection row and the edit-mode bulk delete so both paths mean the same thing.
 */
export function DeleteConfirmDialog({ open, collectionIds, endpointIds, onClose, onDone }: Props) {
  const t = useTranslation();
  const deleteEndpoint = useEndpointStore(s => s.deleteEndpoint);
  const removeCollection = useCollectionStore(s => s.remove);
  const [deleting, setDeleting] = useState(false);

  const run = async () => {
    setDeleting(true);
    // Endpoints first so deleteEndpoint's selectedId reset and the server-side
    // sequence cleanup run per endpoint; allSettled keeps one stale id from
    // aborting the rest.
    const results = await Promise.allSettled([
      ...endpointIds.map(id => deleteEndpoint(id)),
      ...collectionIds.map(id => removeCollection(id)),
    ]);
    setDeleting(false);
    onDone(results.filter(r => r.status === 'rejected').length);
  };

  return (
    <ModalOverlay open={open} onClose={() => { if (!deleting) onClose(); }}>
      <div className="w-[360px] rounded-lg border border-border-secondary bg-bg-surface p-6">
        <h2 className="mb-3 text-base font-semibold text-text-primary">{t.sidebar.confirmDeleteTitle}</h2>
        <ul className="mb-3 list-disc pl-5 text-sm text-text-secondary">
          {collectionIds.length > 0 && (
            <li>{t.sidebar.confirmDeleteCollections.replace('{0}', String(collectionIds.length))}</li>
          )}
          {endpointIds.length > 0 && (
            <li>{t.sidebar.confirmDeleteEndpoints.replace('{0}', String(endpointIds.length))}</li>
          )}
        </ul>
        {collectionIds.length > 0 && endpointIds.length > 0 && (
          <p className="mb-5 text-xs text-text-muted">{t.sidebar.confirmDeleteNote}</p>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={deleting}
            className="rounded px-4 py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={run}
            disabled={deleting}
            className="rounded bg-method-delete px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
          >
            {t.common.delete}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
