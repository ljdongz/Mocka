/**
 * Admin-facing façade over the STOMP runtime (sessions, push, injection).
 * Routes and MCP go through here; it never touches sockets directly.
 */
import * as runtime from '../stomp/runtime.js';
import * as session from '../stomp/session.js';
import * as broker from '../stomp/broker.js';
import * as stompRegistry from './stomp-registry.js';
import type { StompSessionInfo } from '../models/stomp.js';

export type InjectKind = 'error' | 'disconnect' | 'stop-heartbeat' | 'malformed';

export interface InjectPayload {
  kind: InjectKind;
  message?: string;
  body?: string;
  code?: number;
  reason?: string;
}

export function listSessions(connectionId?: string): StompSessionInfo[] {
  return session.listSessions(connectionId);
}

export function push(connectionId: string, opts: runtime.PushOptions): runtime.FireOutcome {
  const connection = stompRegistry.getById(connectionId);
  if (!connection) throw new Error('connection not found');
  if (!opts.destination || !String(opts.destination).trim()) throw new Error('destination is required');
  return runtime.push(connection, opts);
}

export function fireDestination(destinationId: string, sessionId?: string | null): runtime.FireOutcome {
  return runtime.fireDestination(destinationId, sessionId);
}

export function disconnect(sessionId: string, code?: number, reason?: string): boolean {
  return runtime.disconnectSession(sessionId, code, reason);
}

export function inject(sessionId: string, payload: InjectPayload): boolean {
  switch (payload.kind) {
    case 'error': return runtime.injectError(sessionId, payload.message ?? 'injected error', payload.body ?? '');
    case 'disconnect': return runtime.disconnectSession(sessionId, payload.code, payload.reason);
    case 'stop-heartbeat': return runtime.stopHeartbeat(sessionId);
    case 'malformed': return runtime.sendMalformed(sessionId);
    default: throw new Error(`unknown injection kind ${(payload as any).kind}`);
  }
}

export function stopRepeats(connectionId: string): void {
  runtime.stopRepeats(connectionId);
}

/** Live counts the UI uses to warn about destinations nobody listens to. */
export function stats(connectionId: string): { sessions: number; subscribers: Record<string, number> } | null {
  const connection = stompRegistry.getById(connectionId);
  if (!connection) return null;
  const subscribers: Record<string, number> = {};
  for (const d of connection.destinations ?? []) {
    subscribers[d.id] = broker.countSubscribers(connectionId, d.pattern);
  }
  return { sessions: session.listSessions(connectionId).length, subscribers };
}
