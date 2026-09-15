import type { MatchRules } from './response-variant.js';
import type { DatasetBinding } from './dataset.js';

export const STOMP_CONNECT_POLICIES = ['accept', 'validate', 'reject'] as const;
export type StompConnectPolicy = (typeof STOMP_CONNECT_POLICIES)[number];

export const STOMP_TRIGGERS = ['send', 'subscribe', 'manual'] as const;
export type StompTrigger = (typeof STOMP_TRIGGERS)[number];

export const STOMP_SCOPES = ['broadcast', 'echo', 'user'] as const;
export type StompScope = (typeof STOMP_SCOPES)[number];

export const STOMP_FIRE_KINDS = ['message', 'error', 'receipt', 'disconnect'] as const;
export type StompFireKind = (typeof STOMP_FIRE_KINDS)[number];

/** Broker namespace boundary: one WebSocket upgrade path with its own destinations and subscribers. */
export interface StompConnection {
  id: string;
  name: string;
  /** WS upgrade path — the identifier; unique */
  path: string;
  isEnabled: boolean;
  connectPolicy: StompConnectPolicy;
  /** validate policy: CONNECT is rejected when any of these headers is empty */
  requiredHeaders: string[];
  /** ERROR `message` header on reject / failed validation */
  rejectMessage: string;
  /** advertised in CONNECTED heart-beat as "outgoing,incoming" (ms); 0 disables a direction */
  heartbeatOutgoing: number;
  heartbeatIncoming: number;
  stompVersion: string;
  /** default fire delay in ms for every variant of this connection */
  defaultDelay: number | null;
  /** messages kept per literal destination when nobody is subscribed; 0 = drop */
  replayBufferSize: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  destinations?: StompDestination[];
}

/** Trigger row: send / subscribe pattern or a manual push target. */
export interface StompDestination {
  id: string;
  connectionId: string;
  name: string;
  pattern: string;
  trigger: StompTrigger;
  isEnabled: boolean;
  activeVariantId: string | null;
  activePresetId: string | null;
  sequenceMode: 'off' | 'on';
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  variants?: StompMessageVariant[];
  presets?: StompPreset[];
}

/** Fire unit: trigger × scope × payload. */
export interface StompMessageVariant {
  id: string;
  destinationId: string;
  description: string;
  kind: StompFireKind;
  /** kind=message: destination template; empty = the triggered destination */
  targetDestination: string;
  scope: StompScope;
  body: string;
  /** extra frame headers as a JSON object string */
  headers: string;
  /** ms */
  delay: number | null;
  repeatIntervalMs: number | null;
  /** null = infinite while the session (or connection) lives */
  repeatCount: number | null;
  matchRules: MatchRules | null;
  datasetBinding: DatasetBinding | null;
  variantGroup: 'standard' | 'sequence';
  presetId: string | null;
  memo: string;
  sortOrder: number;
}

export interface StompPreset {
  id: string;
  destinationId: string;
  name: string;
  mode: 'sequential' | 'loop';
  sortOrder: number;
  createdAt: string;
}

export interface StompSessionInfo {
  id: string;
  connectionId: string;
  connectionPath: string;
  state: 'connecting' | 'connected';
  connectedAt: string;
  clientHeaders: Record<string, string>;
  subscriptions: { id: string; destination: string }[];
  heartbeat: { outgoing: number; incoming: number; sending: boolean; lastRxAt: number };
}

/** Ensure a leading '/', strip trailing '/', collapse repeated '/'. Empty → '/'. */
export function normalizeStompPath(p: string): string {
  let s = ('/' + (p ?? '').trim()).replace(/\/{2,}/g, '/');
  if (s.length > 1) s = s.replace(/\/+$/, '');
  return s || '/';
}
