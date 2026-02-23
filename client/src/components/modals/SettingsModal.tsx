import { useState, useEffect } from 'react';
import { useSettingsStore } from '../../stores/settings.store';
import { useUIStore } from '../../stores/ui.store';
import { ModalOverlay } from '../shared/ModalOverlay';

export function SettingsModal() {
  const open = useUIStore(s => s.showSettings);
  const close = () => useUIStore.getState().setShowSettings(false);
  const settings = useSettingsStore(s => s.settings);
  const updateSettings = useSettingsStore(s => s.update);
  const restartServer = useSettingsStore(s => s.restartServer);

  const [port, setPort] = useState(settings.port);
  const [delay, setDelay] = useState(settings.responseDelay);
  const [historyToast, setHistoryToast] = useState(settings.historyToast === 'true');

  useEffect(() => {
    setPort(settings.port);
    setDelay(settings.responseDelay);
    setHistoryToast(settings.historyToast === 'true');
  }, [settings]);

  const handleSave = async () => {
    await updateSettings({ port, responseDelay: delay, historyToast: historyToast ? 'true' : 'false' });
    if (port !== settings.port) {
      await restartServer();
    }
    close();
  };

  return (
    <ModalOverlay open={open} onClose={close}>
      <div className="w-[420px] rounded-lg border border-border-secondary bg-bg-surface p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-text-primary">Settings</h2>
          <button onClick={close} className="text-text-muted hover:text-text-secondary text-lg">&times;</button>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-text-tertiary mb-1.5">Mock Server Port</label>
          <input
            type="number" style={{ MozAppearance: 'textfield' }}
            value={port}
            onChange={e => setPort(e.target.value)}
            className="w-full rounded border border-border-secondary bg-bg-input px-3 py-2 text-sm text-text-primary font-mono outline-none focus:border-accent-primary"
          />
          <p className="mt-1 text-xs text-text-muted">Changing the port will restart the mock server.</p>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-text-tertiary mb-1.5">Default Response Delay (ms)</label>
          <input
            type="number" style={{ MozAppearance: 'textfield' }}
            value={delay}
            onChange={e => setDelay(e.target.value)}
            className="w-full rounded border border-border-secondary bg-bg-input px-3 py-2 text-sm text-text-primary font-mono outline-none focus:border-accent-primary"
          />
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div>
            <label className="block text-sm text-text-tertiary">History Toast Notifications</label>
            <p className="mt-0.5 text-xs text-text-muted">Show toast when a request is received.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={historyToast}
            onClick={() => setHistoryToast(!historyToast)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${historyToast ? 'bg-accent-primary' : 'bg-border-secondary'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${historyToast ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
          </button>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={close} className="rounded px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Save
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
