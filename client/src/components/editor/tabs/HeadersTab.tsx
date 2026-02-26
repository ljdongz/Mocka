import { useCallback } from 'react';
import { useEndpointStore } from '../../../stores/endpoint.store';
import { KeyValueTable } from '../../shared/KeyValueTable';
import { useTranslation } from '../../../i18n';
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
        <h3 className="text-base font-semibold text-text-primary">{t.headers.title}</h3>
        <p className="text-xs text-text-tertiary mt-0.5">
          {t.headers.description}
        </p>
      </div>
      <KeyValueTable
        rows={endpoint.requestHeaders ?? []}
        onChange={handleChange}
        keyLabel={t.headers.header}
        valueLabel={t.headers.value}
        addLabel={t.headers.addHeader}
      />
    </div>
  );
}
