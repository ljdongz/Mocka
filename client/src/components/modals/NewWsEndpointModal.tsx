import { useState } from 'react';
import { X } from 'lucide-react';
import { useWsEndpointStore } from '../../stores/ws-endpoint.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useUIStore } from '../../stores/ui.store';
import { ModalOverlay } from '../shared/ModalOverlay';
import { useTranslation } from '../../i18n';

export function NewWsEndpointModal() {
  const t = useTranslation();
  const open = useUIStore(s => s.showNewWsEndpoint);
  const close = () => useUIStore.getState().setShowNewWsEndpoint(false);
  const createEndpoint = useWsEndpointStore(s => s.createEndpoint);
  const serverStatus = useSettingsStore(s => s.serverStatus);

  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const trimmed = path.trim();
    if (!trimmed) { setError(t.validation.pathRequired); return; }
    if (!trimmed.startsWith('/')) { setError(t.validation.pathRequired); return; }
    try {
      await createEndpoint(trimmed, name.trim() || undefined);
      setPath('');
      setName('');
      setError('');
      close();
    } catch (e: any) {
      setError(e.message || t.wsEditor.failedToCreate);
    }
  };

  if (!open) return null;

  return (
    <ModalOverlay open={open} onClose={close}>
      <div className="w-[480px] rounded-lg border border-border-secondary bg-bg-surface p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-text-primary">{t.wsEditor.newWsEndpoint}</h2>
          <button onClick={close} className="text-text-muted hover:text-text-secondary flex items-center">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-text-tertiary mb-2">{t.newEndpoint.aliasOptional}</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full rounded border border-border-secondary bg-bg-input px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary"
            placeholder={t.newEndpoint.aliasPlaceholder}
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm text-text-tertiary mb-2">{t.wsEditor.wsEndpointPath}</label>
          <input
            type="text"
            value={path}
            onChange={e => { setPath(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            className="w-full rounded border border-border-secondary bg-bg-input px-3 py-2 text-sm text-text-primary font-mono outline-none focus:border-accent-primary"
            placeholder="/ws/events"
            autoFocus
          />
          <p className="mt-1.5 text-xs text-text-muted font-mono break-all">
            {`ws://${serverStatus.localIp}:${serverStatus.port}${path || '/ws/events'}`}
          </p>
        </div>

        {error && <p className="mb-3 text-sm text-method-delete">{error}</p>}

        <div className="flex justify-end gap-3">
          <button onClick={close} className="rounded px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
            {t.common.cancel}
          </button>
          <button
            onClick={handleSubmit}
            className="rounded bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            {t.common.create}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
