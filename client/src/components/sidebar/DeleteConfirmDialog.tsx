import { useState, useEffect } from 'react';
import { useEndpointStore } from '../../stores/endpoint.store';
import { useCollectionStore } from '../../stores/collection.store';
import { useTranslation, fmt } from '../../i18n';
import { ModalOverlay } from '../shared/ModalOverlay';

interface Props {
  open: boolean;
  collectionIds: string[];
  /** Every endpoint to be deleted, including those a selected collection takes with it. */
  endpointIds: string[];
  onClose: () => void;
  /** Called once everything asked for is actually gone. Failures stay in the dialog. */
  onDone: () => void;
}

/**
 * Confirms and runs a collection/endpoint delete. Shared by the single X on a
 * collection row and the edit-mode bulk delete so both paths mean the same
 * thing, down to how a failure is reported.
 */
export function DeleteConfirmDialog({ open, collectionIds, endpointIds, onClose, onDone }: Props) {
  const t = useTranslation();
  const deleteEndpoint = useEndpointStore(s => s.deleteEndpoint);
  const removeCollection = useCollectionStore(s => s.remove);
  const collections = useCollectionStore(s => s.collections);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) setError(''); }, [open]);

  // The server deletes a collection's endpoints with it, in one transaction, so
  // only endpoints no selected collection covers need a request of their own.
  const cascaded = new Set(
    collections.filter(c => collectionIds.includes(c.id)).flatMap(c => c.endpointIds ?? []),
  );
  const standaloneEndpointIds = endpointIds.filter(id => !cascaded.has(id));

  const run = async () => {
    setDeleting(true);
    setError('');
    // allSettled so one id that is already gone cannot abort the rest.
    const results = await Promise.allSettled([
      ...standaloneEndpointIds.map(id => deleteEndpoint(id)),
      ...collectionIds.map(id => removeCollection(id)),
    ]);
    const failed = results.filter(r => r.status === 'rejected').length;
    setDeleting(false);
    if (failed > 0) {
      // Stay open: what succeeded is gone from the tree, and Delete retries the rest.
      setError(fmt(t.sidebar.deleteFailed, failed));
      return;
    }
    onDone();
  };

  return (
    <ModalOverlay open={open} onClose={() => { if (!deleting) onClose(); }}>
      <div className="w-[360px] rounded-lg border border-border-secondary bg-bg-surface p-6">
        <h2 className="mb-3 text-base font-semibold text-text-primary">{t.sidebar.confirmDeleteTitle}</h2>
        <ul className="mb-3 list-disc pl-5 text-sm text-text-secondary">
          {collectionIds.length > 0 && (
            <li>{fmt(t.sidebar.confirmDeleteCollections, collectionIds.length)}</li>
          )}
          {endpointIds.length > 0 && (
            <li>{fmt(t.sidebar.confirmDeleteEndpoints, endpointIds.length)}</li>
          )}
        </ul>
        {collectionIds.length > 0 && endpointIds.length > 0 && (
          <p className="mb-5 text-xs text-text-muted">{t.sidebar.confirmDeleteNote}</p>
        )}
        {error && <p className="mb-5 text-xs text-method-delete">{error}</p>}
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
