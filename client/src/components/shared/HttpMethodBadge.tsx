import clsx from 'clsx';
import type { HttpMethod } from '../../types';

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: 'bg-method-get-bg text-method-get',
  POST: 'bg-method-post-bg text-method-post',
  PUT: 'bg-method-put-bg text-method-put',
  DELETE: 'bg-method-delete-bg text-method-delete',
  PATCH: 'bg-method-patch-bg text-method-patch',
};

export function HttpMethodBadge({ method, className }: { method: HttpMethod; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center rounded px-2 py-0.5 font-mono text-xs font-bold', METHOD_STYLES[method], className)}>
      {method}
    </span>
  );
}
