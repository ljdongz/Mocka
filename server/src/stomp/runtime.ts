/**
 * Fire engine + runtime controls. Turns a selected variant (or an ad-hoc push)
 * into frames on live sockets: scope resolution through the broker, delayed
 * and repeating fires (re-templated every tick), the non-message kinds
 * (ERROR / RECEIPT / disconnect) and the failure injections the admin API
 * exposes. Session-bound timers live on the session; manual ones on the
 * connection, so both die with their owner.
 */
import * as session from './session.js';
import { getSession, sendFrame, sendRaw, teardown, toInfo, type StompSession } from './session.js';
import * as broker from './broker.js';
import { buildFirePlan, buildMessageFrame, pickVariantPool, resolveStompTemplate, selectVariant, type FireContext, type FirePlan } from './fire.js';
import * as stompService from '../services/stomp.service.js';
import * as stompRegistry from '../services/stomp-registry.js';
import * as environmentService from '../services/environment.service.js';
import { emit } from '../services/domain-events.js';
import type { StompConnection, StompDestination, StompMessageVariant, StompScope } from '../models/stomp.js';

export interface PushOptions {
  destination: string;
  body?: string;
  headers?: Record<string, string>;
  scope?: StompScope;
  sessionId?: string | null;
  /** ms; defaults to the connection's defaultDelay */
  delay?: number;
  /** ms; delay ± jitter */
  jitter?: number;
  /** send the same frame N times (duplicate delivery) */
  times?: number;
}

export interface FireOutcome {
  /** subscriptions reached; -1 when the fire was scheduled for later */
  delivered: number;
  /** nobody was subscribed and the connection kept the message for replay */
  buffered: boolean;
  scheduled: boolean;
}

/** Repeat timers for manual (session-less) fires, per connection. */
const connectionTimers = new Map<string, Set<NodeJS.Timeout>>();

function trackTimer(connectionId: string, s: StompSession | null, t: NodeJS.Timeout): void {
  if (s) { s.timers.add(t); return; }
  let set = connectionTimers.get(connectionId);
  if (!set) { set = new Set(); connectionTimers.set(connectionId, set); }
  set.add(t);
}

function untrackTimer(connectionId: string, s: StompSession | null, t: NodeJS.Timeout): void {
  if (s) { s.timers.delete(t); return; }
  connectionTimers.get(connectionId)?.delete(t);
}

export function stopRepeats(connectionId: string): void {
  const set = connectionTimers.get(connectionId);
  if (!set) return;
  for (const t of set) { clearTimeout(t); clearInterval(t); }
  set.clear();
}

// ── delivery ──

/** Send a MESSAGE to every subscription the scope selects. */
export function deliverMessage(
  connection: StompConnection,
  target: string,
  body: string,
  headers: Record<string, string>,
  scope: StompScope,
  s: StompSession | null,
): { delivered: number; buffered: boolean } {
  let subs: broker.Subscription[];
  if (scope === 'broadcast') {
    subs = broker.matchSubscribers(connection.id, target);
  } else if (!s) {
    subs = [];
  } else if (scope === 'echo') {
    subs = broker.matchSubscribers(connection.id, target).filter(x => x.sessionId === s.id);
  } else {
    subs = broker.matchUserSubscribers(connection.id, s.id, target);
  }

  for (const sub of subs) {
    const target_session = getSession(sub.sessionId);
    if (target_session) sendFrame(target_session, buildMessageFrame(sub.destination, sub.subscriptionId, body, headers));
  }

  let buffered = false;
  if (subs.length === 0 && scope === 'broadcast' && connection.replayBufferSize > 0) {
    broker.pushReplay(connection.id, { destination: target, body, headers }, connection.replayBufferSize);
    buffered = true;
  }
  return { delivered: subs.length, buffered };
}

function runPlan(plan: FirePlan, connection: StompConnection, s: StompSession | null, receiptId?: string): FireOutcome {
  switch (plan.kind) {
    case 'message': {
      const r = deliverMessage(connection, plan.targetDestination, plan.body, plan.headers, plan.scope, s);
      return { ...r, scheduled: false };
    }
    case 'error': {
      if (!s || !getSession(s.id)) return { delivered: 0, buffered: false, scheduled: false };
      const headers: Record<string, string> = { ...plan.headers, message: plan.headers.message ?? 'injected error' };
      if (plan.body) headers['content-length'] = String(Buffer.byteLength(plan.body));
      sendFrame(s, { command: 'ERROR', headers, body: plan.body });
      teardown(s.id, { code: 1002, reason: headers.message });
      return { delivered: 1, buffered: false, scheduled: false };
    }
    case 'receipt': {
      if (!s || !getSession(s.id)) return { delivered: 0, buffered: false, scheduled: false };
      const id = plan.headers['receipt-id'] ?? receiptId ?? '';
      sendFrame(s, { command: 'RECEIPT', headers: { ...plan.headers, 'receipt-id': id }, body: '' });
      return { delivered: 1, buffered: false, scheduled: false };
    }
    case 'disconnect': {
      if (!s || !getSession(s.id)) return { delivered: 0, buffered: false, scheduled: false };
      const code = Number(plan.headers.code);
      teardown(s.id, { code: Number.isInteger(code) && code >= 1000 ? code : 1011, reason: plan.headers.reason ?? 'injected disconnect' });
      return { delivered: 1, buffered: false, scheduled: false };
    }
  }
}

/**
 * Execute a variant for a trigger context. Delay and repeat come from the
 * variant (delay falls back to the connection default); every tick
 * re-templates so {{$isoTimestamp}} and friends move.
 */
export function executeFire(variant: StompMessageVariant, ctx: FireContext, s: StompSession | null, receiptId?: string): FireOutcome {
  const connection = ctx.connection;
  const runOnce = () => runPlan(buildFirePlan(variant, ctx), connection, s, receiptId);
  const delay = Math.max(0, variant.delay ?? connection.defaultDelay ?? 0);
  const interval = variant.repeatIntervalMs;

  if (!interval || interval <= 0) {
    if (delay > 0) {
      const t = setTimeout(() => { untrackTimer(connection.id, s, t); runOnce(); }, delay);
      trackTimer(connection.id, s, t);
      return { delivered: -1, buffered: false, scheduled: true };
    }
    return runOnce();
  }

  let count = 0;
  const limit = variant.repeatCount;
  const kickoff = (): FireOutcome => {
    const first = runOnce();
    count++;
    if (limit !== null && count >= limit) return first;
    const iv = setInterval(() => {
      if (s && !getSession(s.id)) { clearInterval(iv); untrackTimer(connection.id, s, iv); return; }
      runOnce();
      count++;
      if (limit !== null && count >= limit) { clearInterval(iv); untrackTimer(connection.id, s, iv); }
    }, interval);
    trackTimer(connection.id, s, iv);
    return { ...first, scheduled: true };
  };

  if (delay > 0) {
    const t = setTimeout(() => { untrackTimer(connection.id, s, t); kickoff(); }, delay);
    trackTimer(connection.id, s, t);
    return { delivered: -1, buffered: false, scheduled: true };
  }
  return kickoff();
}

function manualContext(connection: StompConnection, triggerDestination: string, s: StompSession | null): FireContext {
  return {
    connection,
    triggerDestination,
    captures: [],
    frameHeaders: {},
    connectHeaders: s?.clientHeaders ?? {},
    body: {},
    rawBody: '',
    sessionId: s?.id ?? null,
    subscriptionId: null,
    envVars: environmentService.getActiveVariables(),
  };
}

function resolveTargetSession(scope: StompScope, sessionId: string | null | undefined): StompSession | null {
  if (scope !== 'broadcast' && !sessionId) throw new Error('sessionId is required for echo/user scope');
  if (!sessionId) return null;
  const s = getSession(sessionId);
  if (!s) throw new Error('session not found');
  return s;
}

/** Ad-hoc message from the UI / MCP. Immediate pushes report real delivery counts. */
export function push(connection: StompConnection, opts: PushOptions): FireOutcome {
  const scope = opts.scope ?? 'broadcast';
  const s = resolveTargetSession(scope, opts.sessionId);
  const times = Math.max(1, Math.floor(opts.times ?? 1));
  const jitter = opts.jitter ? Math.round((Math.random() * 2 - 1) * opts.jitter) : 0;
  const delay = Math.max(0, (opts.delay ?? connection.defaultDelay ?? 0) + jitter);
  const ctx = manualContext(connection, opts.destination, s);

  const run = (): FireOutcome => {
    let delivered = 0;
    let buffered = false;
    for (let i = 0; i < times; i++) {
      const target = resolveStompTemplate(opts.destination, ctx);
      const body = resolveStompTemplate(opts.body ?? '', ctx);
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(opts.headers ?? {})) headers[k] = resolveStompTemplate(String(v), ctx);
      const r = deliverMessage(connection, target, body, headers, scope, s);
      delivered += r.delivered;
      buffered = buffered || r.buffered;
    }
    return { delivered, buffered, scheduled: false };
  };

  if (delay > 0) {
    const t = setTimeout(() => { untrackTimer(connection.id, s, t); run(); }, delay);
    trackTimer(connection.id, s, t);
    return { delivered: -1, buffered: false, scheduled: true };
  }
  return run();
}

function findDestination(destinationId: string): { connection: StompConnection; destination: StompDestination } | null {
  for (const connection of stompRegistry.all()) {
    const destination = connection.destinations?.find(d => d.id === destinationId);
    if (destination) return { connection, destination };
  }
  return null;
}

/** Fire a destination's currently selected variant by hand (manual trigger, but any trigger may be poked). */
export function fireDestination(destinationId: string, sessionId?: string | null): FireOutcome {
  const found = findDestination(destinationId);
  if (!found) throw new Error('destination not found');
  const { connection, destination } = found;
  const s = sessionId ? getSession(sessionId) ?? null : null;
  if (sessionId && !s) throw new Error('session not found');

  const ctx = manualContext(connection, destination.pattern, s);
  const { variants, presetMode } = pickVariantPool(destination);
  const variant = selectVariant(destination, variants, presetMode, ctx);
  if (!variant) throw new Error('destination has no variant');
  if (variant.scope !== 'broadcast' && !s) throw new Error('sessionId is required for echo/user scope');
  if (variant.kind !== 'message' && !s) throw new Error(`sessionId is required for a ${variant.kind} variant`);
  return executeFire(variant, ctx, s);
}

// ── failure injection ──

export function injectError(sessionId: string, message = 'injected error', body = ''): boolean {
  const s = getSession(sessionId);
  if (!s) return false;
  const headers: Record<string, string> = { message };
  if (body) headers['content-length'] = String(Buffer.byteLength(body));
  sendFrame(s, { command: 'ERROR', headers, body });
  teardown(sessionId, { code: 1002, reason: message });
  return true;
}

export function disconnectSession(sessionId: string, code = 1011, reason = 'disconnected by mock'): boolean {
  if (!getSession(sessionId)) return false;
  teardown(sessionId, { code, reason });
  return true;
}

/** Zombie socket: stop our heartbeats, keep the connection open. */
export function stopHeartbeat(sessionId: string): boolean {
  const s = getSession(sessionId);
  if (!s) return false;
  session.stopHeartbeatSending(s);
  emit('stomp:session:updated', toInfo(s));
  return true;
}

/** Bytes that are not a STOMP frame — the client's parser should refuse them. */
export function sendMalformed(sessionId: string): boolean {
  const s = getSession(sessionId);
  if (!s) return false;
  sendRaw(s, 'BOGUS\nnot-a-header\n\nno terminator');
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
