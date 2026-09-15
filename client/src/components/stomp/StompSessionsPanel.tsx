import { useState } from 'react';
import { ChevronDown, ChevronRight, Unplug, AlertOctagon, HeartOff, Bug } from 'lucide-react';
import clsx from 'clsx';
import { useStompStore } from '../../stores/stomp.store';
import { useTranslation, fmt } from '../../i18n';
import type { StompSessionInfo } from '../../types';

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function StompSessionsPanel({ connectionId, connectionPath }: { connectionId: string; connectionPath: string }) {
  const t = useTranslation();
  const sessions = useStompStore(s => s.sessions).filter(s => s.connectionId === connectionId);

  return (
    <section>
      <h3 className="text-base font-semibold text-text-primary mb-3">
        {t.stomp.sessions}
        <span className="ml-2 text-xs font-mono text-text-muted">{sessions.length}</span>
      </h3>
      {sessions.length === 0 ? (
        <p className="text-xs text-text-muted font-mono">{fmt(t.stomp.noSessions, connectionPath)}</p>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => <SessionCard key={s.id} session={s} />)}
        </div>
      )}
    </section>
  );
}

function SessionCard({ session }: { session: StompSessionInfo }) {
  const t = useTranslation();
  const injectSession = useStompStore(s => s.injectSession);
  const disconnectSession = useStompStore(s => s.disconnectSession);
  const [showHeaders, setShowHeaders] = useState(false);

  const headerEntries = Object.entries(session.clientHeaders);
  const clientType = session.clientHeaders['x-client-type'];
  const deviceId = session.clientHeaders['x-device-id'];

  const actionCls = 'flex items-center gap-1 rounded border border-border-secondary px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover';

  return (
    <div className="rounded border border-border-secondary bg-bg-surface/50 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={clsx('h-2 w-2 rounded-full', session.state === 'connected' ? 'bg-server-running' : 'bg-method-post')} />
        <span className="font-mono text-xs text-text-primary" title={session.id}>{session.id.slice(0, 8)}</span>
        {clientType && <span className="rounded bg-accent-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-accent-primary">{clientType}</span>}
        {deviceId && <span className="text-[11px] font-mono text-text-muted">{deviceId}</span>}
        <span className="text-[11px] text-text-muted">{t.stomp.connectedAt} {formatTime(session.connectedAt)}</span>
        <span className="flex-1" />
        <span className={clsx('text-[11px] font-mono', session.heartbeat.sending || session.heartbeat.outgoing === 0 ? 'text-text-muted' : 'text-method-post')}>
          {t.stomp.heartbeat} {session.heartbeat.outgoing}/{session.heartbeat.incoming}ms · {session.heartbeat.outgoing === 0 ? '—' : session.heartbeat.sending ? t.stomp.sending : t.stomp.stopped}
        </span>
      </div>

      <div className="mt-2 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{t.stomp.subscriptions}</div>
          {session.subscriptions.length === 0 ? (
            <span className="text-xs text-text-muted">{t.stomp.noSubscriptions}</span>
          ) : (
            <div className="space-y-0.5">
              {session.subscriptions.map(sub => (
                <div key={sub.id} className="flex gap-2 text-xs font-mono">
                  <span className="text-code-key">{sub.id}</span>
                  <span className="text-text-muted">→</span>
                  <span className="text-text-secondary truncate">{sub.destination}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={() => disconnectSession(session.id)} className={`${actionCls} hover:text-method-delete`} title={t.stomp.disconnect}>
            <Unplug size={11} /> {t.stomp.disconnect}
          </button>
          <button onClick={() => injectSession(session.id, { kind: 'error', message: 'injected error' })} className={`${actionCls} hover:text-method-delete`} title={t.stomp.injectError}>
            <AlertOctagon size={11} /> {t.stomp.injectError}
          </button>
          <button onClick={() => injectSession(session.id, { kind: 'stop-heartbeat' })} className={`${actionCls} hover:text-method-post`} title={t.stomp.stopHeartbeat}>
            <HeartOff size={11} /> {t.stomp.stopHeartbeat}
          </button>
          <button onClick={() => injectSession(session.id, { kind: 'malformed' })} className={`${actionCls} hover:text-method-patch`} title={t.stomp.sendMalformed}>
            <Bug size={11} /> {t.stomp.sendMalformed}
          </button>
        </div>
      </div>

      <button onClick={() => setShowHeaders(v => !v)} className="mt-2 flex items-center gap-1 text-[10px] text-text-muted uppercase tracking-wider hover:text-text-secondary">
        {showHeaders ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {t.stomp.clientHeaders} ({headerEntries.length})
      </button>
      {showHeaders && (
        <div className="mt-1 space-y-0.5">
          {headerEntries.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs">
              <span className="text-code-key font-mono min-w-[140px]">{k}</span>
              <span className="text-text-secondary font-mono break-all">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
