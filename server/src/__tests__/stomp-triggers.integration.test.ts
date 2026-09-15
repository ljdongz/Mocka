import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startMock, seedConnection, TestClient, sleep } from './stomp-test-utils.js';
import * as stompService from '../services/stomp.service.js';
import * as stompRuntime from '../services/stomp-runtime.service.js';
import * as datasetService from '../services/dataset.service.js';
import * as historyService from '../services/history.service.js';
import * as sessionModule from '../stomp/session.js';
import type { StompConnection, StompDestination, StompMessageVariant, StompTrigger } from '../models/stomp.js';

let mock: Awaited<ReturnType<typeof startMock>>;
const clients: TestClient[] = [];

async function connected(path: string, headers: Record<string, string> = {}): Promise<TestClient> {
  const c = await TestClient.open(mock.url(path));
  clients.push(c);
  await c.connect(headers);
  return c;
}

/** Create a destination whose first (default) variant is patched with `variant`. */
function rule(conn: StompConnection, trigger: StompTrigger, pattern: string, variant: Partial<StompMessageVariant>): StompDestination {
  const updated = stompService.createDestination(conn.id, { pattern, trigger })!;
  const dest = updated.destinations![updated.destinations!.length - 1];
  stompService.updateVariant(dest.variants![0].id, variant);
  return stompService.getDestination(dest.id)!;
}

beforeEach(async () => { mock = await startMock(); clients.length = 0; });
afterEach(async () => { for (const c of clients) { try { c.close(); } catch { /* ignore */ } } await mock.close(); });

describe('send trigger', () => {
  const roomVariant = {
    targetDestination: '/topic/rooms/{{$destCapture 1}}',
    body: '{"room":"{{$destCapture 1}}","text":"{{$body \'text\'}}","from":"{{$connectHeader \'x-device-id\'}}","seg":"{{$destSeg 2}}"}',
  };

  it('SEND to /app/rooms/88/message broadcasts to /topic/rooms/88 subscribers', async () => {
    const conn = seedConnection();
    rule(conn, 'send', '/app/rooms/*/message', roomVariant);
    const a = await connected(conn.path, { 'x-device-id': 'dev-A' });
    const b = await connected(conn.path, { 'x-device-id': 'dev-B' });
    a.subscribe('A', '/topic/rooms/88');
    b.subscribe('B', '/topic/rooms/88');
    await sleep(30);

    a.sendTo('/app/rooms/88/message', '{"text":"hi"}', { receipt: 'r-send' });
    const receipt = await a.next();
    expect(receipt.command).toBe('RECEIPT');
    expect(receipt.headers['receipt-id']).toBe('r-send');

    const ma = await a.next();
    const mb = await b.next();
    expect(ma.headers.subscription).toBe('A');
    expect(mb.headers.subscription).toBe('B');
    expect(ma.headers.destination).toBe('/topic/rooms/88');
    const body = JSON.parse(ma.body);
    expect(body).toEqual({ room: '88', text: 'hi', from: 'dev-A', seg: '88' });
    expect(mb.body).toBe(ma.body);
  });

  it('echo scope answers only the sender', async () => {
    const conn = seedConnection();
    rule(conn, 'send', '/app/rooms/*/message', { ...roomVariant, scope: 'echo' });
    const a = await connected(conn.path);
    const b = await connected(conn.path);
    a.subscribe('A', '/topic/rooms/88');
    b.subscribe('B', '/topic/rooms/88');
    await sleep(30);
    a.sendTo('/app/rooms/88/message', '{"text":"hi"}');
    expect((await a.next()).headers.subscription).toBe('A');
    expect(await b.silence(150)).toBe(true);
  });

  it('user scope lands in the sender\'s /user queue', async () => {
    const conn = seedConnection();
    rule(conn, 'send', '/app/ping', { scope: 'user', targetDestination: '/queue/inbox', body: '{"pong":true}' });
    const a = await connected(conn.path);
    a.subscribe('inbox', '/user/queue/inbox');
    await sleep(30);
    a.sendTo('/app/ping', '');
    const msg = await a.next();
    expect(msg.headers.destination).toBe('/user/queue/inbox');
    expect(msg.headers.subscription).toBe('inbox');
    expect(JSON.parse(msg.body).pong).toBe(true);
  });

  it('SEND with no matching rule is logged and otherwise ignored', async () => {
    const conn = seedConnection();
    rule(conn, 'send', '/app/rooms/*/message', roomVariant);
    const a = await connected(conn.path);
    a.subscribe('A', '/topic/**');
    await sleep(30);
    a.sendTo('/app/other', '{"x":1}');
    expect(await a.silence(150)).toBe(true);
    expect(a.closed).toBeNull();
    const rows = historyService.getAll({ protocol: 'stomp' });
    const sendRow = rows.find(r => r.method === 'SEND');
    expect(sendRow?.path).toBe('/app/other');
    expect(sendRow?.direction).toBe('in');
  });

  it('disabled destinations do not fire', async () => {
    const conn = seedConnection();
    const d = rule(conn, 'send', '/app/rooms/*/message', roomVariant);
    stompService.toggleDestination(d.id);
    const a = await connected(conn.path);
    a.subscribe('A', '/topic/rooms/88');
    await sleep(30);
    a.sendTo('/app/rooms/88/message', '{"text":"hi"}');
    expect(await a.silence(150)).toBe(true);
  });

  it('branches per client type through header match rules on CONNECT headers', async () => {
    const conn = seedConnection();
    const d = rule(conn, 'send', '/app/rooms/*/message', { targetDestination: '/topic/rooms/{{$destCapture 1}}', body: '{"for":"patient"}',
      matchRules: { bodyRules: [], headerRules: [{ field: 'x-client-type', operator: 'equals', value: 'APP' }], queryParamRules: [], pathParamRules: [], combineWith: 'AND' } });
    stompService.addVariant(d.id, { description: 'hospital', targetDestination: '/topic/rooms/{{$destCapture 1}}', body: '{"for":"hospital"}',
      matchRules: { bodyRules: [], headerRules: [{ field: 'x-client-type', operator: 'equals', value: 'HOSPITAL_APP' }], queryParamRules: [], pathParamRules: [], combineWith: 'AND' } });

    const patient = await connected(conn.path, { 'x-client-type': 'APP' });
    const hospital = await connected(conn.path, { 'x-client-type': 'HOSPITAL_APP' });
    patient.subscribe('P', '/topic/rooms/1');
    hospital.subscribe('H', '/topic/rooms/1');
    await sleep(30);

    patient.sendTo('/app/rooms/1/message', '{}');
    expect(JSON.parse((await patient.next()).body).for).toBe('patient');
    expect(JSON.parse((await hospital.next()).body).for).toBe('patient'); // broadcast reaches both
    hospital.sendTo('/app/rooms/1/message', '{}');
    expect(JSON.parse((await patient.next()).body).for).toBe('hospital');
    expect(JSON.parse((await hospital.next()).body).for).toBe('hospital');
  });

  it('sequence preset walks its variants per SEND', async () => {
    const conn = seedConnection();
    const d = rule(conn, 'send', '/app/seq', { body: 'standard' });
    const preset = stompService.createPreset(d.id, { name: 'Flow', mode: 'loop' })!;
    const seqVariants = stompService.getDestination(d.id)!.variants!.filter(v => v.presetId === preset.id);
    stompService.updateVariant(seqVariants[0].id, { body: '1', targetDestination: '/topic/seq' });
    stompService.addPresetVariant(preset.id, { body: '2', targetDestination: '/topic/seq' });
    stompService.updateDestination(d.id, { sequenceMode: 'on' });

    const a = await connected(conn.path);
    a.subscribe('S', '/topic/seq');
    await sleep(30);
    for (const expected of ['1', '2', '1']) {
      a.sendTo('/app/seq', '');
      expect((await a.next()).body).toBe(expected);
    }
    stompService.updateDestination(d.id, { sequenceMode: 'off' });
    a.sendTo('/app/seq', '');
    expect(await a.silence(100)).toBe(true); // standard variant targets /app/seq itself — nobody there
  });

  it('dataset binding fills {{$dataset}} from a capture', async () => {
    const conn = seedConnection();
    const ds = datasetService.create({ name: 'rooms', keyField: 'id', records: [{ id: '7', title: 'Seven' }] });
    rule(conn, 'send', '/app/rooms/*/info', { targetDestination: '/topic/rooms/{{$destCapture 1}}', body: '{{$dataset}}',
      datasetBinding: { datasetId: ds.id, mode: 'detail', keySource: { from: 'path', field: '1' } } });
    const a = await connected(conn.path);
    a.subscribe('R', '/topic/rooms/7');
    await sleep(30);
    a.sendTo('/app/rooms/7/info', '');
    expect(JSON.parse((await a.next()).body).title).toBe('Seven');
  });

  it('variant delay and the connection default delay are honoured (ms)', async () => {
    const conn = seedConnection({ defaultDelay: 80 });
    rule(conn, 'send', '/app/slow', { targetDestination: '/topic/slow', body: 'late' });
    rule(conn, 'send', '/app/fast', { targetDestination: '/topic/slow', body: 'fast', delay: 0 });
    const a = await connected(conn.path);
    a.subscribe('S', '/topic/slow');
    await sleep(30);
    a.sendTo('/app/slow', '');
    a.sendTo('/app/fast', '');
    expect((await a.next()).body).toBe('fast');
    expect((await a.next(500)).body).toBe('late');
  });
});

describe('subscribe trigger', () => {
  it('fires a snapshot right after SUBSCRIBE, after the receipt', async () => {
    const conn = seedConnection();
    rule(conn, 'subscribe', '/topic/rooms/*', { body: '{"snapshot":"{{$destCapture 1}}","sub":"{{$subscriptionId}}"}' });
    const a = await connected(conn.path);
    a.subscribe('S9', '/topic/rooms/42', { receipt: 'r1' });
    expect((await a.next()).command).toBe('RECEIPT');
    const snap = await a.next();
    expect(snap.command).toBe('MESSAGE');
    expect(snap.headers.subscription).toBe('S9');
    expect(snap.headers.destination).toBe('/topic/rooms/42');
    expect(JSON.parse(snap.body)).toEqual({ snapshot: '42', sub: 'S9' });
  });
});

describe('manual fire', () => {
  it('fires the destination\'s selected variant to subscribers', async () => {
    const conn = seedConnection();
    const d = rule(conn, 'manual', '/topic/rooms/88', { body: '{"push":1}' });
    const a = await connected(conn.path);
    a.subscribe('A', '/topic/rooms/88');
    await sleep(30);
    expect(stompRuntime.fireDestination(d.id)).toEqual({ delivered: 1, buffered: false, scheduled: false });
    expect(JSON.parse((await a.next()).body).push).toBe(1);
  });

  it('refuses echo/user or non-message variants without a session', async () => {
    const conn = seedConnection();
    const d = rule(conn, 'manual', '/topic/rooms/88', { scope: 'user', targetDestination: '/queue/inbox' });
    expect(() => stompRuntime.fireDestination(d.id)).toThrow(/sessionId is required/);
    const e = rule(conn, 'manual', '/topic/err', { kind: 'error' });
    expect(() => stompRuntime.fireDestination(e.id)).toThrow(/sessionId is required/);
    expect(() => stompRuntime.fireDestination('ghost')).toThrow(/destination not found/);
    expect(() => stompRuntime.fireDestination(d.id, 'ghost')).toThrow(/session not found/);
  });

  it('user-scoped manual fire targets the given session', async () => {
    const conn = seedConnection();
    const d = rule(conn, 'manual', '/queue/inbox', { scope: 'user', body: '{"hello":"{{$connectHeader \'x-device-id\'}}"}' });
    const a = await connected(conn.path, { 'x-device-id': 'A' });
    const b = await connected(conn.path, { 'x-device-id': 'B' });
    a.subscribe('in', '/user/queue/inbox');
    b.subscribe('in', '/user/queue/inbox');
    await sleep(30);
    const sessB = stompRuntime.listSessions(conn.id).find(s => s.clientHeaders['x-device-id'] === 'B')!;
    expect(stompRuntime.fireDestination(d.id, sessB.id).delivered).toBe(1);
    expect(JSON.parse((await b.next()).body).hello).toBe('B');
    expect(await a.silence(100)).toBe(true);
  });
});

describe('repeats', () => {
  it('repeats N times, re-templating every tick, then stops', async () => {
    const conn = seedConnection();
    const d = rule(conn, 'manual', '/topic/tick', { body: '{"t":"{{$isoTimestamp}}","n":"{{$randomInt}}"}', repeatIntervalMs: 30, repeatCount: 3 });
    const a = await connected(conn.path);
    a.subscribe('T', '/topic/tick');
    await sleep(30);
    const r = stompRuntime.fireDestination(d.id);
    expect(r.delivered).toBe(1);
    expect(r.scheduled).toBe(true);
    const bodies = [await a.next(), await a.next(), await a.next()].map(f => f.body);
    expect(new Set(bodies).size).toBeGreaterThanOrEqual(2); // timestamps/randoms differ between ticks
    expect(await a.silence(120)).toBe(true);
  });

  it('infinite manual repeats stop with stopRepeats', async () => {
    const conn = seedConnection();
    const d = rule(conn, 'manual', '/topic/tick', { body: 'x', repeatIntervalMs: 20, repeatCount: null });
    const a = await connected(conn.path);
    a.subscribe('T', '/topic/tick');
    await sleep(30);
    stompRuntime.fireDestination(d.id);
    await sleep(90);
    expect(a.frames.length).toBeGreaterThanOrEqual(3);
    stompRuntime.stopRepeats(conn.id);
    a.frames.length = 0;
    expect(await a.silence(100)).toBe(true);
  });

  it('session-bound repeats die with the session', async () => {
    const conn = seedConnection();
    rule(conn, 'send', '/app/start', { targetDestination: '/topic/tick', body: 'x', repeatIntervalMs: 20, repeatCount: null });
    const a = await connected(conn.path);
    const watcher = await connected(conn.path);
    watcher.subscribe('W', '/topic/tick');
    await sleep(30);
    a.sendTo('/app/start', '');
    await sleep(70);
    expect(watcher.frames.length).toBeGreaterThanOrEqual(2);
    a.close();
    await sleep(60);
    expect(sessionModule.listSessions(conn.id)).toHaveLength(1);
    watcher.frames.length = 0;
    expect(await watcher.silence(100)).toBe(true);
  });

  it('disabling the connection stops manual repeats and closes sessions', async () => {
    const conn = seedConnection();
    const d = rule(conn, 'manual', '/topic/tick', { body: 'x', repeatIntervalMs: 20, repeatCount: null });
    const a = await connected(conn.path);
    a.subscribe('T', '/topic/tick');
    await sleep(30);
    stompRuntime.fireDestination(d.id);
    await sleep(50);
    stompService.toggleConnection(conn.id);
    expect((await a.waitClose()).code).toBe(1001);
    expect(sessionModule.listSessions(conn.id)).toHaveLength(0);
  });
});

describe('variant kinds', () => {
  it('error kind sends ERROR with the configured message and closes', async () => {
    const conn = seedConnection();
    rule(conn, 'send', '/app/boom', { kind: 'error', headers: '{"message":"boom"}', body: '{"detail":"bad"}' });
    const a = await connected(conn.path);
    a.sendTo('/app/boom', '');
    const err = await a.next();
    expect(err.command).toBe('ERROR');
    expect(err.headers.message).toBe('boom');
    expect(err.headers['content-length']).toBe('16');
    expect(err.body).toBe('{"detail":"bad"}');
    expect((await a.waitClose()).code).toBe(1002);
  });

  it('disconnect kind closes with the configured code', async () => {
    const conn = seedConnection();
    rule(conn, 'send', '/app/bye', { kind: 'disconnect', headers: '{"code":"4001","reason":"kicked"}' });
    const a = await connected(conn.path);
    a.sendTo('/app/bye', '');
    expect(await a.waitClose()).toEqual({ code: 4001, reason: 'kicked' });
  });

  it('receipt kind echoes the trigger\'s receipt header (or a configured one)', async () => {
    const conn = seedConnection();
    rule(conn, 'send', '/app/ack', { kind: 'receipt' });
    rule(conn, 'send', '/app/ack2', { kind: 'receipt', headers: '{"receipt-id":"fixed"}' });
    const a = await connected(conn.path);
    a.sendTo('/app/ack', '', { receipt: 'want-this' });
    const r1 = await a.next(); // handler's own receipt for the SEND
    const r2 = await a.next(); // variant receipt
    expect([r1, r2].every(f => f.command === 'RECEIPT')).toBe(true);
    expect([r1, r2].map(f => f.headers['receipt-id'])).toEqual(['want-this', 'want-this']);
    a.sendTo('/app/ack2', '');
    expect((await a.next()).headers['receipt-id']).toBe('fixed');
  });
});
