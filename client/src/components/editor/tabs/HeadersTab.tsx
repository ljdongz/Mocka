import { useCallback } from 'react';
import { useEndpointStore } from '../../../stores/endpoint.store';
import { KeyValueTable } from '../../shared/KeyValueTable';
import type { Endpoint } from '../../../types';

export function HeadersTab({ endpoint }: { endpoint: Endpoint }) {
  const updateEndpoint = useEndpointStore(s => s.updateEndpoint);

  const handleChange = useCallback((rows: any[]) => {
    updateEndpoint(endpoint.id, { requestHeaders: rows });
  }, [endpoint.id, updateEndpoint]);

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-text-primary">Request Headers</h3>
      </div>
      <KeyValueTable
        rows={endpoint.requestHeaders ?? []}
        onChange={handleChange}
        keyLabel="Header"
        valueLabel="Value"
        addLabel="+ Add Header"
      />
    </div>
  );
}
