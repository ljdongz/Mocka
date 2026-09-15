/**
 * Subscription registry, one namespace per connection. Pure bookkeeping —
 * the runtime looks sessions up and sends; this module only answers
 * "who is subscribed to what".
 *
 * `/user/...` subscriptions follow Spring's convention: a client subscribes
 * `/user/queue/inbox`, the server addresses it as `/queue/inbox` for that one
 * session, and the MESSAGE `destination` header echoes the original
 * `/user/queue/inbox`.
 */
import { matchDestination } from './destination-matcher.js';

export interface Subscription {
  connectionId: string;
  sessionId: string;
  subscriptionId: string;
  /** destination as the client sent it (may itself be a pattern) */
  destination: string;
}

export interface ReplayEntry {
  destination: string;
  body: string;
  headers: Record<string, string>;
}

const subs = new Map<string, Subscription[]>();
/** connectionId → literal destination → buffered messages (oldest first) */
const replay = new Map<string, Map<string, ReplayEntry[]>>();

const USER_PREFIX = '/user/';

function list(connectionId: string): Subscription[] {
  let arr = subs.get(connectionId);
  if (!arr) { arr = []; subs.set(connectionId, arr); }
  return arr;
}

function isUserQueue(destination: string): boolean {
  return destination.startsWith(USER_PREFIX);
}

/** `/user/queue/inbox` → `/queue/inbox`; anything else unchanged. */
export function stripUserPrefix(destination: string): string {
  return isUserQueue(destination) ? destination.slice(USER_PREFIX.length - 1) : destination;
}

function covers(subscriptionDestination: string, destination: string): boolean {
  return subscriptionDestination === destination || matchDestination(subscriptionDestination, destination) !== null;
}

export function subscribe(sub: Subscription): void {
  const arr = list(sub.connectionId);
  const idx = arr.findIndex(s => s.sessionId === sub.sessionId && s.subscriptionId === sub.subscriptionId);
  if (idx !== -1) arr[idx] = sub; // re-subscribing with the same id replaces
  else arr.push(sub);
}

export function unsubscribe(connectionId: string, sessionId: string, subscriptionId: string): boolean {
  const arr = list(connectionId);
  const idx = arr.findIndex(s => s.sessionId === sessionId && s.subscriptionId === subscriptionId);
  if (idx === -1) return false;
  arr.splice(idx, 1);
  return true;
}

export function unsubscribeSession(connectionId: string, sessionId: string): void {
  const arr = subs.get(connectionId);
  if (!arr) return;
  subs.set(connectionId, arr.filter(s => s.sessionId !== sessionId));
}

export function listSubscriptions(connectionId: string): Subscription[] {
  return [...list(connectionId)];
}

/** Subscribers that receive a message addressed to `destination` (user queues only when addressed as /user/…). */
export function matchSubscribers(connectionId: string, destination: string): Subscription[] {
  const userAddressed = isUserQueue(destination);
  return list(connectionId).filter(s => (userAddressed || !isUserQueue(s.destination)) && covers(s.destination, destination));
}

/** One session's /user/… subscriptions that a `convertAndSendToUser(destination)` would reach. */
export function matchUserSubscribers(connectionId: string, sessionId: string, destination: string): Subscription[] {
  const target = stripUserPrefix(destination);
  return list(connectionId).filter(s =>
    s.sessionId === sessionId && isUserQueue(s.destination) && covers(stripUserPrefix(s.destination), target));
}

/** How many subscriptions overlap a destination pattern (either side may be the pattern). */
export function countSubscribers(connectionId: string, pattern: string): number {
  return list(connectionId).filter(s => covers(pattern, s.destination) || covers(s.destination, pattern)).length;
}

export function pushReplay(connectionId: string, entry: ReplayEntry, size: number): void {
  if (size <= 0) return;
  let perDest = replay.get(connectionId);
  if (!perDest) { perDest = new Map(); replay.set(connectionId, perDest); }
  let arr = perDest.get(entry.destination);
  if (!arr) { arr = []; perDest.set(entry.destination, arr); }
  arr.push(entry);
  while (arr.length > size) arr.shift();
}

/** Buffered messages a new subscription to `subscriptionPattern` should receive, oldest first. Not consumed. */
export function takeReplay(connectionId: string, subscriptionPattern: string): ReplayEntry[] {
  const perDest = replay.get(connectionId);
  if (!perDest) return [];
  const out: ReplayEntry[] = [];
  for (const [literal, entries] of perDest) {
    if (covers(subscriptionPattern, literal)) out.push(...entries);
  }
  return out;
}

export function clearConnection(connectionId: string): void {
  subs.delete(connectionId);
  replay.delete(connectionId);
}

export function resetAll(): void {
  subs.clear();
  replay.clear();
}
