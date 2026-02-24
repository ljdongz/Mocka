import { useState } from 'react';
import { X } from 'lucide-react';
import { useEndpointStore } from '../../stores/endpoint.store';
import { useCollectionStore } from '../../stores/collection.store';
import { useUIStore } from '../../stores/ui.store';
import { useSettingsStore } from '../../stores/settings.store';
import { ModalOverlay } from '../shared/ModalOverlay';
import type { HttpMethod } from '../../types';
import { validatePath } from '../../utils/validation';
import clsx from 'clsx';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: 'bg-method-get text-white',
  POST: 'bg-method-post text-white',
  PUT: 'bg-method-put text-white',
  DELETE: 'bg-method-delete text-white',
  PATCH: 'bg-method-patch text-white',
};

const METHOD_INACTIVE: Record<HttpMethod, string> = {
  GET: 'bg-bg-input text-text-secondary hover:bg-method-get-bg hover:text-method-get',
  POST: 'bg-bg-input text-text-secondary hover:bg-method-post-bg hover:text-method-post',
  PUT: 'bg-bg-input text-text-secondary hover:bg-method-put-bg hover:text-method-put',
  DELETE: 'bg-bg-input text-text-secondary hover:bg-method-delete-bg hover:text-method-delete',
  PATCH: 'bg-bg-input text-text-secondary hover:bg-method-patch-bg hover:text-method-patch',
};

export function NewEndpointModal() {
  const open = useUIStore(s => s.showNewEndpoint);
  const close = () => useUIStore.getState().setShowNewEndpoint(false);
  const createEndpoint = useEndpointStore(s => s.createEndpoint);
  const collections = useCollectionStore(s => s.collections);
  const fetchCollections = useCollectionStore(s => s.fetch);

  const defaultCollectionId = useUIStore(s => s.newEndpointCollectionId);

  const serverStatus = useSettingsStore(s => s.serverStatus);

  const [method, setMethod] = useState<HttpMethod>('GET');
  const [path, setPath] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Sync default collection when modal opens
  if (open && !initialized) {
    setCollectionId(defaultCollectionId);
    setInitialized(true);
  }
  if (!open && initialized) {
    setInitialized(false);
  }

  const handleSubmit = async () => {
    const pathError = validatePath(path);
    if (pathError) { setError(pathError); return; }
    try {
      await createEndpoint(method, path.trim(), collectionId || undefined);
      if (collectionId) {
        await fetchCollections();
      }
      setPath('');
      setMethod('GET');
      setCollectionId('');
      setError('');
      close();
    } catch (e: any) {
      setError(e.message || 'Failed to create endpoint');
    }
  };

  return (
    <ModalOverlay open={open} onClose={close}>
      <div className="w-[480px] rounded-lg border border-border-secondary bg-bg-surface p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-text-primary">New Endpoint</h2>
          <button onClick={close} className="text-text-muted hover:text-text-secondary flex items-center">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-text-tertiary mb-2">HTTP Method</label>
          <div className="flex gap-2">
            {METHODS.map(m => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={clsx(
                  'rounded px-4 py-1.5 text-sm font-bold font-mono transition-colors',
                  method === m ? METHOD_STYLES[m] : METHOD_INACTIVE[m],
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-text-tertiary mb-2">Endpoint Path</label>
          <input
            type="text"
            value={path}
            onChange={e => { setPath(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            className="w-full rounded border border-border-secondary bg-bg-input px-3 py-2 text-sm text-text-primary font-mono outline-none focus:border-accent-primary"
            placeholder="/api/example"
            autoFocus
          />
          <p className="mt-1.5 text-xs text-text-muted font-mono break-all">
            {`http://${serverStatus.localIp}:${serverStatus.port}${path || '/api/example'}`}
          </p>
        </div>

        {collections.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm text-text-tertiary mb-2">Collection (optional)</label>
            <select
              value={collectionId}
              onChange={e => setCollectionId(e.target.value)}
              className="w-full rounded border border-border-secondary bg-bg-input px-3 py-2 text-sm text-text-primary outline-none"
            >
              <option value="">None</option>
              {collections.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {error && <p className="mb-3 text-sm text-method-delete">{error}</p>}

        <div className="flex justify-end gap-3">
          <button onClick={close} className="rounded px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="rounded bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Create
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
