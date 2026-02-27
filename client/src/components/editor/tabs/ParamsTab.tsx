import { useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useEndpointStore } from '../../../stores/endpoint.store';
import { KeyValueTable } from '../../shared/KeyValueTable';
import { useTranslation } from '../../../i18n';
import { extractPathParams } from '../../../utils/path-params';
import { createKeyValueRow } from '../../../utils/entity-factory';
import type { Endpoint } from '../../../types';

export function ParamsTab({ endpoint }: { endpoint: Endpoint }) {
  const t = useTranslation();
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
          <h3 className="text-base font-semibold text-text-primary">{t.params.pathParameters}</h3>
          <p className="text-xs text-text-tertiary mt-0.5 mb-3">
            {t.params.pathParamsDesc}
          </p>
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_1fr] gap-2 text-sm text-text-tertiary mb-1">
              <div>{t.params.parameter}</div>
              <div>{t.params.pattern}</div>
            </div>
            {pathParams.map(param => (
              <div key={param} className="grid grid-cols-[1fr_1fr] gap-2 items-center">
                <div className="flex items-center gap-2 rounded border border-accent-primary/30 bg-accent-primary/5 px-2 py-1.5 text-sm font-mono text-accent-primary">
                  <span className="text-accent-primary/50">:</span>{param}
                </div>
                <div className="rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm font-mono text-text-muted">
                  {t.params.anyValue}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Query Parameters */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-primary">{t.params.queryParameters}</h3>
          <button
            onClick={() => handleChange([...(endpoint.queryParams ?? []), createKeyValueRow((endpoint.queryParams ?? []).length)])}
            className="text-xs text-accent-primary hover:underline flex items-center gap-0.5"
          >
            <Plus size={12} /> {t.params.addParam}
          </button>
        </div>
        <p className="text-xs text-text-tertiary mt-0.5">
          {t.params.queryParamsDesc}
        </p>
      </div>
      <KeyValueTable
        rows={endpoint.queryParams ?? []}
        onChange={handleChange}
        keyLabel={t.params.parameter}
        valueLabel={t.params.example}
      />
    </div>
  );
}
