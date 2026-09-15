import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';

interface HeaderEntry {
  id: string;
  key: string;
  value: string;
}

function parseEntries(raw: string): HeaderEntry[] {
  try {
    const obj = JSON.parse(raw);
    if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
      return Object.entries(obj).map(([key, value], i) => ({
        id: `h-${i}-${key}`,
        key,
        value: String(value),
      }));
    }
  } catch { /* not valid JSON */ }
  return [];
}

function serializeEntries(entries: HeaderEntry[]): string {
  const obj: Record<string, string> = {};
  for (const e of entries) {
    if (e.key.trim()) obj[e.key.trim()] = e.value;
  }
  return JSON.stringify(obj);
}

/**
 * Key/value table backed by a JSON-object string (HTTP response headers,
 * STOMP frame headers). `resetKey` re-reads the value when the owner changes.
 */
export function HeadersJsonEditor({
  value,
  onChange,
  title,
  addLabel,
  keyLabel = 'Header',
  valueLabel = 'Value',
  keyPlaceholder = 'e.g. Content-Type',
  valuePlaceholder = 'e.g. application/json',
  hint,
  resetKey,
}: {
  value: string;
  onChange: (json: string) => void;
  title: string;
  addLabel: string;
  keyLabel?: string;
  valueLabel?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  hint?: string;
  resetKey?: string;
}) {
  const [entries, setEntries] = useState<HeaderEntry[]>(() => parseEntries(value));

  useEffect(() => {
    setEntries(parseEntries(value));
  }, [resetKey]);

  const save = (next: HeaderEntry[]) => {
    setEntries(next);
    onChange(serializeEntries(next));
  };

  const addEntry = () => {
    save([...entries, { id: `h-${Date.now()}`, key: '', value: '' }]);
  };

  const updateEntry = (id: string, field: 'key' | 'value', val: string) => {
    save(entries.map(e => e.id === id ? { ...e, [field]: val } : e));
  };

  const removeEntry = (id: string) => {
    save(entries.filter(e => e.id !== id));
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-text-tertiary uppercase tracking-wider">{title}</label>
        <button onClick={addEntry} className="text-xs text-accent-primary hover:underline flex items-center gap-0.5">
          <Plus size={12} /> {addLabel}
        </button>
      </div>
      {hint && <p className="text-xs text-text-muted mb-2">{hint}</p>}
      {entries.length > 0 && (
        <div className="rounded border border-border-secondary bg-bg-surface/50 p-3 space-y-1">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[10px] text-text-muted uppercase tracking-wider mb-1">
            <span>{keyLabel}</span>
            <span>{valueLabel}</span>
            <span className="w-6" />
          </div>
          {entries.map(entry => (
            <div key={entry.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <HeaderInput entry={entry} field="key" placeholder={keyPlaceholder} onCommit={updateEntry} />
              <HeaderInput entry={entry} field="value" placeholder={valuePlaceholder} onCommit={updateEntry} />
              <button
                onClick={() => removeEntry(entry.id)}
                className="text-text-muted hover:text-method-delete w-6 h-6 flex items-center justify-center"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HeaderInput({ entry, field, placeholder, onCommit }: {
  entry: HeaderEntry;
  field: 'key' | 'value';
  placeholder: string;
  onCommit: (id: string, field: 'key' | 'value', val: string) => void;
}) {
  const [local, setLocal] = useState(entry[field]);

  useEffect(() => { setLocal(entry[field]); }, [entry[field]]);

  return (
    <input
      type="text"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== entry[field]) onCommit(entry.id, field, local); }}
      placeholder={placeholder}
      className="rounded border border-border-secondary bg-bg-input px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary font-mono"
    />
  );
}
