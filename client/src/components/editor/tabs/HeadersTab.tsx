import { useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useEndpointStore } from '../../../stores/endpoint.store';
import { KeyValueTable } from '../../shared/KeyValueTable';
import { useTranslation } from '../../../i18n';
import { createKeyValueRow } from '../../../utils/entity-factory';
import type { Endpoint } from '../../../types';

export function HeadersTab({ endpoint }: { endpoint: Endpoint }) {
  const t = useTranslation();
  const updateEndpoint = useEndpointStore(s => s.updateEndpoint);

  const handleChange = useCallback((rows: any[]) => {
    updateEndpoint(endpoint.id, { requestHeaders: rows });
  }, [endpoint.id, updateEndpoint]);

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-primary">{t.headers.title}</h3>
          <button
            onClick={() => handleChange([...(endpoint.requestHeaders ?? []), createKeyValueRow((endpoint.requestHeaders ?? []).length)])}
            className="text-xs text-accent-primary hover:underline flex items-center gap-0.5"
          >
            <Plus size={12} /> {t.headers.addHeader}
          </button>
        </div>
        <p className="text-xs text-text-tertiary mt-0.5">
          {t.headers.description}
        </p>
      </div>
      <KeyValueTable
        rows={endpoint.requestHeaders ?? []}
        onChange={handleChange}
        keyLabel={t.headers.header}
        valueLabel={t.headers.value}
      />
    </div>
  );
}
