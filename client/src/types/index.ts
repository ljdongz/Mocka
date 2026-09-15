export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  name: string;
  activeVariantId: string | null;
  activePresetId: string | null;
  sequenceMode: 'off' | 'on';
  isEnabled: boolean;
  requestBodyContentType: string;
  requestBodyRaw: string;
  createdAt: string;
  updatedAt: string;
  queryParams: QueryParam[];
  requestHeaders: RequestHeader[];
  responseVariants: ResponseVariant[];
  sequencePresets: SequencePreset[];
}

export interface QueryParam {
  id: string;
  endpointId: string;
  key: string;
  value: string;
  isEnabled: boolean;
  sortOrder: number;
}

export interface RequestHeader {
  id: string;
  endpointId: string;
  key: string;
  value: string;
  isEnabled: boolean;
  sortOrder: number;
}

export interface MatchRule {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
  value: string;
}

export interface MatchRules {
  bodyRules: MatchRule[];
  headerRules: MatchRule[];
  queryParamRules: MatchRule[];
  pathParamRules: MatchRule[];
  combineWith: 'AND' | 'OR';
}

export interface ResponseVariant {
  id: string;
  endpointId: string;
  statusCode: number;
  description: string;
  body: string;
  headers: string;
  delay: number | null;
  memo: string;
  sortOrder: number;
  matchRules: MatchRules | null;
  variantGroup: 'standard' | 'sequence';
  presetId: string | null;
  datasetBinding?: DatasetBinding | null;
}

export interface SequencePreset {
  id: string;
  endpointId: string;
  name: string;
  mode: 'sequential' | 'loop';
  sortOrder: number;
  createdAt: string;
}

export interface Collection {
  id: string;
  name: string;
  isExpanded: boolean;
  sortOrder: number;
  createdAt: string;
  endpointIds: string[];
}

export interface RequestRecord {
  id: string;
  /** HTTP method, or the STOMP command for frame-log rows */
  method: string | null;
  /** URL path, or the STOMP destination */
  path: string;
  statusCode: number | null;
  bodyOrParams: string;
  requestHeaders: string;
  responseBody: string;
  timestamp: string;
  protocol: 'http' | 'stomp';
  /** stomp only — 'in' = client → server, 'out' = server → client */
  direction: 'in' | 'out' | null;
  sessionId: string | null;
}

export type Theme = 'dark' | 'light';
export type Language = 'en' | 'ko';

export interface Settings {
  port: number;
  responseDelay: number;
  autoSaveEndpoints: boolean;
  historyToast: boolean;
  theme: Theme;
  language: Language;
}

export interface ServerStatus {
  running: boolean;
  port: number;
  localIp: string;
}

export interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Dataset {
  id: string;
  name: string;
  keyField: string;
  records: any[];
  createdAt: string;
  updatedAt: string;
}

export interface DatasetBinding {
  datasetId: string;
  mode: 'list' | 'detail';
  /** list mode only: return just these fields per record */
  projection?: string[];
  /** detail mode: where the lookup key comes from (defaults to body[keyField]) */
  keySource?: { from: 'body' | 'path' | 'query'; field: string };
}

// ── STOMP mock ──

export type StompConnectPolicy = 'accept' | 'validate' | 'reject';
export type StompTrigger = 'send' | 'subscribe' | 'manual';
export type StompScope = 'broadcast' | 'echo' | 'user';
export type StompFireKind = 'message' | 'error' | 'receipt' | 'disconnect';

export interface StompConnection {
  id: string;
  name: string;
  path: string;
  isEnabled: boolean;
  connectPolicy: StompConnectPolicy;
  requiredHeaders: string[];
  rejectMessage: string;
  heartbeatOutgoing: number;
  heartbeatIncoming: number;
  stompVersion: string;
  defaultDelay: number | null;
  replayBufferSize: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  destinations: StompDestination[];
}

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
  variants: StompMessageVariant[];
  presets: StompPreset[];
}

export interface StompMessageVariant {
  id: string;
  destinationId: string;
  description: string;
  kind: StompFireKind;
  targetDestination: string;
  scope: StompScope;
  body: string;
  headers: string;
  delay: number | null;
  repeatIntervalMs: number | null;
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

export interface StompPushOptions {
  destination: string;
  body?: string;
  headers?: Record<string, string>;
  scope?: StompScope;
  sessionId?: string | null;
  delay?: number;
  jitter?: number;
  times?: number;
}

export interface StompFireOutcome {
  delivered: number;
  buffered: boolean;
  scheduled: boolean;
}

export type StompInjectKind = 'error' | 'disconnect' | 'stop-heartbeat' | 'malformed';

export interface StompInjectPayload {
  kind: StompInjectKind;
  message?: string;
  body?: string;
  code?: number;
  reason?: string;
}

export interface StompStats {
  sessions: number;
  subscribers: Record<string, number>;
}
