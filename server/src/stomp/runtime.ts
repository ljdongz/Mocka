/**
 * Fire engine + runtime controls exposed to the admin API. Task 7 ships the
 * session-level controls; delivery, push and variant firing arrive with the
 * broker and fire modules.
 */
import * as session from './session.js';
import * as broker from './broker.js';
import * as stompService from '../services/stomp.service.js';
import { emit } from '../services/domain-events.js';

/** Repeat timers for manual (session-less) fires, per connection. */
const connectionTimers = new Map<string, Set<NodeJS.Timeout>>();

export function trackConnectionTimer(connectionId: string, t: NodeJS.Timeout): void {
  let set = connectionTimers.get(connectionId);
  if (!set) { set = new Set(); connectionTimers.set(connectionId, set); }
  set.add(t);
}

export function untrackConnectionTimer(connectionId: string, t: NodeJS.Timeout): void {
  connectionTimers.get(connectionId)?.delete(t);
}

export function stopRepeats(connectionId: string): void {
  const set = connectionTimers.get(connectionId);
  if (!set) return;
  for (const t of set) { clearTimeout(t); clearInterval(t); }
  set.clear();
}

export function disconnectSession(sessionId: string, code = 1011, reason = 'disconnected by mock'): boolean {
  if (!session.getSession(sessionId)) return false;
  session.teardown(sessionId, { code, reason });
  return true;
}

export function stopHeartbeat(sessionId: string): boolean {
  const s = session.getSession(sessionId);
  if (!s) return false;
  session.stopHeartbeatSending(s);
  emit('stomp:session:updated', session.toInfo(s));
  return true;
}

export function teardownConnection(connectionId: string): void {
  stopRepeats(connectionId);
  session.teardownConnection(connectionId);
  broker.clearConnection(connectionId);
}

/** Drop every session, subscription, replay buffer and timer (mock server restart / tests). */
export function resetAll(): void {
  session.teardownAll();
  broker.resetAll();
  for (const id of connectionTimers.keys()) stopRepeats(id);
  connectionTimers.clear();
}

// Disabling or deleting a connection must kill its live sessions and repeaters.
stompService.setConnectionDisabledHook(teardownConnection);
