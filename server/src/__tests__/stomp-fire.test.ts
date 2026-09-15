import { describe, it, expect, beforeEach } from 'vitest';
import { initDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as datasetService from '../services/dataset.service.js';
import {
  resolveStompHelpers, resolveStompTemplate, selectVariant, pickVariantPool, buildFirePlan, buildMessageFrame, type FireContext,
} from '../stomp/fire.js';
import type { StompConnection, StompDestination, StompMessageVariant } from '../models/stomp.js';

beforeEach(() => { initDb(':memory:'); initSchema(); });

const conn = { id: 'c1', defaultDelay: null } as unknown as StompConnection;

const baseCtx = (over: Partial<FireContext> = {}): FireContext => ({
  connection: conn,
  triggerDestination: '/app/rooms/88/message',
  captures: ['88'],
  frameHeaders: { receipt: 'r1', 'x-msg': 'hello' },
  connectHeaders: { 'x-client-type': 'APP', 'x-device-id': 'dev-1' },
  body: { text: 'hi', user: { id: 7 } },
  rawBody: '{"text":"hi"}',
  sessionId: 'sess-1',
  subscriptionId: 'sub-1',
  envVars: {},
  ...over,
});

const mv = (o: Partial<StompMessageVariant> = {}): StompMessageVariant => ({
  id: 'v1', destinationId: 'd1', description: 'Message', kind: 'message', targetDestination: '', scope: 'broadcast',
  body: '{}', headers: '{}', delay: null, repeatIntervalMs: null, repeatCount: null, matchRules: null, datasetBinding: null,
  variantGroup: 'standard', presetId: null, memo: '', sortOrder: 0, ...o,
});

const dest = (o: Partial<StompDestination> = {}): StompDestination => ({
  id: 'd1', connectionId: 'c1', name: '', pattern: '/app/rooms/*/message', trigger: 'send', isEnabled: true,
  activeVariantId: null, activePresetId: null, sequenceMode: 'off', sortOrder: 0, createdAt: '', updatedAt: '', ...o,
});

const rules = (headerValue: string) => ({
  bodyRules: [], headerRules: [{ field: 'x-client-type', operator: 'equals' as const, value: headerValue }], queryParamRules: [], pathParamRules: [], combineWith: 'AND' as const,
});

describe('resolveStompHelpers', () => {
  it('resolves session/destination/subscription', () => {
    expect(resolveStompHelpers('{{$sessionId}}|{{$destination}}|{{$subscriptionId}}', baseCtx())).toBe('sess-1|/app/rooms/88/message|sub-1');
    expect(resolveStompHelpers('[{{$sessionId}}]', baseCtx({ sessionId: null }))).toBe('[]');
  });
  it('resolves destCapture (1-based) and destSeg (0-based), quoted or bare', () => {
    expect(resolveStompHelpers("{{$destCapture 1}}/{{$destCapture '1'}}/{{$destSeg 2}}/{{$destSeg 0}}", baseCtx())).toBe('88/88/88/app');
    expect(resolveStompHelpers("{{$destCapture 2 'none'}}", baseCtx())).toBe('none');
    expect(resolveStompHelpers('{{$destCapture 2}}', baseCtx())).toBe('');
    expect(resolveStompHelpers('{{$destSeg 9}}', baseCtx())).toBe('');
  });
  it('resolves stompHeader and connectHeader case-insensitively with defaults', () => {
    expect(resolveStompHelpers("{{$stompHeader 'X-Msg'}}-{{$connectHeader 'x-client-type'}}-{{$connectHeader 'nope' 'dflt'}}", baseCtx())).toBe('hello-APP-dflt');
  });
  it('leaves unrelated placeholders alone', () => {
    expect(resolveStompHelpers("{{$body 'text'}} {{$randomUUID}} {{ENV}}", baseCtx())).toBe("{{$body 'text'}} {{$randomUUID}} {{ENV}}");
  });
});

describe('resolveStompTemplate', () => {
  it('chains stomp helpers, body helpers, variables and env', () => {
    const out = resolveStompTemplate(
      '{"room":"{{$destCapture 1}}","t":"{{$body \'text\'}}","env":"{{ROOM_PREFIX}}","id":"{{$randomUUID}}","seg":"{{$pathSegments \'1\'}}","cap":"{{$pathParams \'1\'}}","h":"{{$headers \'X-Client-Type\'}}"}',
      baseCtx({ envVars: { ROOM_PREFIX: 'R' } }),
    );
    const j = JSON.parse(out);
    expect(j.room).toBe('88');
    expect(j.t).toBe('hi');
    expect(j.env).toBe('R');
    expect(j.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(j.seg).toBe('rooms');
    expect(j.cap).toBe('88');
    expect(j.h).toBe('APP');
  });
});

describe('pickVariantPool', () => {
  it('standard group when sequence is off, active preset group when on', () => {
    const s = mv({ id: 's' });
    const q = mv({ id: 'q', variantGroup: 'sequence', presetId: 'p1' });
    const d = dest({ variants: [s, q], presets: [{ id: 'p1', destinationId: 'd1', name: 'P', mode: 'loop', sortOrder: 0, createdAt: '' }] });
    expect(pickVariantPool(d)).toEqual({ variants: [s], presetMode: null });
    expect(pickVariantPool({ ...d, sequenceMode: 'on', activePresetId: 'p1' })).toEqual({ variants: [q], presetMode: 'loop' });
  });
});

describe('selectVariant', () => {
  it('matchRules first, using merged connect+frame headers', () => {
    const hosp = mv({ id: 'h', matchRules: rules('HOSPITAL_APP') });
    const app = mv({ id: 'a', matchRules: rules('APP') });
    expect(selectVariant(dest({ activeVariantId: 'h' }), [hosp, app], null, baseCtx())?.id).toBe('a');
    expect(selectVariant(dest({ activeVariantId: 'h' }), [hosp, app], null, baseCtx({ connectHeaders: { 'x-client-type': 'HOSPITAL_APP' } }))?.id).toBe('h');
  });
  it('frame headers override connect headers in rules', () => {
    const hosp = mv({ id: 'h', matchRules: rules('HOSPITAL_APP') });
    expect(selectVariant(dest(), [mv(), hosp], null, baseCtx({ frameHeaders: { 'X-Client-Type': 'HOSPITAL_APP' } }))?.id).toBe('h');
  });
  it('pathParamRules see captures as 1-based keys', () => {
    const v = mv({ id: 'r88', matchRules: { bodyRules: [], headerRules: [], queryParamRules: [], pathParamRules: [{ field: '1', operator: 'equals', value: '88' }], combineWith: 'AND' } });
    expect(selectVariant(dest(), [mv(), v], null, baseCtx())?.id).toBe('r88');
    expect(selectVariant(dest(), [mv(), v], null, baseCtx({ captures: ['99'] }))?.id).toBe('v1');
  });
  it('bodyRules see the parsed frame body', () => {
    const v = mv({ id: 'b', matchRules: { bodyRules: [{ field: 'user.id', operator: 'equals', value: '7' }], headerRules: [], queryParamRules: [], pathParamRules: [], combineWith: 'AND' } });
    expect(selectVariant(dest(), [mv(), v], null, baseCtx())?.id).toBe('b');
  });
  it('sequence preset advances', () => {
    const d = dest({ sequenceMode: 'on', activePresetId: 'p-seq' });
    const vs = [mv({ id: 's1', sortOrder: 0, presetId: 'p-seq', variantGroup: 'sequence' }), mv({ id: 's2', sortOrder: 1, presetId: 'p-seq', variantGroup: 'sequence' })];
    expect(selectVariant(d, vs, 'loop', baseCtx())?.id).toBe('s1');
    expect(selectVariant(d, vs, 'loop', baseCtx())?.id).toBe('s2');
    expect(selectVariant(d, vs, 'loop', baseCtx())?.id).toBe('s1');
  });
  it('active then first', () => {
    expect(selectVariant(dest({ activeVariantId: 'b' }), [mv({ id: 'a' }), mv({ id: 'b' })], null, baseCtx())?.id).toBe('b');
    expect(selectVariant(dest(), [mv({ id: 'a' }), mv({ id: 'b' })], null, baseCtx())?.id).toBe('a');
    expect(selectVariant(dest(), [], null, baseCtx())).toBeUndefined();
  });
});

describe('buildFirePlan', () => {
  it('templates target, body, headers; empty target = trigger destination', () => {
    const p = buildFirePlan(mv({
      targetDestination: '/topic/rooms/{{$destCapture 1}}',
      body: '{"from":"{{$connectHeader \'x-device-id\'}}"}',
      headers: '{"x-room":"{{$destCapture 1}}","content-type":"application/json"}',
    }), baseCtx());
    expect(p.targetDestination).toBe('/topic/rooms/88');
    expect(JSON.parse(p.body).from).toBe('dev-1');
    expect(p.headers['x-room']).toBe('88');
    expect(p.headers['content-type']).toBe('application/json');
    expect(buildFirePlan(mv(), baseCtx()).targetDestination).toBe('/app/rooms/88/message');
    expect(p.kind).toBe('message');
    expect(p.scope).toBe('broadcast');
  });
  it('delay falls back to the connection default, else 0', () => {
    expect(buildFirePlan(mv(), baseCtx()).delay).toBe(0);
    expect(buildFirePlan(mv(), baseCtx({ connection: { ...conn, defaultDelay: 250 } })).delay).toBe(250);
    expect(buildFirePlan(mv({ delay: 10 }), baseCtx({ connection: { ...conn, defaultDelay: 250 } })).delay).toBe(10);
  });
  it('tolerates invalid header JSON', () => {
    expect(buildFirePlan(mv({ headers: 'nope' }), baseCtx()).headers).toEqual({});
  });
  it('injects {{$dataset}} via datasetBinding, keyed by a capture', () => {
    const ds = datasetService.create({ name: 'rooms', keyField: 'id', records: [{ id: '88', title: 'Room 88' }, { id: '99', title: 'Room 99' }] });
    const p = buildFirePlan(mv({ body: '{{$dataset}}', datasetBinding: { datasetId: ds.id, mode: 'detail', keySource: { from: 'path', field: '1' } } }), baseCtx());
    expect(JSON.parse(p.body).title).toBe('Room 88');
    const list = buildFirePlan(mv({ body: '{"rooms":{{$dataset}}}', datasetBinding: { datasetId: ds.id, mode: 'list', projection: ['id'] } }), baseCtx());
    expect(JSON.parse(list.body).rooms).toEqual([{ id: '88' }, { id: '99' }]);
  });
});

describe('buildMessageFrame', () => {
  it('sets routing headers and byte length; caller cannot override them', () => {
    const f = buildMessageFrame('/topic/x', 'sub-9', '한', { 'x-a': '1', subscription: 'evil', destination: '/evil' });
    expect(f.command).toBe('MESSAGE');
    expect(f.headers.subscription).toBe('sub-9');
    expect(f.headers.destination).toBe('/topic/x');
    expect(f.headers['content-length']).toBe('3');
    expect(f.headers['x-a']).toBe('1');
    expect(f.headers['message-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(f.body).toBe('한');
  });
});
