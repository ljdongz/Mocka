import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Plug, Unplug } from 'lucide-react';
import clsx from 'clsx';
import { useSettingsStore } from '../../stores/settings.store';
import { useTranslation } from '../../i18n';
import { CodeEditor } from '../shared/CodeEditor';
import { StompCommandBadge } from '../shared/StompCommandBadge';
import { encodeFrame, decodeFrames, isHeartbeat, byteLength, type StompFrame } from '../../utils/stomp-frame';
import type { StompConnection } from '../../types';

type Status = 'disconnected' | 'connecting' | 'connected';

interface LogEntry {
  id: number;
  dir: 'in' | 'out' | 'sys';
  frame?: StompFrame;
  text?: string;
  at: number;
}

const DEFAULT_CONNECT_HEADERS = JSON.stringify({
  'accept-version': '1.2',
  'heart-beat': '10000,10000',
  host: 'localhost',
  Authorization: 'Bearer test-token',
  'x-client-type': 'APP',
  'x-client-version': '1.0.0',
  'x-device-id': 'web-test',
}, null, 2);

const inputCls = 'rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary font-mono';

let logSeq = 0;

export function StompTestClient({ connection }: { connection: StompConnection }) {
  const t = useTranslation();
  const serverStatus = useSettingsStore(s => s.serverStatus);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('disconnected');
  const [connectHeaders, setConnectHeaders] = useState(DEFAULT_CONNECT_HEADERS);
  const [subId, setSubId] = useState('sub-1');
  const [subDest, setSubDest] = useState('/topic/rooms/88');
  const [sendDest, setSendDest] = useState('/app/rooms/88/message');
  const [sendBody, setSendBody] = useState('{"text":"hello"}');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [heartbeats, setHeartbeats] = useState(0);
  const [error, setError] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const beatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const append = (entry: Omit<LogEntry, 'id' | 'at'>) => {
    setLog(prev => [...prev.slice(-199), { ...entry, id: ++logSeq, at: Date.now() }]);
  };

  const stopBeating = () => {
    if (beatRef.current) { clearInterval(beatRef.current); beatRef.current = null; }
  };

  const disconnect = (sendFrameFirst = true) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && sendFrameFirst) {
      const frame = { command: 'DISCONNECT', headers: { receipt: 'bye' }, body: '' };
      ws.send(encodeFrame(frame));
      append({ dir: 'out', frame });
    }
    stopBeating();
    ws?.close();
    wsRef.current = null;
  };

  useEffect(() => () => disconnect(false), []);
  useEffect(() => { logEndRef.current?.scrollIntoView({ block: 'nearest' }); }, [log.length]);

  const connect = () => {
    let headers: Record<string, string>;
    try {
      const parsed = JSON.parse(connectHeaders);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      headers = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
    } catch {
      setError(t.stomp.invalidHeadersJson);
      return;
    }
    setError('');
    const url = `ws://${location.hostname}:${serverStatus.port}${connection.path}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setStatus('connecting');
    append({ dir: 'sys', text: `open ${url}` });

    ws.onopen = () => {
      const frame = { command: 'CONNECT', headers, body: '' };
      ws.send(encodeFrame(frame));
      append({ dir: 'out', frame });
    };
    ws.onmessage = (ev) => {
      const text = String(ev.data);
      if (isHeartbeat(text)) { setHeartbeats(n => n + 1); return; }
      for (const frame of decodeFrames(text)) {
        append({ dir: 'in', frame });
        if (frame.command === 'CONNECTED') {
          setStatus('connected');
          // negotiate our outgoing heartbeat: client cx vs server sy
          const [cx] = (headers['heart-beat'] ?? '0,0').split(',').map(n => parseInt(n, 10) || 0);
          const [, sy] = (frame.headers['heart-beat'] ?? '0,0').split(',').map(n => parseInt(n, 10) || 0);
          const every = cx === 0 || sy === 0 ? 0 : Math.max(cx, sy);
          stopBeating();
          if (every > 0) beatRef.current = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('\n'); }, every);
        }
      }
    };
    ws.onclose = (ev) => {
      stopBeating();
      setStatus('disconnected');
      append({ dir: 'sys', text: `close ${ev.code}${ev.reason ? ` ${ev.reason}` : ''}` });
      if (wsRef.current === ws) wsRef.current = null;
    };
    ws.onerror = () => append({ dir: 'sys', text: 'socket error' });
  };

  const sendFrame = (frame: StompFrame) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(encodeFrame(frame));
    append({ dir: 'out', frame });
  };

  const subscribe = () => {
    sendFrame({ command: 'SUBSCRIBE', headers: { id: subId, destination: subDest, ack: 'auto' }, body: '' });
    const m = subId.match(/^(.*?)(\d+)$/);
    if (m) setSubId(`${m[1]}${parseInt(m[2], 10) + 1}`);
  };
  const unsubscribe = () => sendFrame({ command: 'UNSUBSCRIBE', headers: { id: subId }, body: '' });
  const send = () => sendFrame({ command: 'SEND', headers: { destination: sendDest, 'content-type': 'application/json', 'content-length': String(byteLength(sendBody)) }, body: sendBody });

  const statusLabel: Record<Status, string> = { disconnected: t.stomp.disconnected, connecting: t.stomp.connecting, connected: t.stomp.connected };
  const isOpen = status === 'connected';

  return (
    <section>
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 text-base font-semibold text-text-primary hover:text-accent-primary">
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        {t.stomp.testClient}
        <span className={clsx('ml-2 h-2 w-2 rounded-full', isOpen ? 'bg-server-running' : status === 'connecting' ? 'bg-method-post' : 'bg-text-muted')} />
        <span className="text-xs font-normal text-text-muted">{statusLabel[status]}{heartbeats > 0 && ` · ♥ ${heartbeats}`}</span>
      </button>
      {!open && <p className="mt-1 text-xs text-text-tertiary">{t.stomp.testClientDescription}</p>}

      {open && (
        <div className="mt-3 grid grid-cols-[1fr_1.2fr] gap-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-tertiary mb-1">{t.stomp.connectHeaders}</label>
              <div className="rounded border border-border-secondary overflow-hidden">
                <CodeEditor value={connectHeaders} onChange={setConnectHeaders} height="170px" readOnly={status !== 'disconnected'} />
              </div>
              {error && <p className="mt-1 text-xs text-method-delete">{error}</p>}
            </div>
            <div className="flex gap-2">
              {isOpen || status === 'connecting' ? (
                <button onClick={() => disconnect()} className="flex items-center gap-1.5 rounded border border-border-secondary px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover">
                  <Unplug size={14} /> {t.stomp.disconnect}
                </button>
              ) : (
                <button onClick={connect} className="flex items-center gap-1.5 rounded bg-accent-primary px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110">
                  <Plug size={14} /> {t.stomp.connect}
                </button>
              )}
            </div>

            <div className={clsx('space-y-2 rounded border border-border-secondary bg-bg-surface/50 p-3', !isOpen && 'opacity-50 pointer-events-none')}>
              <div className="grid grid-cols-[100px_1fr_auto_auto] gap-2 items-end">
                <div>
                  <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1">{t.stomp.subscriptionId}</label>
                  <input value={subId} onChange={e => setSubId(e.target.value)} className={`${inputCls} w-full`} />
                </div>
                <div>
                  <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1">{t.stomp.destination}</label>
                  <input value={subDest} onChange={e => setSubDest(e.target.value)} className={`${inputCls} w-full`} />
                </div>
                <button onClick={subscribe} className="rounded bg-method-post-bg px-3 py-1.5 text-xs font-semibold text-method-post hover:brightness-110">{t.stomp.subscribe}</button>
                <button onClick={unsubscribe} className="rounded border border-border-secondary px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover">{t.stomp.unsubscribe}</button>
              </div>
              <div>
                <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1">SEND · {t.stomp.destination}</label>
                <input value={sendDest} onChange={e => setSendDest(e.target.value)} className={`${inputCls} w-full`} />
              </div>
              <div className="rounded border border-border-secondary overflow-hidden">
                <CodeEditor value={sendBody} onChange={setSendBody} height="90px" />
              </div>
              <button onClick={send} className="rounded bg-method-patch-bg px-3 py-1.5 text-xs font-semibold text-method-patch hover:brightness-110">{t.stomp.send}</button>
            </div>
          </div>

          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-text-tertiary">{t.stomp.frameLog}</label>
              <button onClick={() => { setLog([]); setHeartbeats(0); }} className="text-xs text-text-muted hover:text-text-secondary">{t.stomp.clear}</button>
            </div>
            <div className="h-[460px] overflow-y-auto rounded border border-border-secondary bg-bg-input p-2 font-mono text-[11px] space-y-1">
              {log.map(entry => (
                <div key={entry.id} className="flex gap-2">
                  <span className="text-text-muted shrink-0">{new Date(entry.at).toLocaleTimeString([], { hour12: false })}</span>
                  <span className={clsx('shrink-0 w-3', entry.dir === 'in' ? 'text-accent-primary' : entry.dir === 'out' ? 'text-text-muted' : 'text-method-post')}>
                    {entry.dir === 'in' ? '↓' : entry.dir === 'out' ? '↑' : '·'}
                  </span>
                  {entry.frame ? (
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StompCommandBadge command={entry.frame.command} />
                        {Object.entries(entry.frame.headers).map(([k, v]) => (
                          <span key={k} className="text-text-tertiary"><span className="text-code-key">{k}</span>:{v}</span>
                        ))}
                      </div>
                      {entry.frame.body && <pre className="mt-0.5 whitespace-pre-wrap break-all text-text-secondary">{entry.frame.body}</pre>}
                    </div>
                  ) : (
                    <span className="text-text-tertiary">{entry.text}</span>
                  )}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
