import { useState, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { createKeyValueRow } from '../../utils/entity-factory';

interface Row {
  id: string;
  key: string;
  value: string;
  isEnabled: boolean;
  sortOrder: number;
}

interface Props {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  keyLabel?: string;
  valueLabel?: string;
}

function RowInput({ row, field, placeholder, onCommit }: {
  row: Row;
  field: 'key' | 'value';
  placeholder: string;
  onCommit: (id: string, field: keyof Row, val: any) => void;
}) {
  const [local, setLocal] = useState(row[field]);

  useEffect(() => { setLocal(row[field]); }, [row[field]]);

  return (
    <input
      type="text"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== row[field]) onCommit(row.id, field, local); }}
      placeholder={placeholder}
      className="rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
    />
  );
}

export function KeyValueTable({ rows, onChange, keyLabel = 'Parameter', valueLabel = 'Value' }: Props) {
  const commitRow = useCallback((id: string, field: keyof Row, val: any) => {
    onChange(rows.map(r => r.id === id ? { ...r, [field]: val } : r));
  }, [rows, onChange]);

  const removeRow = useCallback((id: string) => {
    onChange(rows.filter(r => r.id !== id));
  }, [rows, onChange]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 text-sm text-text-tertiary w-full">
          <div className="w-6" />
          <div>{keyLabel}</div>
          <div>{valueLabel}</div>
          <div className="w-6" />
        </div>
      </div>
      {rows.map(row => (
        <div key={row.id} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 mb-1 items-center">
          <input
            type="checkbox"
            checked={row.isEnabled}
            onChange={e => commitRow(row.id, 'isEnabled', e.target.checked)}
            className="w-4 h-4 accent-accent-primary"
          />
          <RowInput row={row} field="key" placeholder={keyLabel} onCommit={commitRow} />
          <RowInput row={row} field="value" placeholder={valueLabel} onCommit={commitRow} />
          <button
            onClick={() => removeRow(row.id)}
            className="text-text-muted hover:text-method-delete w-6 h-6 flex items-center justify-center"
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>
      ))}
    </div>
  );
}
