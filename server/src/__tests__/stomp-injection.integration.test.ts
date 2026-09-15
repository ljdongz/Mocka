import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { startMock, seedConnection, TestClient, sleep } from './stomp-test-utils.js';
import * as stompRuntime from '../services/stomp-runtime.service.js';
import { stompRoutes } from '../routes/stomp.routes.js';

let mock: Awaited<ReturnType<typeof startMock>>;
const clients: TestClient[] = [];

/** A session with 40ms server heartbeats so zombie detection is observable. */
async function beating() {
  const conn = seedConnection({ heartbeatOutgoing: 40, heartbeatIncoming: 0 });
  const c = await TestClient.open(mock.url(conn.path));
  clients.push(c);
  await c.connect({ 'heart-beat': '0,40' });
  const [session] = stompRuntime.listSessions(conn.id);
  return { conn, c, session };
}

beforeEach(async () => { mock = await startMock(); clients.length = 0; });
afterEach(async () => { for (const c of clients) { try { c.close(); } catch { /* ignore */ } } await mock.close(); });

describe('failure injection', () => {
  it('stop-heartbeat leaves a zombie: socket open, no more "\\n"', async () => {
    const { c, session, conn } = await beating();
    await sleep(120);
    expect(c.heartbeatsReceived()).toBeGreaterThanOrEqual(1);
    expect(stompRuntime.inject(session.id, { kind: 'stop-heartbeat' })).toBe(true);
    const after = c.heartbeatsReceived();
    await sleep(200);
    expect(c.heartbeatsReceived()).toBe(after);
    expect(c.closed).toBeNull();
    expect(stompRuntime.listSessions(conn.id)[0].heartbeat.sending).toBe(false);
  });

  it('error sends ERROR then closes with 1002', async () => {
    const { c, session } = await beating();
    expect(stompRuntime.inject(session.id, { kind: 'error', message: 'kaboom', body: 'why' })).toBe(true);
    const err = await c.next();
    expect(err.command).toBe('ERROR');
    expect(err.headers.message).toBe('kaboom');
    expect(err.body).toBe('why');
    expect((await c.waitClose()).code).toBe(1002);
  });

  it('disconnect closes with the given code and reason', async () => {
    const { c, session } = await beating();
    expect(stompRuntime.inject(session.id, { kind: 'disconnect', code: 4002, reason: 'bye' })).toBe(true);
    expect(await c.waitClose()).toEqual({ code: 4002, reason: 'bye' });
  });

  it('disconnect defaults to 1011', async () => {
    const { c, session } = await beating();
    stompRuntime.disconnect(session.id);
    expect((await c.waitClose()).code).toBe(1011);
  });

  it('malformed sends non-STOMP bytes and keeps the socket open', async () => {
    const { c, session } = await beating();
    expect(stompRuntime.inject(session.id, { kind: 'malformed' })).toBe(true);
    await sleep(50);
    expect(c.raw.some(r => r.startsWith('BOGUS'))).toBe(true);
    expect(c.closed).toBeNull();
  });

  it('unknown session returns false / 404', async () => {
    seedConnection();
    expect(stompRuntime.inject('ghost', { kind: 'error' })).toBe(false);
    expect(stompRuntime.disconnect('ghost')).toBe(false);
    const admin = Fastify({ logger: false });
    await admin.register(stompRoutes);
    await admin.ready();
    try {
      expect((await admin.inject({ method: 'POST', url: '/api/stomp/sessions/ghost/inject', payload: { kind: 'error' } })).statusCode).toBe(404);
      expect((await admin.inject({ method: 'POST', url: '/api/stomp/sessions/ghost/inject', payload: { kind: 'nope' } })).statusCode).toBe(400);
    } finally {
      await admin.close();
    }
  });

  it('injects through the admin route', async () => {
    const { c, session } = await beating();
    const admin = Fastify({ logger: false });
    await admin.register(stompRoutes);
    await admin.ready();
    try {
      const res = await admin.inject({ method: 'POST', url: `/api/stomp/sessions/${session.id}/inject`, payload: { kind: 'error', message: 'via-route' } });
      expect(res.statusCode).toBe(200);
      expect((await c.next()).headers.message).toBe('via-route');
      await c.waitClose();
    } finally {
      await admin.close();
    }
  });
});
