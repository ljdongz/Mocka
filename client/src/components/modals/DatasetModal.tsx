import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useDatasetStore } from '../../stores/dataset.store';
import { useUIStore } from '../../stores/ui.store';
import { ModalOverlay } from '../shared/ModalOverlay';
import { useTranslation } from '../../i18n';
import type { Dataset } from '../../types';
import clsx from 'clsx';

export function DatasetModal() {
  const t = useTranslation();
  const open = useUIStore(s => s.showDatasets);
  const close = () => useUIStore.getState().setShowDatasets(false);
  const { datasets, fetch, create, update, remove } = useDatasetStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  useEffect(() => { if (open) fetch(); }, [open, fetch]);
  useEffect(() => {
    if (datasets.length > 0 && !selectedId) setSelectedId(datasets[0].id);
  }, [datasets, selectedId]);

  const selected = datasets.find(d => d.id === selectedId);

  const handleCreate = async () => {
    const name = newName.trim() || t.dataset.newDataset;
    await create(name, 'id');
    setNewName('');
    const all = useDatasetStore.getState().datasets;
    setSelectedId(all[all.length - 1]?.id ?? null);
  };

  const handleDelete = async (id: string) => {
    await remove(id);
    if (selectedId === id) {
      const all = useDatasetStore.getState().datasets;
      setSelectedId(all[0]?.id ?? null);
    }
  };

  return (
    <ModalOverlay open={open} onClose={close}>
      <div className="w-[640px] max-h-[80vh] rounded-lg border border-border-secondary bg-bg-surface flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-secondary">
          <h2 className="text-base font-semibold text-text-primary">{t.dataset.title}</h2>
          <button onClick={close} className="text-text-muted hover:text-text-secondary text-lg">&times;</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: dataset list */}
          <div className="w-48 border-r border-border-secondary flex flex-col">
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {datasets.map(ds => (
                <div
                  key={ds.id}
                  onClick={() => setSelectedId(ds.id)}
                  className={clsx(
                    'flex items-center gap-2 rounded px-2.5 py-2 cursor-pointer text-sm',
                    selectedId === ds.id ? 'bg-bg-hover text-text-primary' : 'text-text-secondary hover:bg-bg-hover',
                  )}
                >
                  <span className="flex-1 truncate">{ds.name}</span>
                  <span className="text-xs text-text-muted">{ds.records.length}</span>
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-border-secondary">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder={t.dataset.namePlaceholder}
                  className="flex-1 min-w-0 rounded border border-border-secondary bg-bg-input px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary"
                />
                <button onClick={handleCreate} className="text-accent-primary hover:text-accent-primary/80">
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Right: editor */}
          <div className="flex-1 p-4 overflow-y-auto">
            {selected ? (
              <DatasetEditor key={selected.id} dataset={selected} onUpdate={update} onDelete={handleDelete} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-text-muted">
                {t.dataset.createToStart}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

function DatasetEditor({
  dataset,
  onUpdate,
  onDelete,
}: {
  dataset: Dataset;
  onUpdate: (id: string, data: Partial<Dataset>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const t = useTranslation();
  const [name, setName] = useState(dataset.name);
  const [keyField, setKeyField] = useState(dataset.keyField);
  const [recordsText, setRecordsText] = useState(() => JSON.stringify(dataset.records, null, 2));
  const [error, setError] = useState('');

  const commitRecords = () => {
    try {
      const parsed = JSON.parse(recordsText);
      if (!Array.isArray(parsed)) { setError(t.dataset.mustBeArray); return; }
      setError('');
      onUpdate(dataset.id, { records: parsed });
    } catch {
      setError(t.dataset.invalidJson);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => { if (name !== dataset.name) onUpdate(dataset.id, { name }); }}
          className="flex-1 rounded border border-border-secondary bg-bg-input px-2.5 py-1.5 text-sm text-text-primary font-medium outline-none focus:border-accent-primary"
        />
        <button
          onClick={() => onDelete(dataset.id)}
          className="text-text-muted hover:text-method-delete p-1.5"
          title={t.dataset.deleteDataset}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <label className="block text-xs text-text-tertiary mb-1 uppercase tracking-wider">{t.dataset.keyField}</label>
      <input
        type="text"
        value={keyField}
        onChange={e => setKeyField(e.target.value)}
        onBlur={() => { if (keyField !== dataset.keyField) onUpdate(dataset.id, { keyField }); }}
        placeholder="id"
        className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary font-mono outline-none focus:border-accent-primary mb-4"
      />

      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-text-tertiary uppercase tracking-wider">{t.dataset.records}</label>
        {error && <span className="text-xs text-method-delete">{error}</span>}
      </div>
      <textarea
        value={recordsText}
        onChange={e => setRecordsText(e.target.value)}
        onBlur={commitRecords}
        rows={14}
        spellCheck={false}
        className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary font-mono resize-none"
      />
      <p className="mt-3 text-xs text-text-muted">{t.dataset.usageHint}</p>
    </div>
  );
}
