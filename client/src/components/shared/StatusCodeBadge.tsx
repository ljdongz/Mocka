import clsx from 'clsx';

function getStatusColor(code: number): string {
  if (code >= 200 && code < 300) return 'bg-[#22C55E18] text-status-2xx';
  if (code >= 400 && code < 500) return 'bg-[#F59E0B18] text-status-4xx';
  if (code >= 500) return 'bg-[#EF444418] text-status-5xx';
  return 'bg-bg-input text-text-secondary';
}

export function StatusCodeBadge({ code, className }: { code: number; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center rounded px-2 py-0.5 font-mono text-xs font-semibold', getStatusColor(code), className)}>
      {code}
    </span>
  );
}
