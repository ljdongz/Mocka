import clsx from 'clsx';
import { getStatusColor } from '../../utils/http';

export function StatusCodeBadge({ code, className }: { code: number; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center rounded px-2 py-0.5 font-mono text-xs font-semibold', getStatusColor(code), className)}>
      {code}
    </span>
  );
}
