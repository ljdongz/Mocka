import { useCallback } from 'react';
import { useEndpointStore } from '../../../stores/endpoint.store';
import { CodeEditor } from '../../shared/CodeEditor';
import type { Endpoint } from '../../../types';

const CONTENT_TYPES = ['application/json', 'text/plain', 'application/xml', 'application/x-www-form-urlencoded'];

export function BodyTab({ endpoint }: { endpoint: Endpoint }) {
  const updateEndpoint = useEndpointStore(s => s.updateEndpoint);

  const handleBodyChange = useCallback((value: string) => {
    updateEndpoint(endpoint.id, { requestBodyRaw: value });
  }, [endpoint.id, updateEndpoint]);

  const handleContentTypeChange = useCallback((ct: string) => {
    updateEndpoint(endpoint.id, { requestBodyContentType: ct });
  }, [endpoint.id, updateEndpoint]);

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
        <button onClick={beautify} className="text-sm text-accent-primary hover:underline">
          Beautify JSON
        </button>
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

      <div className="rounded border border-border-secondary overflow-hidden">
        <CodeEditor
          value={endpoint.requestBodyRaw}
          onChange={handleBodyChange}
          height="400px"
        />
      </div>
    </div>
  );
}
