import { useCallback } from 'react';
import { useEndpointStore } from '../../../stores/endpoint.store';
import { KeyValueTable } from '../../shared/KeyValueTable';
import type { Endpoint } from '../../../types';

export function ParamsTab({ endpoint }: { endpoint: Endpoint }) {
  const updateEndpoint = useEndpointStore(s => s.updateEndpoint);

  const handleChange = useCallback((rows: any[]) => {
    updateEndpoint(endpoint.id, { queryParams: rows });
  }, [endpoint.id, updateEndpoint]);

  return (
    <div>
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
