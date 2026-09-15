import { useState } from 'react';
import { RadioTower, Download, Power, Send, Square } from 'lucide-react';
import clsx from 'clsx';
import { useStompStore } from '../../stores/stomp.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useTranslation, fmt } from '../../i18n';
import { CodeEditor } from '../shared/CodeEditor';
import { StompSessionsPanel } from './StompSessionsPanel';
import { StompTestClient } from './StompTestClient';
import type { StompConnection, StompConnectPolicy, StompScope, StompFireOutcome } from '../../types';

const POLICIES: StompConnectPolicy[] = ['accept', 'validate', 'reject'];
const SCOPES: StompScope[] = ['broadcast', 'echo', 'user'];

const inputCls = 'w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary';
const monoCls = `${inputCls} font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;

function numberOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function StompConnectionEditor({ connection }: { connection: StompConnection }) {
  const t = useTranslation();
  const serverStatus = useSettingsStore(s => s.serverStatus);
  const updateConnection = useStompStore(s => s.updateConnection);
  const toggleConnection = useStompStore(s => s.toggleConnection);
  const exportConnection = useStompStore(s => s.exportConnection);

  const [editingPath, setEditingPath] = useState(false);
  const [pathValue, setPathValue] = useState(connection.path);
  const [error, setError] = useState('');

  const savePath = async () => {
    const trimmed = pathValue.trim();
    if (!trimmed) { setError(t.stomp.pathRequired); return; }
    if (trimmed !== connection.path) {
      try { await updateConnection(connection.id, { path: trimmed }); setError(''); }
      catch (e: any) { setError(e.message); return; }
    }
    setEditingPath(false);
  };

  const handleExport = async () => {
    const data = await exportConnection(connection.id);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mocka-stomp-${(connection.name || connection.path).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'connection'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const wsUrl = `ws://${serverStatus.localIp}:${serverStatus.port}${connection.path}`;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border-primary px-6 py-3">
        <RadioTower size={18} className="text-accent-primary shrink-0" />
        {editingPath ? (
          <input
            value={pathValue}
            onChange={e => { setPathValue(e.target.value); setError(''); }}
            onBlur={savePath}
            onKeyDown={e => {
              if (e.key === 'Enter') savePath();
              if (e.key === 'Escape') { setEditingPath(false); setError(''); setPathValue(connection.path); }
            }}
            className="flex-1 rounded border border-border-secondary bg-bg-input px-2 py-1 font-mono text-base text-text-primary outline-none focus:border-accent-primary"
            autoFocus
          />
        ) : (
          <span
            onClick={() => { setPathValue(connection.path); setEditingPath(true); }}
            className="font-mono text-base text-text-primary cursor-pointer hover:text-accent-primary transition-colors"
            title={t.editor.clickToEditPath}
          >
            {connection.path}
          </span>
        )}
        {error && <span className="text-xs text-method-delete">{error}</span>}
        <div className="flex-1" />
        <button
          onClick={() => toggleConnection(connection.id)}
          className={clsx('flex items-center gap-1.5 rounded px-2.5 py-1 text-xs border transition-colors',
            connection.isEnabled ? 'border-server-running/40 text-server-running hover:bg-bg-hover' : 'border-server-stopped/40 text-server-stopped hover:bg-bg-hover')}
          title={t.stomp.toggle}
        >
          <Power size={12} strokeWidth={2.5} />
          {connection.isEnabled ? t.stomp.enabled : t.stomp.disabled}
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-text-secondary border border-border-secondary hover:bg-bg-hover"
        >
          <Download size={12} strokeWidth={2.5} />
          {t.stomp.exportConnection}
        </button>
      </div>
      <div className="flex items-center gap-3 px-6 py-1.5 border-b border-border-primary">
        <span className="text-xs text-text-muted font-mono truncate">{wsUrl}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <ConnectionForm connection={connection} />
        <PushForm connection={connection} />
        <StompSessionsPanel connectionId={connection.id} connectionPath={connection.path} />
        <StompTestClient connection={connection} />
      </div>
    </div>
  );
}

function ConnectionForm({ connection }: { connection: StompConnection }) {
  const t = useTranslation();
  const updateConnection = useStompStore(s => s.updateConnection);

  const [name, setName] = useState(connection.name);
  const [requiredHeaders, setRequiredHeaders] = useState(connection.requiredHeaders.join(', '));
  const [rejectMessage, setRejectMessage] = useState(connection.rejectMessage);
  const [hbOut, setHbOut] = useState(String(connection.heartbeatOutgoing));
  const [hbIn, setHbIn] = useState(String(connection.heartbeatIncoming));
  const [version, setVersion] = useState(connection.stompVersion);
  const [defaultDelay, setDefaultDelay] = useState(connection.defaultDelay == null ? '' : String(connection.defaultDelay));
  const [replay, setReplay] = useState(String(connection.replayBufferSize));

  const commit = (data: Partial<StompConnection>) => updateConnection(connection.id, data);
  const policyLabel: Record<StompConnectPolicy, string> = { accept: t.stomp.policyAccept, validate: t.stomp.policyValidate, reject: t.stomp.policyReject };
  const policyDesc: Record<StompConnectPolicy, string> = { accept: t.stomp.policyAcceptDesc, validate: t.stomp.policyValidateDesc, reject: t.stomp.policyRejectDesc };

  return (
    <section>
      <h3 className="text-base font-semibold text-text-primary mb-3">{t.stomp.connection}</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.stomp.name}</label>
          <input value={name} onChange={e => setName(e.target.value)}
            onBlur={() => { if (name !== connection.name) commit({ name }); }}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.stomp.stompVersion}</label>
          <input value={version} onChange={e => setVersion(e.target.value)}
            onBlur={() => { if (version.trim() && version !== connection.stompVersion) commit({ stompVersion: version.trim() }); }}
            className={`${inputCls} font-mono`} />
        </div>

        <div className="col-span-2">
          <label className="block text-xs text-text-tertiary mb-1">{t.stomp.connectPolicy}</label>
          <div className="flex items-center gap-1">
            {POLICIES.map(p => (
              <button key={p} onClick={() => commit({ connectPolicy: p })}
                className={clsx('text-xs px-3 py-1 rounded-full border transition-colors',
                  connection.connectPolicy === p ? 'bg-accent-primary text-white border-accent-primary' : 'border-border-primary text-text-secondary hover:border-accent-primary')}>
                {policyLabel[p]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-text-muted">{policyDesc[connection.connectPolicy]}</p>
        </div>

        {connection.connectPolicy === 'validate' && (
          <div>
            <label className="block text-xs text-text-tertiary mb-1">{t.stomp.requiredHeaders}</label>
            <input value={requiredHeaders} onChange={e => setRequiredHeaders(e.target.value)}
              onBlur={() => {
                const list = requiredHeaders.split(',').map(s => s.trim()).filter(Boolean);
                if (list.join(',') !== connection.requiredHeaders.join(',')) commit({ requiredHeaders: list });
              }}
              placeholder="Authorization, x-device-id"
              className={`${inputCls} font-mono`} />
            <p className="mt-1 text-xs text-text-muted">{t.stomp.requiredHeadersHint}</p>
          </div>
        )}
        {connection.connectPolicy !== 'accept' && (
          <div>
            <label className="block text-xs text-text-tertiary mb-1">{t.stomp.rejectMessage}</label>
            <input value={rejectMessage} onChange={e => setRejectMessage(e.target.value)}
              onBlur={() => { if (rejectMessage !== connection.rejectMessage) commit({ rejectMessage }); }}
              className={inputCls} />
          </div>
        )}

        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.stomp.heartbeatOutgoing}</label>
          <input type="number" min={0} value={hbOut} onChange={e => setHbOut(e.target.value)}
            onBlur={() => { const n = numberOrNull(hbOut); if (n !== null && Number.isInteger(n) && n !== connection.heartbeatOutgoing) commit({ heartbeatOutgoing: n }); else setHbOut(String(connection.heartbeatOutgoing)); }}
            className={monoCls} />
        </div>
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.stomp.heartbeatIncoming}</label>
          <input type="number" min={0} value={hbIn} onChange={e => setHbIn(e.target.value)}
            onBlur={() => { const n = numberOrNull(hbIn); if (n !== null && Number.isInteger(n) && n !== connection.heartbeatIncoming) commit({ heartbeatIncoming: n }); else setHbIn(String(connection.heartbeatIncoming)); }}
            className={monoCls} />
        </div>
        <p className="col-span-2 -mt-2 text-xs text-text-muted">{t.stomp.heartbeatHint}</p>

        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.stomp.defaultDelay}</label>
          <input type="number" min={0} value={defaultDelay} onChange={e => setDefaultDelay(e.target.value)}
            onBlur={() => { const n = numberOrNull(defaultDelay); if (n !== (connection.defaultDelay ?? null)) commit({ defaultDelay: n }); }}
            placeholder="0"
            className={monoCls} />
        </div>
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.stomp.replayBuffer}</label>
          <input type="number" min={0} value={replay} onChange={e => setReplay(e.target.value)}
            onBlur={() => { const n = numberOrNull(replay); if (n !== null && Number.isInteger(n) && n !== connection.replayBufferSize) commit({ replayBufferSize: n }); else setReplay(String(connection.replayBufferSize)); }}
            className={monoCls} />
          <p className="mt-1 text-xs text-text-muted">{t.stomp.replayBufferHint}</p>
        </div>
      </div>
    </section>
  );
}

function PushForm({ connection }: { connection: StompConnection }) {
  const t = useTranslation();
  const push = useStompStore(s => s.push);
  const stopRepeats = useStompStore(s => s.stopRepeats);
  const sessions = useStompStore(s => s.sessions).filter(s => s.connectionId === connection.id);

  const [destination, setDestination] = useState('/topic/rooms/88');
  const [scope, setScope] = useState<StompScope>('broadcast');
  const [sessionId, setSessionId] = useState('');
  const [body, setBody] = useState('{\n  "id": "{{$randomUUID}}",\n  "sentAt": "{{$isoTimestamp}}"\n}');
  const [times, setTimes] = useState('1');
  const [delay, setDelay] = useState('');
  const [jitter, setJitter] = useState('');
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null);

  const scopeLabel: Record<StompScope, string> = { broadcast: t.stomp.scopeBroadcast, echo: t.stomp.scopeEcho, user: t.stomp.scopeUser };

  const describe = (r: StompFireOutcome) => {
    if (r.scheduled) return t.stomp.pushScheduled;
    if (r.delivered > 0) return fmt(t.stomp.pushResult, r.delivered);
    return r.buffered ? t.stomp.pushBuffered : t.stomp.pushDropped;
  };

  const handleSend = async () => {
    try {
      const r = await push(connection.id, {
        destination: destination.trim(),
        body,
        scope,
        sessionId: sessionId || undefined,
        times: Math.max(1, parseInt(times) || 1),
        delay: numberOrNull(delay) ?? undefined,
        jitter: numberOrNull(jitter) ?? undefined,
      });
      setResult({ text: describe(r), error: false });
    } catch (e: any) {
      setResult({ text: e.message, error: true });
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-semibold text-text-primary">{t.stomp.push}</h3>
        <button onClick={() => stopRepeats(connection.id)} className="flex items-center gap-1 text-xs text-text-secondary hover:text-method-delete" title={t.stomp.stopRepeats}>
          <Square size={12} /> {t.stomp.stopRepeats}
        </button>
      </div>
      <p className="text-xs text-text-tertiary mb-3">{t.stomp.pushDescription}</p>
      <div className="rounded border border-border-secondary bg-bg-surface/50 p-4 space-y-3">
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <div>
            <label className="block text-xs text-text-tertiary mb-1">{t.stomp.pushDestination}</label>
            <input value={destination} onChange={e => setDestination(e.target.value)} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className="block text-xs text-text-tertiary mb-1">{t.stomp.pushScope}</label>
            <div className="flex items-center gap-1">
              {SCOPES.map(s => (
                <button key={s} onClick={() => setScope(s)}
                  className={clsx('text-xs px-2.5 py-1 rounded-full border transition-colors',
                    scope === s ? 'bg-accent-primary text-white border-accent-primary' : 'border-border-primary text-text-secondary hover:border-accent-primary')}>
                  {scopeLabel[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
        {(scope !== 'broadcast' || sessions.length > 0) && (
          <div>
            <label className="block text-xs text-text-tertiary mb-1">{t.stomp.pushSession}{scope !== 'broadcast' ? ' *' : ''}</label>
            <select value={sessionId} onChange={e => setSessionId(e.target.value)} className={`${inputCls} font-mono`}>
              <option value="">{t.stomp.selectSession}</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.id.slice(0, 8)} · {s.clientHeaders['x-client-type'] ?? '-'} · {s.clientHeaders['x-device-id'] ?? ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.stomp.pushBody}</label>
          <div className="rounded border border-border-secondary overflow-hidden">
            <CodeEditor value={body} onChange={setBody} height="140px" />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs text-text-tertiary mb-1">{t.stomp.pushTimes}</label>
            <input type="number" min={1} value={times} onChange={e => setTimes(e.target.value)} className={monoCls} />
          </div>
          <div>
            <label className="block text-xs text-text-tertiary mb-1">{t.stomp.pushDelay}</label>
            <input type="number" min={0} value={delay} onChange={e => setDelay(e.target.value)} placeholder={String(connection.defaultDelay ?? 0)} className={monoCls} />
          </div>
          <div>
            <label className="block text-xs text-text-tertiary mb-1">{t.stomp.pushJitter}</label>
            <input type="number" min={0} value={jitter} onChange={e => setJitter(e.target.value)} placeholder="0" className={monoCls} />
          </div>
          <button onClick={handleSend} className="flex items-center gap-1.5 rounded bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110">
            <Send size={14} /> {t.stomp.pushSend}
          </button>
        </div>
        {result && <p className={clsx('text-xs', result.error ? 'text-method-delete' : 'text-text-secondary')}>{result.text}</p>}
      </div>
    </section>
  );
}
