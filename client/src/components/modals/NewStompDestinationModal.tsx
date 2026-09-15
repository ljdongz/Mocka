import { useState } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { useStompStore } from '../../stores/stomp.store';
import { useUIStore } from '../../stores/ui.store';
import { ModalOverlay } from '../shared/ModalOverlay';
import { useTranslation } from '../../i18n';
import type { StompTrigger } from '../../types';

const TRIGGERS: StompTrigger[] = ['send', 'subscribe', 'manual'];
const PLACEHOLDERS: Record<StompTrigger, string> = {
  send: '/app/rooms/*/message',
  subscribe: '/topic/rooms/*',
  manual: '/topic/rooms/88',
};

export function NewStompDestinationModal() {
  const t = useTranslation();
  const open = useUIStore(s => s.showNewStompDestination);
  const connectionId = useUIStore(s => s.newStompDestinationConnectionId);
  const close = () => useUIStore.getState().setShowNewStompDestination(false);
  const createDestination = useStompStore(s => s.createDestination);
  const connections = useStompStore(s => s.connections);

  const [trigger, setTrigger] = useState<StompTrigger>('send');
  const [pattern, setPattern] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const connection = connections.find(c => c.id === connectionId);
  const triggerLabel: Record<StompTrigger, string> = { send: t.stomp.triggerSend, subscribe: t.stomp.triggerSubscribe, manual: t.stomp.triggerManual };
  const triggerDesc: Record<StompTrigger, string> = { send: t.stomp.triggerSendDesc, subscribe: t.stomp.triggerSubscribeDesc, manual: t.stomp.triggerManualDesc };

  const reset = () => { setTrigger('send'); setPattern(''); setName(''); setError(''); };

  const handleSubmit = async () => {
    if (!connectionId) return;
    if (!pattern.trim()) { setError(t.stomp.patternRequired); return; }
    try {
      await createDestination(connectionId, { pattern: pattern.trim(), trigger, name: name.trim() || undefined });
      reset();
      close();
    } catch (e: any) {
      setError(e.message || t.stomp.failedToCreate);
    }
  };

  const handleClose = () => { reset(); close(); };

  return (
    <ModalOverlay open={open} onClose={handleClose}>
      <div className="w-[520px] rounded-lg border border-border-secondary bg-bg-surface p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-text-primary">{t.stomp.newDestination}</h2>
          <button onClick={handleClose} className="text-text-muted hover:text-text-secondary flex items-center">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        {connection && <p className="text-xs text-text-muted font-mono mb-5">{connection.name || connection.path} · {connection.path}</p>}

        <div className="mb-4">
          <label className="block text-sm text-text-tertiary mb-2">{t.stomp.trigger}</label>
          <div className="flex gap-2">
            {TRIGGERS.map(tr => (
              <button
                key={tr}
                onClick={() => setTrigger(tr)}
                className={clsx(
                  'rounded px-4 py-1.5 text-sm font-bold font-mono transition-colors',
                  trigger === tr ? 'bg-accent-primary text-white' : 'bg-bg-input text-text-secondary hover:bg-bg-hover',
                )}
              >
                {triggerLabel[tr]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-text-muted">{triggerDesc[trigger]}</p>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-text-tertiary mb-2">{t.stomp.pattern}</label>
          <input
            type="text"
            value={pattern}
            onChange={e => { setPattern(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            className="w-full rounded border border-border-secondary bg-bg-input px-3 py-2 text-sm text-text-primary font-mono outline-none focus:border-accent-primary"
            placeholder={PLACEHOLDERS[trigger]}
            autoFocus
          />
          <p className="mt-1.5 text-xs text-text-muted">{t.stomp.patternHint}</p>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-text-tertiary mb-2">{t.stomp.name}</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            className="w-full rounded border border-border-secondary bg-bg-input px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary"
            placeholder="e.g. Room message"
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
