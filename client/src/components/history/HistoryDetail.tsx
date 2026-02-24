import { useState } from 'react';
import { HttpMethodBadge } from '../shared/HttpMethodBadge';
import { StatusCodeBadge } from '../shared/StatusCodeBadge';
import { CodeEditor } from '../shared/CodeEditor';
import { formatJson } from '../../utils/json';
import type { RequestRecord, HttpMethod } from '../../types';
import clsx from 'clsx';

type DetailTab = 'response' | 'headers' | 'body';

export function HistoryDetail({ record, onClose }: { record: RequestRecord; onClose: () => void }) {
  const [tab, setTab] = useState<DetailTab>('response');

  const headers = (() => {
    try { return JSON.parse(record.requestHeaders); } catch { return {}; }
  })();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border-primary px-4 py-3">
        <div className="flex items-center gap-2">
          <HttpMethodBadge method={record.method as HttpMethod} />
          <StatusCodeBadge code={record.statusCode} />
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-secondary text-xl leading-none px-1">&times;</button>
      </div>

      <div className="px-4 py-2 text-sm text-text-tertiary font-mono border-b border-border-primary break-all">
        {record.path}
      </div>

      <div className="flex border-b border-border-primary">
        {(['response', 'headers', 'body'] as DetailTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'px-3 py-2 text-sm capitalize',
              tab === t ? 'border-b-2 border-accent-primary text-text-primary' : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            {t === 'body' ? 'Request Body' : t === 'headers' ? 'Request Headers' : 'Response Body'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'response' && (
          <CodeEditor value={formatJson(record.responseBody)} readOnly height="100%" />
        )}
        {tab === 'headers' && (
          <div className="space-y-1">
            {Object.entries(headers).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-sm">
                <span className="text-code-key font-mono font-medium min-w-[150px]">{k}</span>
                <span className="text-text-secondary font-mono break-all">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'body' && (
          <CodeEditor value={formatJson(record.bodyOrParams)} readOnly height="100%" />
        )}
      </div>
    </div>
  );
}
