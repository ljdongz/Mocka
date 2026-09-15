import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { startMock, seedConnection, TestClient, sleep } from './stomp-test-utils.js';
import * as stompService from '../services/stomp.service.js';
import * as stompRuntime from '../services/stomp-runtime.service.js';
import { stompRoutes } from '../routes/stomp.routes.js';

let mock: Awaited<ReturnType<typeof startMock>>;
const clients: TestClient[] = [];

async function connected(path: string, headers: Record<string, string> = {}): Promise<TestClient> {
  const c = await TestClient.open(mock.url(path));
  clients.push(c);
  await c.connect(headers);
  return c;
}

beforeEach(async () => { mock = await startMock(); clients.length = 0; });
afterEach(async () => { for (const c of clients) { try { c.close(); } catch { /* ignore */ } } await mock.close(); });

describe('SUBSCRIBE + manual push', () => {
  it('delivers a MESSAGE with the subscription id the client sent', async () => {
    const conn = seedConnection();
    const c = await connected(conn.path);
    c.subscribe('sub-1', '/topic/rooms/88', { receipt: 'r-sub' });
    expect((await c.next()).command).toBe('RECEIPT');

    const outcome = stompRuntime.push(conn.id, { destination: '/topic/rooms/88', body: '{"a":1}', headers: { 'content-type': 'application/json' } });
    expect(outcome).toEqual({ delivered: 1, buffered: false, scheduled: false });

    const msg = await c.next();
    expect(msg.command).toBe('MESSAGE');
    expect(msg.headers.subscription).toBe('sub-1');
    expect(msg.headers.destination).toBe('/topic/rooms/88');
    expect(msg.headers['message-id']).toBeTruthy();
    expect(msg.headers['content-length']).toBe('7');
    expect(msg.headers['content-type']).toBe('application/json');
    expect(msg.body).toBe('{"a":1}');
  });

  it('matches pattern subscriptions and reports the destination as subscribed', async () => {
    const conn = seedConnection();
    const c = await connected(conn.path);
    c.subscribe('wild', '/topic/rooms/*');
    await sleep(30);
    stompRuntime.push(conn.id, { destination: '/topic/rooms/42', body: 'x' });
    const msg = await c.next();
    expect(msg.headers.subscription).toBe('wild');
    expect(msg.headers.destination).toBe('/topic/rooms/*');
  });

  it('broadcast reaches every subscriber, echo only the named session', async () => {
    const conn = seedConnection();
    const a = await connected(conn.path);
    const b = await connected(conn.path);
    a.subscribe('A', '/topic/rooms/88');
    b.subscribe('B', '/topic/rooms/88');
    await sleep(30);

    expect(stompRuntime.push(conn.id, { destination: '/topic/rooms/88', body: 'all' }).delivered).toBe(2);
    expect((await a.next()).body).toBe('all');
    expect((await b.next()).body).toBe('all');

    const [sessA] = stompRuntime.listSessions(conn.id).filter(s => s.subscriptions.some(x => x.id === 'A'));
    expect(stompRuntime.push(conn.id, { destination: '/topic/rooms/88', body: 'me', scope: 'echo', sessionId: sessA.id }).delivered).toBe(1);
    expect((await a.next()).body).toBe('me');
    expect(await b.silence(150)).toBe(true);
  });

  it('user scope rewrites /queue/inbox to the session\'s /user/queue/inbox', async () => {
    const conn = seedConnection();
    const a = await connected(conn.path);
    const b = await connected(conn.path);
    a.subscribe('inbox', '/user/queue/inbox');
    b.subscribe('inbox', '/user/queue/inbox');
    await sleep(30);
    const [sessA] = stompRuntime.listSessions(conn.id).filter(s => s.clientHeaders && s.id === stompRuntime.listSessions(conn.id)[0].id);
    const r = stompRuntime.push(conn.id, { destination: '/queue/inbox', body: 'private', scope: 'user', sessionId: sessA.id });
    expect(r.delivered).toBe(1);
    // exactly one of the two clients receives it, with the original /user destination
    const receiver = sessA.subscriptions.length ? a : b;
    const msg = await Promise.race([a.next(300).then(f => ({ who: 'a', f })), b.next(300).then(f => ({ who: 'b', f }))]);
    expect(msg.f.headers.destination).toBe('/user/queue/inbox');
    expect(msg.f.headers.subscription).toBe('inbox');
    void receiver;
    // broadcast to /queue/inbox must NOT hit /user subscribers
    expect(stompRuntime.push(conn.id, { destination: '/queue/inbox', body: 'nope' }).delivered).toBe(0);
  });

  it('echo/user without a session id is refused', () => {
    const conn = seedConnection();
    expect(() => stompRuntime.push(conn.id, { destination: '/x', body: '', scope: 'echo' })).toThrow(/sessionId is required/);
    expect(() => stompRuntime.push(conn.id, { destination: '/x', body: '', scope: 'user', sessionId: 'ghost' })).toThrow(/session not found/);
    expect(() => stompRuntime.push('ghost', { destination: '/x', body: '' })).toThrow(/connection not found/);
  });

  it('drops when nobody listens, buffers when the connection has a replay buffer', async () => {
    const conn = seedConnection({ replayBufferSize: 2 });
    expect(stompRuntime.push(conn.id, { destination: '/topic/rooms/88', body: '1' })).toEqual({ delivered: 0, buffered: true, scheduled: false });
    stompRuntime.push(conn.id, { destination: '/topic/rooms/88', body: '2' });
    stompRuntime.push(conn.id, { destination: '/topic/rooms/88', body: '3' });

    const c = await connected(conn.path);
    c.subscribe('late', '/topic/rooms/*');
    expect((await c.next()).body).toBe('2');
    expect((await c.next()).body).toBe('3');

    const plain = seedConnection({ path: '/plain' });
    expect(stompRuntime.push(plain.id, { destination: '/topic/x', body: '1' })).toEqual({ delivered: 0, buffered: false, scheduled: false });
  });

  it('UNSUBSCRIBE stops delivery; unknown ids are ignored', async () => {
    const conn = seedConnection();
    const c = await connected(conn.path);
    c.subscribe('s1', '/topic/x');
    await sleep(30);
    c.send({ command: 'UNSUBSCRIBE', headers: { id: 'nope' }, body: '' });
    c.send({ command: 'UNSUBSCRIBE', headers: { id: 's1', receipt: 'r-un' }, body: '' });
    expect((await c.next()).headers['receipt-id']).toBe('r-un');
    expect(stompRuntime.push(conn.id, { destination: '/topic/x', body: 'gone' }).delivered).toBe(0);
    expect(await c.silence(100)).toBe(true);
    expect(c.closed).toBeNull();
  });

  it('times sends duplicates', async () => {
    const conn = seedConnection();
    const c = await connected(conn.path);
    c.subscribe('s1', '/topic/x');
    await sleep(30);
    expect(stompRuntime.push(conn.id, { destination: '/topic/x', body: 'dup', times: 3 }).delivered).toBe(3);
    for (let i = 0; i < 3; i++) expect((await c.next()).body).toBe('dup');
  });

  it('delay/jitter schedules the push', async () => {
    const conn = seedConnection();
    const c = await connected(conn.path);
    c.subscribe('s1', '/topic/x');
    await sleep(30);
    const r = stompRuntime.push(conn.id, { destination: '/topic/x', body: 'later', delay: 60, jitter: 20 });
    expect(r.scheduled).toBe(true);
    expect(r.delivered).toBe(-1);
    expect((await c.next(500)).body).toBe('later');
  });

  it('templates push body and destination against the target session', async () => {
    const conn = seedConnection();
    const c = await connected(conn.path, { 'x-device-id': 'dev-9' });
    c.subscribe('s1', '/topic/dev-9');
    await sleep(30);
    const [sess] = stompRuntime.listSessions(conn.id);
    stompRuntime.push(conn.id, { destination: "/topic/{{$connectHeader 'x-device-id'}}", body: '{"sid":"{{$sessionId}}","ts":"{{$isoTimestamp}}"}', sessionId: sess.id });
    const msg = await c.next();
    expect(msg.headers.destination).toBe('/topic/dev-9');
    expect(JSON.parse(msg.body).sid).toBe(sess.id);
  });

  it('reports subscriber stats per destination', async () => {
    const conn = seedConnection();
    const manual = stompService.createDestination(conn.id, { pattern: '/topic/rooms/88', trigger: 'manual' })!.destinations![0];
    const send = stompService.createDestination(conn.id, { pattern: '/app/rooms/*/message', trigger: 'send' })!.destinations![1];
    expect(stompRuntime.stats(conn.id)).toEqual({ sessions: 0, subscribers: { [manual.id]: 0, [send.id]: 0 } });
    const c = await connected(conn.path);
    c.subscribe('s1', '/topic/rooms/*');
    await sleep(30);
    const stats = stompRuntime.stats(conn.id)!;
    expect(stats.sessions).toBe(1);
    expect(stats.subscribers[manual.id]).toBe(1);
    expect(stats.subscribers[send.id]).toBe(0);
    expect(stompRuntime.stats('ghost')).toBeNull();
  });

  it('closing the session drops its subscriptions', async () => {
    const conn = seedConnection();
    const c = await connected(conn.path);
    c.subscribe('s1', '/topic/x');
    await sleep(30);
    c.close();
    await sleep(80);
    expect(stompRuntime.push(conn.id, { destination: '/topic/x', body: 'x' }).delivered).toBe(0);
  });
});

describe('runtime routes', () => {
  it('push validates scope/session and reports 404 for unknown ids', async () => {
    const conn = seedConnection();
    const admin = Fastify({ logger: false });
    await admin.register(stompRoutes);
    await admin.ready();
    try {
      const noSession = await admin.inject({ method: 'POST', url: `/api/stomp/connections/${conn.id}/push`, payload: { destination: '/x', body: '', scope: 'echo' } });
      expect(noSession.statusCode).toBe(400);
      expect(noSession.json().error).toMatch(/sessionId is required/);
      expect((await admin.inject({ method: 'POST', url: `/api/stomp/connections/${conn.id}/push`, payload: { destination: '/x', scope: 'bogus' } })).statusCode).toBe(400);
      expect((await admin.inject({ method: 'POST', url: '/api/stomp/connections/ghost/push', payload: { destination: '/x' } })).statusCode).toBe(404);
      expect((await admin.inject({ method: 'POST', url: `/api/stomp/connections/${conn.id}/push`, payload: {} })).statusCode).toBe(400);
      const ok = await admin.inject({ method: 'POST', url: `/api/stomp/connections/${conn.id}/push`, payload: { destination: '/x', body: 'hi' } });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toEqual({ delivered: 0, buffered: false, scheduled: false });

      const c = await connected(conn.path);
      const sessions = await admin.inject({ method: 'GET', url: `/api/stomp/sessions?connectionId=${conn.id}` });
      expect(sessions.json()).toHaveLength(1);
      expect((await admin.inject({ method: 'GET', url: `/api/stomp/connections/${conn.id}/stats` })).json().sessions).toBe(1);
      expect((await admin.inject({ method: 'DELETE', url: `/api/stomp/sessions/${sessions.json()[0].id}`, payload: { code: 4000, reason: 'bye' } })).statusCode).toBe(200);
      expect((await c.waitClose()).code).toBe(4000);
      expect((await admin.inject({ method: 'DELETE', url: '/api/stomp/sessions/ghost' })).statusCode).toBe(404);
      expect((await admin.inject({ method: 'DELETE', url: `/api/stomp/connections/${conn.id}/repeats` })).statusCode).toBe(200);
    } finally {
      await admin.close();
    }
  });
});
