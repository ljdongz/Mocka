import clsx from 'clsx';

const STYLES: Record<string, string> = {
  MESSAGE: 'bg-accent-primary/15 text-accent-primary',
  CONNECTED: 'bg-method-get-bg text-method-get',
  RECEIPT: 'bg-method-get-bg text-method-get',
  ERROR: 'bg-method-delete-bg text-method-delete',
  CONNECT: 'bg-method-put-bg text-method-put',
  SUBSCRIBE: 'bg-method-post-bg text-method-post',
  UNSUBSCRIBE: 'bg-method-post-bg text-method-post',
  SEND: 'bg-method-patch-bg text-method-patch',
  DISCONNECT: 'bg-bg-hover text-text-secondary',
};

export function StompCommandBadge({ command, className }: { command: string; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-bold', STYLES[command] ?? 'bg-bg-hover text-text-secondary', className)}>
      {command}
    </span>
  );
}
