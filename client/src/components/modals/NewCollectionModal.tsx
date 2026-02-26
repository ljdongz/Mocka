import { useState } from 'react';
import { X } from 'lucide-react';
import { useCollectionStore } from '../../stores/collection.store';
import { useUIStore } from '../../stores/ui.store';
import { ModalOverlay } from '../shared/ModalOverlay';
import { useTranslation } from '../../i18n';

export function NewCollectionModal() {
  const t = useTranslation();
  const open = useUIStore(s => s.showNewCollection);
  const close = () => useUIStore.getState().setShowNewCollection(false);
  const createCollection = useCollectionStore(s => s.create);

  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) { setError(t.validation.nameRequired); return; }
    try {
      await createCollection(name.trim());
      setName('');
      setError('');
      close();
    } catch (e: any) {
      setError(e.message || t.newCollection.failedToCreate);
    }
  };

  const handleClose = () => {
    setName('');
    setError('');
    close();
  };

  return (
    <ModalOverlay open={open} onClose={handleClose}>
      <div className="w-[400px] rounded-lg border border-border-secondary bg-bg-surface p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-text-primary">{t.newCollection.title}</h2>
          <button onClick={handleClose} className="text-text-muted hover:text-text-secondary flex items-center">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-text-tertiary mb-2">{t.newCollection.collectionName}</label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            className="w-full rounded border border-border-secondary bg-bg-input px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary"
            placeholder={t.newCollection.placeholder}
            autoFocus
          />
        </div>

        {error && <p className="mb-3 text-sm text-method-delete">{error}</p>}

        <div className="flex justify-end gap-3">
          <button onClick={handleClose} className="rounded px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
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
