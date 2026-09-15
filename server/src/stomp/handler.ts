/**
 * WebSocket → STOMP frame dispatch. One handler per socket; every frame is
 * decoded by the session's accumulating decoder, logged, then routed by
 * command. Anything the spec calls fatal answers with ERROR and tears the
 * session down through the one teardown routine.
 */
import type { WebSocket } from 'ws';
import type { StompFrame } from './frame.js';
import { negotiateHeartbeat, parseHeartbeat } from './heartbeat.js';
import * as stompRegistry from '../services/stomp-registry.js';
import { emit } from '../services/domain-events.js';
import { normalizeStompPath, type StompConnection } from '../models/stomp.js';
import {
  createSession, getSession, logFrame, sendFrame, startHeartbeat, teardown, toInfo, touch, type StompSession,
} from './session.js';

export function stompWsHandler(socket: WebSocket, req: { url: string }): void {
  const path = normalizeStompPath((req.url ?? '/').split('?')[0]);
  const connection = stompRegistry.getByPath(path);
  if (!connection || !connection.isEnabled) {
    // preValidation already answers 404; this guards a race with a just-disabled connection
    socket.close(4004, `No STOMP connection configured for ${path}`);
    return;
  }
  const session = createSession(connection.id, connection.path, socket);
  socket.on('message', (data: Buffer | string) => onMessage(session, data));
  socket.on('close', () => teardown(session.id));
  socket.on('error', () => teardown(session.id, { code: 1011, reason: 'socket error' }));
}

function onMessage(session: StompSession, data: Buffer | string | ArrayBuffer | Buffer[]): void {
  touch(session);
  let frames: StompFrame[];
  try {
    const chunk = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as any);
    frames = session.decoder.push(chunk);
  } catch (e: any) {
    fail(session, 'malformed frame', e?.message ?? '');
    return;
  }
  for (const frame of frames) {
    logFrame(session, 'in', frame);
    dispatch(session, frame);
    if (!getSession(session.id)) return; // torn down mid-batch
  }
}

/** ERROR frame then close — the STOMP-mandated way to refuse anything. */
function fail(session: StompSession, message: string, body = ''): void {
  const headers: Record<string, string> = { message };
  if (body) headers['content-length'] = String(Buffer.byteLength(body));
  sendFrame(session, { command: 'ERROR', headers, body });
  teardown(session.id, { code: 1002, reason: message });
}

function dispatch(session: StompSession, frame: StompFrame): void {
  const connection = stompRegistry.getById(session.connectionId);
  if (!connection || !connection.isEnabled) {
    fail(session, 'connection disabled');
    return;
  }

  if (session.state === 'connecting') {
    if (frame.command === 'CONNECT' || frame.command === 'STOMP') handleConnect(session, connection, frame);
    else fail(session, 'CONNECT frame expected');
    return;
  }

  switch (frame.command) {
    case 'CONNECT':
    case 'STOMP':
      fail(session, 'already connected');
      return;
    case 'DISCONNECT':
      handleDisconnect(session, frame);
      return;
    case 'SUBSCRIBE':
      handleSubscribe(session, connection, frame);
      return;
    case 'UNSUBSCRIBE':
      handleUnsubscribe(session, frame);
      return;
    case 'SEND':
      handleSend(session, connection, frame);
      return;
    case 'ACK':
    case 'NACK':
    case 'BEGIN':
    case 'COMMIT':
    case 'ABORT':
      // out of scope (client uses ack:auto, no transactions) — accept silently
      maybeReceipt(session, frame);
      return;
    default:
      fail(session, `unknown command ${frame.command}`);
  }
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  if (headers[name] !== undefined) return headers[name];
  const lower = name.toLowerCase();
  const key = Object.keys(headers).find(k => k.toLowerCase() === lower);
  return key ? headers[key] : undefined;
}

function handleConnect(session: StompSession, connection: StompConnection, frame: StompFrame): void {
  session.clientHeaders = { ...frame.headers };

  if (connection.connectPolicy === 'reject') {
    fail(session, connection.rejectMessage);
    return;
  }
  if (connection.connectPolicy === 'validate') {
    const missing = connection.requiredHeaders.filter(h => !(headerValue(frame.headers, h) ?? '').trim());
    if (missing.length > 0) {
      fail(session, `${connection.rejectMessage}: missing ${missing.join(', ')}`);
      return;
    }
  }

  const { sendEvery, expectEvery } = negotiateHeartbeat(
    parseHeartbeat(frame.headers['heart-beat']),
    [connection.heartbeatOutgoing, connection.heartbeatIncoming],
  );

  session.state = 'connected';
  session.connectedAt = new Date().toISOString();
  sendFrame(session, {
    command: 'CONNECTED',
    headers: {
      version: connection.stompVersion,
      'heart-beat': `${connection.heartbeatOutgoing},${connection.heartbeatIncoming}`,
      session: session.id,
    },
    body: '',
  });
  startHeartbeat(session, sendEvery, expectEvery);
  emit('stomp:session:opened', toInfo(session));
}

function maybeReceipt(session: StompSession, frame: StompFrame): void {
  const receipt = frame.headers.receipt;
  if (receipt) sendFrame(session, { command: 'RECEIPT', headers: { 'receipt-id': receipt }, body: '' });
}

function handleDisconnect(session: StompSession, frame: StompFrame): void {
  maybeReceipt(session, frame);
  teardown(session.id, { code: 1000, reason: 'client disconnect' });
}

// Broker-backed commands land with the broker task; until then they are accepted and acknowledged.
function handleSubscribe(session: StompSession, _connection: StompConnection, frame: StompFrame): void {
  const id = frame.headers.id;
  const destination = frame.headers.destination;
  if (!id || !destination) {
    fail(session, 'SUBSCRIBE requires id and destination');
    return;
  }
  session.subscriptions.set(id, destination);
  maybeReceipt(session, frame);
  emit('stomp:session:updated', toInfo(session));
}

function handleUnsubscribe(session: StompSession, frame: StompFrame): void {
  const id = frame.headers.id;
  if (!id) {
    fail(session, 'UNSUBSCRIBE requires id');
    return;
  }
  session.subscriptions.delete(id);
  maybeReceipt(session, frame);
  emit('stomp:session:updated', toInfo(session));
}

function handleSend(session: StompSession, _connection: StompConnection, frame: StompFrame): void {
  if (!frame.headers.destination) {
    fail(session, 'SEND requires destination');
    return;
  }
  maybeReceipt(session, frame);
}
