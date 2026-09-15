/**
 * Session lifecycle: one record per WebSocket, heartbeat timers, frame log,
 * and the single `teardown` routine that DISCONNECT, raw close, injection and
 * server shutdown all funnel through (so no timer outlives its socket).
 */
import { randomUUID } from 'crypto';
import type { WebSocket } from 'ws';
import { encodeFrame, StompFrameDecoder, HEARTBEAT, type StompFrame } from './frame.js';
import * as broker from './broker.js';
import * as historyService from '../services/history.service.js';
import { emit } from '../services/domain-events.js';
import type { StompSessionInfo } from '../models/stomp.js';

export interface StompSession {
  id: string;
  connectionId: string;
  connectionPath: string;
  socket: WebSocket;
  state: 'connecting' | 'connected';
  connectedAt: string;
  /** CONNECT frame headers as received — templates and match rules read these */
  clientHeaders: Record<string, string>;
  /** subscriptionId → destination as the client sent it */
  subscriptions: Map<string, string>;
  heartbeat: {
    outgoing: number;
    incoming: number;
    sendTimer: NodeJS.Timeout | null;
    watchdog: NodeJS.Timeout | null;
    lastRxAt: number;
  };
  /** repeat / delayed fire timers owned by this session */
  timers: Set<NodeJS.Timeout>;
  decoder: StompFrameDecoder;
}

/** Client silence tolerated before the server closes a heartbeat-negotiated session (Spring uses 3×). */
const HEARTBEAT_TOLERANCE = 3;
const WS_CONNECTING = 0;
const WS_OPEN = 1;

const sessions = new Map<string, StompSession>();

export function createSession(connectionId: string, connectionPath: string, socket: WebSocket): StompSession {
  const s: StompSession = {
    id: randomUUID(),
    connectionId,
    connectionPath,
    socket,
    state: 'connecting',
    connectedAt: '',
    clientHeaders: {},
    subscriptions: new Map(),
    heartbeat: { outgoing: 0, incoming: 0, sendTimer: null, watchdog: null, lastRxAt: Date.now() },
    timers: new Set(),
    decoder: new StompFrameDecoder(),
  };
  sessions.set(s.id, s);
  return s;
}

export function getSession(id: string): StompSession | undefined {
  return sessions.get(id);
}

export function listSessions(connectionId?: string): StompSessionInfo[] {
  const out: StompSessionInfo[] = [];
  for (const s of sessions.values()) {
    if (!connectionId || s.connectionId === connectionId) out.push(toInfo(s));
  }
  return out;
}

export function toInfo(s: StompSession): StompSessionInfo {
  return {
    id: s.id,
    connectionId: s.connectionId,
    connectionPath: s.connectionPath,
    state: s.state,
    connectedAt: s.connectedAt,
    clientHeaders: { ...s.clientHeaders },
    subscriptions: [...s.subscriptions.entries()].map(([id, destination]) => ({ id, destination })),
    heartbeat: {
      outgoing: s.heartbeat.outgoing,
      incoming: s.heartbeat.incoming,
      sending: s.heartbeat.sendTimer !== null,
      lastRxAt: s.heartbeat.lastRxAt,
    },
  };
}

/** Any inbound bytes count as liveness for the watchdog. */
export function touch(s: StompSession): void {
  s.heartbeat.lastRxAt = Date.now();
}

export function sendRaw(s: StompSession, text: string): void {
  if (s.socket.readyState === WS_OPEN) s.socket.send(text);
}

export function sendFrame(s: StompSession, frame: StompFrame): void {
  sendRaw(s, encodeFrame(frame));
  logFrame(s, 'out', frame);
}

export function logFrame(s: StompSession, direction: 'in' | 'out', frame: StompFrame): void {
  historyService.record({
    method: frame.command,
    path: frame.headers.destination ?? s.connectionPath,
    statusCode: 0,
    bodyOrParams: frame.body,
    requestHeaders: JSON.stringify(frame.headers),
    responseBody: '',
    protocol: 'stomp',
    direction,
    sessionId: s.id,
  });
}

export function startHeartbeat(s: StompSession, sendEvery: number, expectEvery: number): void {
  s.heartbeat.outgoing = sendEvery;
  s.heartbeat.incoming = expectEvery;
  s.heartbeat.lastRxAt = Date.now();
  if (sendEvery > 0) {
    s.heartbeat.sendTimer = setInterval(() => sendRaw(s, HEARTBEAT), sendEvery);
  }
  if (expectEvery > 0) {
    const period = Math.max(10, Math.floor(expectEvery / 2));
    s.heartbeat.watchdog = setInterval(() => {
      if (Date.now() - s.heartbeat.lastRxAt > expectEvery * HEARTBEAT_TOLERANCE) {
        teardown(s.id, { code: 1002, reason: 'heartbeat timeout' });
      }
    }, period);
  }
}

/** Failure injection: keep the socket open but go silent (zombie). */
export function stopHeartbeatSending(s: StompSession): void {
  if (s.heartbeat.sendTimer) {
    clearInterval(s.heartbeat.sendTimer);
    s.heartbeat.sendTimer = null;
  }
}

export function teardown(sessionId: string, opts: { code?: number; reason?: string } = {}): void {
  const s = sessions.get(sessionId);
  if (!s) return;
  sessions.delete(sessionId);
  if (s.heartbeat.sendTimer) clearInterval(s.heartbeat.sendTimer);
  if (s.heartbeat.watchdog) clearInterval(s.heartbeat.watchdog);
  s.heartbeat.sendTimer = null;
  s.heartbeat.watchdog = null;
  for (const t of s.timers) { clearTimeout(t); clearInterval(t); }
  s.timers.clear();
  broker.unsubscribeSession(s.connectionId, s.id);
  s.subscriptions.clear();
  const state = s.socket.readyState;
  if (state === WS_CONNECTING || state === WS_OPEN) {
    try { s.socket.close(opts.code ?? 1000, opts.reason ?? ''); } catch { /* already closing */ }
  }
  emit('stomp:session:closed', { id: s.id, connectionId: s.connectionId });
}

export function teardownConnection(connectionId: string): void {
  for (const s of [...sessions.values()]) {
    if (s.connectionId === connectionId) teardown(s.id, { code: 1001, reason: 'connection disabled' });
  }
}

export function teardownAll(): void {
  for (const id of [...sessions.keys()]) teardown(id, { code: 1001, reason: 'server shutdown' });
}
