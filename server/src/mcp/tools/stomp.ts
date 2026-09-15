import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mockaFetch, toolResult, toolError } from '../client.js';

const matchRuleSchema = z.object({
  field: z.string(),
  operator: z.enum(['equals', 'contains', 'startsWith', 'endsWith', 'regex']),
  value: z.string(),
});

const matchRulesSchema = z.object({
  bodyRules: z.array(matchRuleSchema).optional().default([]),
  headerRules: z.array(matchRuleSchema).optional().default([]).describe('Header rules see the SEND frame headers merged with the session\'s CONNECT headers (e.g. x-client-type)'),
  queryParamRules: z.array(matchRuleSchema).optional().default([]),
  pathParamRules: z.array(matchRuleSchema).optional().default([]).describe('Rules on destination wildcard captures; field "1" is the first * of the pattern'),
  combineWith: z.enum(['AND', 'OR']).optional().default('AND'),
});

const datasetBindingSchema = z.object({
  datasetId: z.string(),
  mode: z.enum(['list', 'detail']),
  projection: z.array(z.string()).optional(),
  keySource: z.object({ from: z.enum(['body', 'path']), field: z.string() }).optional()
    .describe('detail mode: where the lookup key comes from — body field, or path capture number ("1")'),
});

const scopeEnum = z.enum(['broadcast', 'echo', 'user']);
const kindEnum = z.enum(['message', 'error', 'receipt', 'disconnect']);
const triggerEnum = z.enum(['send', 'subscribe', 'manual']);

const TEMPLATE_HINT =
  'Templates: {{$destCapture N}} (N-th * of the pattern, 1-based), {{$destSeg N}} (N-th destination segment, 0-based), ' +
  "{{$destination}}, {{$sessionId}}, {{$subscriptionId}}, {{$stompHeader 'x'}} (trigger frame header), {{$connectHeader 'x-client-type'}} (CONNECT header), " +
  "plus Mocka's {{$body 'field'}}, {{$randomUUID}}, {{$isoTimestamp}}, {{ENV_VAR}} and {{$dataset}}.";

const variantFields = {
  description: z.string().optional().describe('Label shown in the UI'),
  kind: kindEnum.optional().describe('message (default) sends a MESSAGE; error sends ERROR and closes; receipt sends RECEIPT; disconnect closes the socket (headers {"code":"4001","reason":"..."})'),
  scope: scopeEnum.optional().describe('broadcast = every subscriber of the target destination (default); echo = only the session that triggered; user = the session\'s /user queue (convertAndSendToUser)'),
  targetDestination: z.string().optional().describe('Destination template to deliver to. Empty = the triggered destination. Typical send rule: "/topic/rooms/{{$destCapture 1}}". ' + TEMPLATE_HINT),
  body: z.string().optional().describe('Message body template (JSON string). ' + TEMPLATE_HINT),
  headers: z.record(z.string()).optional().describe('Extra frame headers (values are templates). For kind=error use {"message":"..."}; kind=disconnect {"code":"4001","reason":"..."}'),
  delay: z.number().min(0).nullable().optional().describe('Fire delay in ms (null = connection default)'),
  repeatIntervalMs: z.number().min(1).nullable().optional().describe('Repeat every N ms (re-templated each tick)'),
  repeatCount: z.number().int().min(1).nullable().optional().describe('Stop after N fires; null = until the session/connection ends'),
  matchRules: matchRulesSchema.nullable().optional().describe('Pick this variant only when the rules match (checked before sequence/active)'),
  datasetBinding: datasetBindingSchema.nullable().optional().describe('Inject a dataset where {{$dataset}} appears in the body'),
  memo: z.string().optional(),
};

function normalizeVariantPayload(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  if (out.headers && typeof out.headers === 'object') out.headers = JSON.stringify(out.headers);
  if (typeof out.body === 'string') {
    out.body = (out.body as string).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
    try { out.body = JSON.stringify(JSON.parse(out.body as string), null, 2); } catch { /* keep as-is (templates are not JSON yet) */ }
  }
  return out;
}

export function registerStompTools(server: McpServer) {
  // ── connections ──

  server.tool(
    'list_connections',
    'List STOMP connections with their destinations, message variants and presets. A connection is one WebSocket upgrade path (e.g. /api/app/ws/chat) with its own broker namespace; point the app\'s socket URL at ws://<mock-host>:4650<path>.',
    {},
    async () => {
      try { return toolResult(await mockaFetch('/api/stomp/connections')); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'create_stomp_connection',
    'Create a STOMP connection (WebSocket upgrade path). CONNECT is accepted by default; connectPolicy=validate rejects when requiredHeaders are missing, reject refuses everyone (client sees .rejected). Heartbeat values are advertised in CONNECTED and negotiated per STOMP 1.2 (max of both sides; 0 disables).',
    {
      path: z.string().describe('WebSocket path, e.g. /api/app/ws/chat'),
      name: z.string().optional(),
      connectPolicy: z.enum(['accept', 'validate', 'reject']).optional(),
      requiredHeaders: z.array(z.string()).optional().describe('validate policy: CONNECT headers that must be non-empty, e.g. ["Authorization","x-device-id"]'),
      rejectMessage: z.string().optional().describe('ERROR message header on rejection'),
      heartbeatOutgoing: z.number().int().min(0).optional().describe('ms the server sends heartbeats (default 10000)'),
      heartbeatIncoming: z.number().int().min(0).optional().describe('ms the server expects client heartbeats (default 10000)'),
      stompVersion: z.string().optional(),
      defaultDelay: z.number().min(0).nullable().optional().describe('Default fire delay in ms for every variant'),
      replayBufferSize: z.number().int().min(0).optional().describe('Keep the last N messages per destination when nobody is subscribed and replay them on SUBSCRIBE (0 = drop, like a real broker)'),
    },
    async (params) => {
      try { return toolResult(await mockaFetch('/api/stomp/connections', { method: 'POST', body: JSON.stringify(params) })); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'update_stomp_connection',
    'Update a STOMP connection (path, policy, heartbeat, delay, replay buffer, enabled). Disabling closes its live sessions.',
    {
      id: z.string().describe('Connection ID'),
      path: z.string().optional(),
      name: z.string().optional(),
      isEnabled: z.boolean().optional(),
      connectPolicy: z.enum(['accept', 'validate', 'reject']).optional(),
      requiredHeaders: z.array(z.string()).optional(),
      rejectMessage: z.string().optional(),
      heartbeatOutgoing: z.number().int().min(0).optional(),
      heartbeatIncoming: z.number().int().min(0).optional(),
      stompVersion: z.string().optional(),
      defaultDelay: z.number().min(0).nullable().optional(),
      replayBufferSize: z.number().int().min(0).optional(),
    },
    async ({ id, ...data }) => {
      try { return toolResult(await mockaFetch(`/api/stomp/connections/${id}`, { method: 'PUT', body: JSON.stringify(data) })); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'delete_stomp_connection',
    'Delete a STOMP connection with all its destinations and variants; live sessions are closed.',
    { id: z.string().describe('Connection ID') },
    async ({ id }) => {
      try { await mockaFetch(`/api/stomp/connections/${id}`, { method: 'DELETE' }); return toolResult({ success: true }); } catch (e) { return toolError(e); }
    },
  );

  // ── destinations ──

  server.tool(
    'create_destination',
    'Add a destination rule to a connection. trigger=send fires when the client SENDs to a matching destination (map the app\'s send(destination:) calls here, e.g. /app/rooms/*/message → variant target /topic/rooms/{{$destCapture 1}}); ' +
    'trigger=subscribe fires right after SUBSCRIBE (initial snapshots — map subscribe(destination:) calls, e.g. /topic/rooms/*); trigger=manual is fired by push_message/fire_destination (server-originated pushes; use a literal like /topic/rooms/88). ' +
    'Patterns: * = one segment, ** = the rest, separators / or . A default broadcast "Message" variant is created; edit it with update_message_variant.',
    {
      connectionId: z.string().describe('Connection ID'),
      pattern: z.string().describe('Destination pattern'),
      trigger: triggerEnum,
      name: z.string().optional(),
    },
    async ({ connectionId, ...data }) => {
      try { return toolResult(await mockaFetch(`/api/stomp/connections/${connectionId}/destinations`, { method: 'POST', body: JSON.stringify(data) })); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'update_destination',
    'Update a destination (pattern, trigger, name, enabled, sequenceMode). sequenceMode=on serves the active preset\'s variants in order per trigger.',
    {
      id: z.string().describe('Destination ID'),
      pattern: z.string().optional(),
      trigger: triggerEnum.optional(),
      name: z.string().optional(),
      isEnabled: z.boolean().optional(),
      sequenceMode: z.enum(['off', 'on']).optional(),
    },
    async ({ id, ...data }) => {
      try { return toolResult(await mockaFetch(`/api/stomp/destinations/${id}`, { method: 'PUT', body: JSON.stringify(data) })); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'delete_destination',
    'Delete a destination rule and its variants.',
    { id: z.string().describe('Destination ID') },
    async ({ id }) => {
      try { await mockaFetch(`/api/stomp/destinations/${id}`, { method: 'DELETE' }); return toolResult({ success: true }); } catch (e) { return toolError(e); }
    },
  );

  // ── variants ──

  server.tool(
    'add_message_variant',
    'Add a message variant (trigger × scope × payload) to a destination. Selection order per trigger: matchRules → sequence preset → active variant → first. ' +
    'Provide presetId to add it to a sequence preset instead of the standard group. ' + TEMPLATE_HINT,
    {
      destinationId: z.string().describe('Destination ID'),
      presetId: z.string().optional().describe('Sequence preset ID (omit for a standard variant)'),
      ...variantFields,
    },
    async ({ destinationId, presetId, ...data }) => {
      try {
        const payload = normalizeVariantPayload(data);
        const url = presetId ? `/api/stomp/presets/${presetId}/variants` : `/api/stomp/destinations/${destinationId}/variants`;
        return toolResult(await mockaFetch(url, { method: 'POST', body: JSON.stringify(payload) }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'update_message_variant',
    'Update a message variant (kind, scope, targetDestination, body, headers, delay, repeat, matchRules, datasetBinding). ' + TEMPLATE_HINT,
    {
      id: z.string().describe('Variant ID'),
      ...variantFields,
    },
    async ({ id, ...data }) => {
      try { return toolResult(await mockaFetch(`/api/stomp/variants/${id}`, { method: 'PUT', body: JSON.stringify(normalizeVariantPayload(data)) })); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'delete_message_variant',
    'Delete a message variant.',
    { id: z.string().describe('Variant ID') },
    async ({ id }) => {
      try { await mockaFetch(`/api/stomp/variants/${id}`, { method: 'DELETE' }); return toolResult({ success: true }); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'set_active_message_variant',
    'Choose the default variant of a destination (used when no match rule matches and sequence mode is off).',
    {
      destinationId: z.string().describe('Destination ID'),
      variantId: z.string().nullable().describe('Variant ID, or null'),
    },
    async ({ destinationId, variantId }) => {
      try { return toolResult(await mockaFetch(`/api/stomp/destinations/${destinationId}/active-variant`, { method: 'PATCH', body: JSON.stringify({ variantId }) })); } catch (e) { return toolError(e); }
    },
  );

  // ── runtime ──

  server.tool(
    'push_message',
    'Push a message to subscribers right now, without any client action (server-originated notification). scope=broadcast reaches every subscriber of the destination; echo/user need sessionId (see list_sessions). ' +
    'times duplicates the frame, delay/jitter add latency (ms). Returns delivered = subscriptions reached (0 = nobody subscribed; buffered = kept for replay). ' + TEMPLATE_HINT,
    {
      connectionId: z.string().describe('Connection ID'),
      destination: z.string().describe('Literal destination, e.g. /topic/rooms/88 (or /queue/inbox with scope=user)'),
      body: z.string().describe('Message body'),
      headers: z.record(z.string()).optional(),
      scope: scopeEnum.optional(),
      sessionId: z.string().optional(),
      delay: z.number().min(0).optional(),
      jitter: z.number().min(0).optional(),
      times: z.number().int().min(1).optional(),
    },
    async ({ connectionId, ...opts }) => {
      try { return toolResult(await mockaFetch(`/api/stomp/connections/${connectionId}/push`, { method: 'POST', body: JSON.stringify(opts) })); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'fire_destination',
    'Fire a destination\'s currently selected variant by hand (meant for trigger=manual destinations). Variants with scope echo/user or kind error/receipt/disconnect need a sessionId.',
    {
      destinationId: z.string().describe('Destination ID'),
      sessionId: z.string().optional(),
    },
    async ({ destinationId, sessionId }) => {
      try { return toolResult(await mockaFetch(`/api/stomp/destinations/${destinationId}/fire`, { method: 'POST', body: JSON.stringify({ sessionId: sessionId ?? null }) })); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'list_sessions',
    'List live STOMP sessions: id, connection, CONNECT headers (x-client-type, x-device-id…), subscriptions and heartbeat state. Session ids feed push_message (echo/user), inject_error, disconnect_session and stop_heartbeat.',
    { connectionId: z.string().optional().describe('Filter by connection ID') },
    async ({ connectionId }) => {
      try { return toolResult(await mockaFetch(`/api/stomp/sessions${connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : ''}`)); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'inject_error',
    'Send an ERROR frame to a session and close it (client observes .serverError). Use to test error handling / reconnect paths.',
    {
      sessionId: z.string(),
      message: z.string().optional().describe('ERROR message header'),
      body: z.string().optional(),
    },
    async ({ sessionId, ...rest }) => {
      try { return toolResult(await mockaFetch(`/api/stomp/sessions/${sessionId}/inject`, { method: 'POST', body: JSON.stringify({ kind: 'error', ...rest }) })); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'disconnect_session',
    'Close a session\'s WebSocket with a close code (client observes .transportFailure). Default code 1011.',
    {
      sessionId: z.string(),
      code: z.number().int().min(1000).max(4999).optional(),
      reason: z.string().optional(),
    },
    async ({ sessionId, code, reason }) => {
      try { return toolResult(await mockaFetch(`/api/stomp/sessions/${sessionId}`, { method: 'DELETE', body: JSON.stringify({ code, reason }) })); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'stop_heartbeat',
    'Stop sending heartbeats to a session but keep the socket open — a zombie connection. The client should detect it via its heartbeat watchdog (.heartbeatTimeout) and reconnect.',
    { sessionId: z.string() },
    async ({ sessionId }) => {
      try { return toolResult(await mockaFetch(`/api/stomp/sessions/${sessionId}/inject`, { method: 'POST', body: JSON.stringify({ kind: 'stop-heartbeat' }) })); } catch (e) { return toolError(e); }
    },
  );
}
