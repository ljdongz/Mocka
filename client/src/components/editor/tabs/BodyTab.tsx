import { useState, useCallback, useEffect } from 'react';
import { useEndpointStore } from '../../../stores/endpoint.store';
import { CodeEditor } from '../../shared/CodeEditor';
import { X } from 'lucide-react';
import type { Endpoint } from '../../../types';

const CONTENT_TYPES = ['application/json', 'text/plain', 'application/xml', 'application/x-www-form-urlencoded', 'multipart/form-data'];

interface FormDataField {
  id: string;
  key: string;
  value: string;
  type: 'text' | 'file';
  isEnabled: boolean;
}

function parseFormDataFields(raw: string): FormDataField[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(f => f.id && 'key' in f && 'type' in f)) {
      return parsed;
    }
  } catch { /* not form-data JSON */ }
  return [];
}

function FormDataFieldInput({ field, prop, placeholder, onCommit }: {
  field: FormDataField;
  prop: 'key' | 'value';
  placeholder: string;
  onCommit: (id: string, prop: keyof FormDataField, val: any) => void;
}) {
  const [local, setLocal] = useState(field[prop]);

  useEffect(() => { setLocal(field[prop]); }, [field[prop]]);

  return (
    <input
      type="text"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== field[prop]) onCommit(field.id, prop, local); }}
      placeholder={placeholder}
      className="rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
    />
  );
}

function FormDataEditor({ endpoint }: { endpoint: Endpoint }) {
  const updateEndpoint = useEndpointStore(s => s.updateEndpoint);
  const fields = parseFormDataFields(endpoint.requestBodyRaw);

  const save = useCallback((next: FormDataField[]) => {
    updateEndpoint(endpoint.id, { requestBodyRaw: JSON.stringify(next, null, 2) });
  }, [endpoint.id, updateEndpoint]);

  const commitField = useCallback((id: string, prop: keyof FormDataField, val: any) => {
    save(fields.map(f => f.id === id ? { ...f, [prop]: val } : f));
  }, [fields, save]);

  const removeField = useCallback((id: string) => {
    save(fields.filter(f => f.id !== id));
  }, [fields, save]);

  const addField = useCallback(() => {
    save([...fields, { id: crypto.randomUUID(), key: '', value: '', type: 'text', isEnabled: true }]);
  }, [fields, save]);

  return (
    <div>
      <div className="mb-2 grid grid-cols-[auto_1fr_100px_1fr_auto] gap-2 text-sm text-text-tertiary">
        <div className="w-6" />
        <div>Key</div>
        <div>Type</div>
        <div>Value</div>
        <div className="w-6" />
      </div>
      {fields.map(field => (
        <div key={field.id} className="grid grid-cols-[auto_1fr_100px_1fr_auto] gap-2 mb-1 items-center">
          <input
            type="checkbox"
            checked={field.isEnabled}
            onChange={e => commitField(field.id, 'isEnabled', e.target.checked)}
            className="w-4 h-4 accent-accent-primary"
          />
          <FormDataFieldInput field={field} prop="key" placeholder="Key" onCommit={commitField} />
          <select
            value={field.type}
            onChange={e => commitField(field.id, 'type', e.target.value)}
            className="rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none"
          >
            <option value="text">Text</option>
            <option value="file">File</option>
          </select>
          <FormDataFieldInput
            field={field}
            prop="value"
            placeholder={field.type === 'file' ? 'filename.png' : 'Value'}
            onCommit={commitField}
          />
          <button
            onClick={() => removeField(field.id)}
            className="text-text-muted hover:text-method-delete w-6 h-6 flex items-center justify-center"
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>
      ))}
      <button onClick={addField} className="mt-2 text-sm text-accent-primary hover:underline">
        + Add Field
      </button>
    </div>
  );
}

export function BodyTab({ endpoint }: { endpoint: Endpoint }) {
  const updateEndpoint = useEndpointStore(s => s.updateEndpoint);
  const isFormData = endpoint.requestBodyContentType === 'multipart/form-data';

  const handleBodyChange = useCallback((value: string) => {
    updateEndpoint(endpoint.id, { requestBodyRaw: value });
  }, [endpoint.id, updateEndpoint]);

  const handleContentTypeChange = useCallback((ct: string) => {
    const prev = endpoint.requestBodyContentType;
    const update: Partial<Endpoint> = { requestBodyContentType: ct };

    if (ct === 'multipart/form-data' && prev !== 'multipart/form-data') {
      const existing = parseFormDataFields(endpoint.requestBodyRaw);
      if (existing.length === 0) {
        update.requestBodyRaw = '[]';
      }
    } else if (ct !== 'multipart/form-data' && prev === 'multipart/form-data') {
      update.requestBodyRaw = '';
    }

    updateEndpoint(endpoint.id, update);
  }, [endpoint.id, endpoint.requestBodyContentType, endpoint.requestBodyRaw, updateEndpoint]);

  const beautify = useCallback(() => {
    try {
      const formatted = JSON.stringify(JSON.parse(endpoint.requestBodyRaw), null, 2);
      updateEndpoint(endpoint.id, { requestBodyRaw: formatted });
    } catch { /* not valid JSON */ }
  }, [endpoint.id, endpoint.requestBodyRaw, updateEndpoint]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Request Body</h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            Define the expected request body. This description is for documentation - it won't limit the requests this endpoint receives.
          </p>
        </div>
        {!isFormData && (
          <button onClick={beautify} className="text-sm text-accent-primary hover:underline">
            Beautify JSON
          </button>
        )}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-text-tertiary">Content-Type</span>
        <select
          value={endpoint.requestBodyContentType}
          onChange={e => handleContentTypeChange(e.target.value)}
          className="rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none"
        >
          {CONTENT_TYPES.map(ct => (
            <option key={ct} value={ct}>{ct}</option>
          ))}
        </select>
      </div>

      {isFormData ? (
        <FormDataEditor endpoint={endpoint} />
      ) : (
        <div className="rounded border border-border-secondary overflow-hidden">
          <CodeEditor
            value={endpoint.requestBodyRaw}
            onChange={handleBodyChange}
            height="400px"
          />
        </div>
      )}
    </div>
  );
}
