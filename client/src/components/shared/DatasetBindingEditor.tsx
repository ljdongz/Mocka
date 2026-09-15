import { useEffect } from 'react';
import { useDatasetStore } from '../../stores/dataset.store';
import { useTranslation, fmt } from '../../i18n';
import type { DatasetBinding } from '../../types';

/** Bind a variant body's {{$dataset}} to a shared dataset (list or detail mode). */
export function DatasetBindingEditor({
  binding,
  onChange,
  keySources,
}: {
  binding: DatasetBinding | null;
  onChange: (binding: DatasetBinding | null) => void;
  /** detail mode: offer a key-source picker limited to these origins (omit for the default body lookup) */
  keySources?: ('body' | 'path' | 'query')[];
}) {
  const t = useTranslation();
  const datasets = useDatasetStore(s => s.datasets);
  const fetchDatasets = useDatasetStore(s => s.fetch);
  useEffect(() => { fetchDatasets(); }, [fetchDatasets]);

  const projectionText = (binding?.projection ?? []).join(', ');

  return (
    <div className="mb-4">
      <label className="block text-xs text-text-tertiary mb-1 uppercase tracking-wider">{t.response.datasetBinding}</label>
      <div className="flex gap-2">
        <select
          value={binding?.datasetId ?? ''}
          onChange={e => {
            const datasetId = e.target.value;
            onChange(datasetId ? { datasetId, mode: binding?.mode ?? 'detail', projection: binding?.projection, keySource: binding?.keySource } : null);
          }}
          className="flex-1 rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
        >
          <option value="">{t.response.noDataset}</option>
          {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {binding && (
          <select
            value={binding.mode}
            onChange={e => onChange({ ...binding, mode: e.target.value as 'list' | 'detail' })}
            className="rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
          >
            <option value="detail">detail</option>
            <option value="list">list</option>
          </select>
        )}
      </div>

      {binding?.mode === 'list' && (
        <input
          type="text"
          defaultValue={projectionText}
          onBlur={e => {
            const fields = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
            onChange({ ...binding, projection: fields.length ? fields : undefined });
          }}
          placeholder="projection: idx, title, price (비우면 전체 필드)"
          className="mt-2 w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-xs text-text-primary font-mono outline-none focus:border-accent-primary"
        />
      )}

      {binding?.mode === 'detail' && keySources && (
        <div className="mt-2 flex gap-2">
          <select
            value={binding.keySource?.from ?? 'body'}
            onChange={e => onChange({ ...binding, keySource: { from: e.target.value as 'body' | 'path' | 'query', field: binding.keySource?.field ?? '' } })}
            className="rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary"
          >
            {keySources.map(k => <option key={k} value={k}>{k === 'path' ? 'capture' : k}</option>)}
          </select>
          <input
            type="text"
            defaultValue={binding.keySource?.field ?? ''}
            onBlur={e => onChange({ ...binding, keySource: { from: binding.keySource?.from ?? 'body', field: e.target.value.trim() } })}
            placeholder={binding.keySource?.from === 'path' ? 'capture number, e.g. 1' : 'key field, e.g. id'}
            className="flex-1 rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-xs text-text-primary font-mono outline-none focus:border-accent-primary"
          />
        </div>
      )}

      {binding && (
        <p className="mt-1 text-xs text-text-muted">{fmt(t.response.datasetHint, '{{$dataset}}')}</p>
      )}
    </div>
  );
}
