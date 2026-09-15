import { useState } from 'react';
import { X } from 'lucide-react';
import { useStompStore } from '../../stores/stomp.store';
import { useUIStore } from '../../stores/ui.store';
import { useSettingsStore } from '../../stores/settings.store';
import { ModalOverlay } from '../shared/ModalOverlay';
import { useTranslation } from '../../i18n';

export function NewStompConnectionModal() {
  const t = useTranslation();
  const open = useUIStore(s => s.showNewStompConnection);
  const close = () => useUIStore.getState().setShowNewStompConnection(false);
  const createConnection = useStompStore(s => s.createConnection);
  const serverStatus = useSettingsStore(s => s.serverStatus);

  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const reset = () => { setPath(''); setName(''); setError(''); };

  const handleSubmit = async () => {
    if (!path.trim()) { setError(t.stomp.pathRequired); return; }
    try {
      await createConnection({ path: path.trim(), name: name.trim() || undefined });
      reset();
      close();
    } catch (e: any) {
      setError(e.message || t.stomp.failedToCreate);
    }
  };

  const handleClose = () => { reset(); close(); };
  const preview = path.trim() ? (path.startsWith('/') ? path : `/${path}`) : '/api/app/ws/chat';

  return (
    <ModalOverlay open={open} onClose={handleClose}>
      <div className="w-[480px] rounded-lg border border-border-secondary bg-bg-surface p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-text-primary">{t.stomp.newConnection}</h2>
          <button onClick={handleClose} className="text-text-muted hover:text-text-secondary flex items-center">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-text-tertiary mb-2">{t.stomp.path}</label>
          <input
            type="text"
            value={path}
            onChange={e => { setPath(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            className="w-full rounded border border-border-secondary bg-bg-input px-3 py-2 text-sm text-text-primary font-mono outline-none focus:border-accent-primary"
            placeholder="/api/app/ws/chat"
            autoFocus
          />
          <p className="mt-1.5 text-xs text-text-muted font-mono break-all">
            {`ws://${serverStatus.localIp}:${serverStatus.port}${preview}`}
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-text-tertiary mb-2">{t.stomp.name}</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            className="w-full rounded border border-border-secondary bg-bg-input px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary"
            placeholder="e.g. Chat"
          />
        </div>

        {error && <p className="mb-3 text-sm text-method-delete">{error}</p>}

        <div className="flex justify-end gap-3">
          <button onClick={handleClose} className="rounded px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
            {t.common.cancel}
          </button>
          <button onClick={handleSubmit} className="rounded bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110">
            {t.common.create}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
