import { useCallback } from 'react';
import { useEndpointStore } from '../../../stores/endpoint.store';
import { KeyValueTable } from '../../shared/KeyValueTable';
import { extractPathParams } from '../../../utils/path-params';
import type { Endpoint } from '../../../types';

export function ParamsTab({ endpoint }: { endpoint: Endpoint }) {
  const updateEndpoint = useEndpointStore(s => s.updateEndpoint);

  const handleChange = useCallback((rows: any[]) => {
    updateEndpoint(endpoint.id, { queryParams: rows });
  }, [endpoint.id, updateEndpoint]);

  const pathParams = extractPathParams(endpoint.path);

  return (
    <div>
      {/* Path Parameters (auto-detected, read-only) */}
      {pathParams.length > 0 && (
        <div className="mb-6">
          <h3 className="text-base font-semibold text-text-primary">Path Parameters</h3>
          <p className="text-xs text-text-tertiary mt-0.5 mb-3">
            Automatically detected from the endpoint path. Incoming requests matching this pattern will be captured.
          </p>
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_1fr] gap-2 text-sm text-text-tertiary mb-1">
              <div>Parameter</div>
              <div>Pattern</div>
            </div>
            {pathParams.map(param => (
              <div key={param} className="grid grid-cols-[1fr_1fr] gap-2 items-center">
                <div className="flex items-center gap-2 rounded border border-accent-primary/30 bg-accent-primary/5 px-2 py-1.5 text-sm font-mono text-accent-primary">
                  <span className="text-accent-primary/50">:</span>{param}
                </div>
                <div className="rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm font-mono text-text-muted">
                  {'[any value]'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Query Parameters */}
      <div className="mb-4">
        <h3 className="text-base font-semibold text-text-primary">Query Parameters</h3>
        <p className="text-xs text-text-tertiary mt-0.5">
          Define accepted query parameter keys. The mock server matches by path only - any parameter values will receive the same response.
        </p>
      </div>
      <KeyValueTable
        rows={endpoint.queryParams ?? []}
        onChange={handleChange}
        keyLabel="Parameter"
        valueLabel="Example"
        addLabel="+ Add Param"
      />
    </div>
  );
}
