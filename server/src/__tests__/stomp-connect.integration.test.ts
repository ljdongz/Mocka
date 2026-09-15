import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startMock, seedConnection, TestClient, sleep } from './stomp-test-utils.js';
import * as sessionModule from '../stomp/session.js';
import * as historyService from '../services/history.service.js';

let mock: Awaited<ReturnType<typeof startMock>>;
const clients: TestClient[] = [];

async function open(path: string): Promise<TestClient> {
  const c = await TestClient.open(mock.url(path));
  clients.push(c);
  return c;
}

beforeEach(async () => { mock = await startMock(); clients.length = 0; });
afterEach(async () => { for (const c of clients) { try { c.close(); } catch { /* ignore */ } } await mock.close(); });

describe('CONNECT / CONNECTED', () => {
  it('answers CONNECT with CONNECTED carrying version, advertised heart-beat and session', async () => {
    const conn = seedConnection();
    const c = await open(conn.path);
    const connected = await c.connect({ 'heart-beat': '10000,10000', 'x-client-type': 'APP' });
    expect(connected.command).toBe('CONNECTED');
    expect(connected.headers.version).toBe('1.2');
    expect(connected.headers['heart-beat']).toBe('10000,10000');
    expect(connected.headers.session).toBeTruthy();
    const [info] = sessionModule.listSessions(conn.id);
    expect(info.id).toBe(connected.headers.session);
    expect(info.state).toBe('connected');
    expect(info.clientHeaders['x-client-type']).toBe('APP');
    expect(info.heartbeat).toEqual(expect.objectContaining({ outgoing: 10000, incoming: 10000, sending: true }));
  });

  it('accepts the STOMP command as an alias of CONNECT', async () => {
    const conn = seedConnection();
    const c = await open(conn.path);
    c.send({ command: 'STOMP', headers: { 'accept-version': '1.2', host: 'x' }, body: '' });
    expect((await c.next()).command).toBe('CONNECTED');
  });

  it('sends "\\n" heartbeats at the negotiated interval', async () => {
    const conn = seedConnection({ heartbeatOutgoing: 50, heartbeatIncoming: 0 });
    const c = await open(conn.path);
    await c.connect({ 'heart-beat': '0,50' });
    await sleep(400);
    expect(c.heartbeatsReceived()).toBeGreaterThanOrEqual(2);
    expect(c.closed).toBeNull();
  });

  it('sends no heartbeat when the client does not want one', async () => {
    const conn = seedConnection({ heartbeatOutgoing: 50, heartbeatIncoming: 0 });
    const c = await open(conn.path);
    await c.connect({ 'heart-beat': '0,0' });
    await sleep(300);
    expect(c.heartbeatsReceived()).toBe(0);
  });

  it('honours max(sx, cy): client asking for 20 gets the server\'s 50', async () => {
    const conn = seedConnection({ heartbeatOutgoing: 50, heartbeatIncoming: 0 });
    const c = await open(conn.path);
    await c.connect({ 'heart-beat': '0,20' });
    const [info] = sessionModule.listSessions(conn.id);
    expect(info.heartbeat.outgoing).toBe(50);
  });

  it('closes a session whose client falls silent past the tolerated window', async () => {
    const conn = seedConnection({ heartbeatOutgoing: 0, heartbeatIncoming: 40 });
    const c = await open(conn.path);
    await c.connect({ 'heart-beat': '40,0' });
    expect(sessionModule.listSessions(conn.id)).toHaveLength(1);
    const closed = await c.waitClose(1000);
    expect(closed.code).toBe(1002);
    expect(sessionModule.listSessions(conn.id)).toHaveLength(0);
  });

  it('keeps the session alive while the client heartbeats', async () => {
    const conn = seedConnection({ heartbeatOutgoing: 0, heartbeatIncoming: 40 });
    const c = await open(conn.path);
    await c.connect({ 'heart-beat': '40,0' });
    const beat = setInterval(() => c.sendRaw('\n'), 30);
    await sleep(300);
    clearInterval(beat);
    expect(c.closed).toBeNull();
    expect(sessionModule.listSessions(conn.id)).toHaveLength(1);
  });
});

describe('upgrade rejection', () => {
  it('rejects an unknown path with 404', async () => {
    seedConnection();
    await expect(TestClient.open(mock.url('/nope'))).rejects.toThrow(/404/);
  });

  it('rejects a disabled connection with 404', async () => {
    const conn = seedConnection({ isEnabled: false });
    await expect(TestClient.open(mock.url(conn.path))).rejects.toThrow(/404/);
  });

  it('still serves HTTP mocks on the same server', async () => {
    seedConnection();
    const res = await fetch(`http://127.0.0.1:${mock.port}/api/nothing`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/No mock endpoint/);
  });
});

describe('protocol errors', () => {
  it('ERROR + close when a frame arrives before CONNECT', async () => {
    const conn = seedConnection();
    const c = await open(conn.path);
    c.subscribe('s1', '/topic/x');
    const err = await c.next();
    expect(err.command).toBe('ERROR');
    expect(err.headers.message).toMatch(/CONNECT/);
    expect((await c.waitClose()).code).toBe(1002);
  });

  it('ERROR "malformed frame" + close on garbage', async () => {
    const conn = seedConnection();
    const c = await open(conn.path);
    await c.connect();
    c.sendRaw('this is not stomp\n\n\0');
    const err = await c.next();
    expect(err.command).toBe('ERROR');
    expect(err.headers.message).toBe('malformed frame');
    await c.waitClose();
    expect(sessionModule.listSessions(conn.id)).toHaveLength(0);
  });

  it('ERROR + close on an unknown command', async () => {
    const conn = seedConnection();
    const c = await open(conn.path);
    await c.connect();
    c.send({ command: 'FOO', headers: {}, body: '' });
    const err = await c.next();
    expect(err.command).toBe('ERROR');
    expect(err.headers.message).toMatch(/unknown command FOO/);
    await c.waitClose();
  });

  it('silently accepts ACK/NACK/BEGIN/COMMIT/ABORT and still answers a receipt', async () => {
    const conn = seedConnection();
    const c = await open(conn.path);
    await c.connect();
    c.send({ command: 'ACK', headers: { id: 'm1', receipt: 'r-ack' }, body: '' });
    const receipt = await c.next();
    expect(receipt.command).toBe('RECEIPT');
    expect(receipt.headers['receipt-id']).toBe('r-ack');
    expect(c.closed).toBeNull();
  });
});

describe('connect policies', () => {
  it('reject: ERROR with the reject message, before any CONNECTED', async () => {
    const conn = seedConnection({ connectPolicy: 'reject', rejectMessage: 'nope' });
    const c = await open(conn.path);
    const first = await c.connect();
    expect(first.command).toBe('ERROR');
    expect(first.headers.message).toBe('nope');
    await c.waitClose();
    expect(sessionModule.listSessions(conn.id)).toHaveLength(0);
  });

  it('validate: rejects when a required header is missing, accepts when present', async () => {
    const conn = seedConnection({ connectPolicy: 'validate', requiredHeaders: ['Authorization', 'x-device-id'], rejectMessage: 'unauthorized' });
    const bad = await open(conn.path);
    const err = await bad.connect({ 'x-device-id': 'd1' });
    expect(err.command).toBe('ERROR');
    expect(err.headers.message).toBe('unauthorized: missing Authorization');
    await bad.waitClose();

    const good = await open(conn.path);
    const ok = await good.connect({ Authorization: 'Bearer t', 'x-device-id': 'd1' });
    expect(ok.command).toBe('CONNECTED');
  });

  it('validate: treats an empty header value as missing', async () => {
    const conn = seedConnection({ connectPolicy: 'validate', requiredHeaders: ['Authorization'] });
    const c = await open(conn.path);
    const err = await c.connect({ Authorization: '   ' });
    expect(err.command).toBe('ERROR');
  });
});

describe('DISCONNECT and teardown', () => {
  it('answers a DISCONNECT receipt then closes and forgets the session', async () => {
    const conn = seedConnection({ heartbeatOutgoing: 30, heartbeatIncoming: 0 });
    const c = await open(conn.path);
    await c.connect({ 'heart-beat': '0,30' });
    c.send({ command: 'DISCONNECT', headers: { receipt: 'bye-1' }, body: '' });
    const receipt = await c.next();
    expect(receipt.command).toBe('RECEIPT');
    expect(receipt.headers['receipt-id']).toBe('bye-1');
    const closed = await c.waitClose();
    expect(closed.code).toBe(1000);
    expect(sessionModule.listSessions(conn.id)).toHaveLength(0);
    // no heartbeat timer survives the session
    const before = c.heartbeatsReceived();
    await sleep(120);
    expect(c.heartbeatsReceived()).toBe(before);
  });

  it('a raw socket close removes the session', async () => {
    const conn = seedConnection();
    const c = await open(conn.path);
    await c.connect();
    expect(sessionModule.listSessions(conn.id)).toHaveLength(1);
    c.close();
    await sleep(100);
    expect(sessionModule.listSessions(conn.id)).toHaveLength(0);
  });

  it('closing the mock server tears every session down', async () => {
    const conn = seedConnection();
    const c = await open(conn.path);
    await c.connect();
    await mock.close();
    await c.waitClose();
    expect(sessionModule.listSessions()).toHaveLength(0);
    mock = await startMock(); // afterEach closes it again
  });
});

describe('frame log', () => {
  it('records inbound and outbound frames with direction and session, but not heartbeats', async () => {
    const conn = seedConnection({ heartbeatOutgoing: 20, heartbeatIncoming: 0 });
    const c = await open(conn.path);
    const connected = await c.connect({ 'heart-beat': '0,20' });
    await sleep(80);
    const rows = historyService.getAll({ protocol: 'stomp' });
    const inbound = rows.find(r => r.method === 'CONNECT');
    const outbound = rows.find(r => r.method === 'CONNECTED');
    expect(inbound).toBeDefined();
    expect(inbound!.direction).toBe('in');
    expect(inbound!.sessionId).toBe(connected.headers.session);
    expect(inbound!.path).toBe(conn.path);
    expect(JSON.parse(inbound!.requestHeaders)['accept-version']).toBe('1.2');
    expect(outbound!.direction).toBe('out');
    expect(rows.every(r => r.method !== '')).toBe(true);
    expect(rows).toHaveLength(2);
    expect(historyService.getAll({ protocol: 'http' })).toHaveLength(0);
  });
});
