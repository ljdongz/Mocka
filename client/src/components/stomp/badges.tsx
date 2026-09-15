import clsx from 'clsx';
import { useTranslation } from '../../i18n';
import type { StompTrigger, StompFireKind, StompScope } from '../../types';

const TRIGGER_STYLE: Record<StompTrigger, string> = {
  send: 'bg-method-patch-bg text-method-patch',
  subscribe: 'bg-method-post-bg text-method-post',
  manual: 'bg-accent-primary/15 text-accent-primary',
};

export function TriggerBadge({ trigger, compact, className }: { trigger: StompTrigger; compact?: boolean; className?: string }) {
  const t = useTranslation();
  const label = compact
    ? { send: 'S', subscribe: 'U', manual: 'M' }[trigger]
    : { send: t.stomp.triggerSend, subscribe: t.stomp.triggerSubscribe, manual: t.stomp.triggerManual }[trigger];
  return (
    <span
      title={{ send: t.stomp.triggerSendDesc, subscribe: t.stomp.triggerSubscribeDesc, manual: t.stomp.triggerManualDesc }[trigger]}
      className={clsx('inline-flex items-center justify-center rounded font-mono text-[11px] font-bold', compact ? 'w-5 h-5' : 'px-2 py-0.5', TRIGGER_STYLE[trigger], className)}
    >
      {label}
    </span>
  );
}

const KIND_STYLE: Record<StompFireKind, string> = {
  message: 'bg-accent-primary/15 text-accent-primary',
  error: 'bg-method-delete-bg text-method-delete',
  receipt: 'bg-method-get-bg text-method-get',
  disconnect: 'bg-method-patch-bg text-method-patch',
};

export function KindBadge({ kind, className }: { kind: StompFireKind; className?: string }) {
  const t = useTranslation();
  const label = { message: t.stomp.kindMessage, error: t.stomp.kindError, receipt: t.stomp.kindReceipt, disconnect: t.stomp.kindDisconnect }[kind];
  return (
    <span className={clsx('inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-bold', KIND_STYLE[kind], className)}>
      {label}
    </span>
  );
}

export function ScopeBadge({ scope, className }: { scope: StompScope; className?: string }) {
  const t = useTranslation();
  const label = { broadcast: t.stomp.scopeBroadcast, echo: t.stomp.scopeEcho, user: t.stomp.scopeUser }[scope];
  return (
    <span className={clsx('inline-flex items-center rounded-full border border-border-secondary px-1.5 py-0.5 text-[10px] text-text-tertiary', className)}>
      {label}
    </span>
  );
}
