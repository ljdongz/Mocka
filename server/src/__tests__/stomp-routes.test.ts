import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { initDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { stompRoutes } from '../routes/stomp.routes.js';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(stompRoutes);
  await app.ready();
  return app;
}

describe('stomp routes (config)', () => {
  let app: FastifyInstance;
  beforeEach(async () => { initDb(':memory:'); initSchema(); app = await buildApp(); });
  afterEach(async () => { await app.close(); closeDb(); });

  it('POST connection 201, duplicate 400, GET lists nested', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/stomp/connections', payload: { name: 'chat', path: '/api/app/ws/chat' } });
    expect(created.statusCode).toBe(201);
    const conn = created.json();
    expect(conn.path).toBe('/api/app/ws/chat');

    const dup = await app.inject({ method: 'POST', url: '/api/stomp/connections', payload: { path: 'api/app/ws/chat/' } });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().error).toMatch(/already exists/);

    const dest = await app.inject({ method: 'POST', url: `/api/stomp/connections/${conn.id}/destinations`, payload: { pattern: '/topic/rooms/*', trigger: 'subscribe' } });
    expect(dest.statusCode).toBe(201);
    expect(dest.json().destinations[0].variants).toHaveLength(1);

    const list = await app.inject({ method: 'GET', url: '/api/stomp/connections' });
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].destinations[0].trigger).toBe('subscribe');
  });

  it('validates enums', async () => {
    const conn = (await app.inject({ method: 'POST', url: '/api/stomp/connections', payload: { path: '/ws' } })).json();
    expect((await app.inject({ method: 'POST', url: `/api/stomp/connections/${conn.id}/destinations`, payload: { pattern: '/x', trigger: 'nope' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/api/stomp/connections/${conn.id}/destinations`, payload: { trigger: 'send' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: `/api/stomp/connections/${conn.id}`, payload: { connectPolicy: 'maybe' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/stomp/connections', payload: {} })).statusCode).toBe(400);
  });

  it('PUT variant, PATCH active variant, DELETE connection then 404', async () => {
    const conn = (await app.inject({ method: 'POST', url: '/api/stomp/connections', payload: { path: '/ws' } })).json();
    const dest = (await app.inject({ method: 'POST', url: `/api/stomp/connections/${conn.id}/destinations`, payload: { pattern: '/app/x', trigger: 'send' } })).json().destinations[0];
    const v = dest.variants[0];
    const upd = await app.inject({ method: 'PUT', url: `/api/stomp/variants/${v.id}`, payload: { body: '{"a":1}', scope: 'echo', targetDestination: '/topic/x' } });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().scope).toBe('echo');
    expect((await app.inject({ method: 'PUT', url: `/api/stomp/variants/${v.id}`, payload: { kind: 'bogus' } })).statusCode).toBe(400);

    const added = (await app.inject({ method: 'POST', url: `/api/stomp/destinations/${dest.id}/variants`, payload: { description: 'Two' } })).json();
    const second = added.variants[1];
    const act = await app.inject({ method: 'PATCH', url: `/api/stomp/destinations/${dest.id}/active-variant`, payload: { variantId: second.id } });
    expect(act.json().activeVariantId).toBe(second.id);

    const preset = await app.inject({ method: 'POST', url: `/api/stomp/destinations/${dest.id}/presets`, payload: { name: 'Flow' } });
    expect(preset.statusCode).toBe(201);
    expect((await app.inject({ method: 'GET', url: `/api/stomp/connections/${conn.id}` })).json().destinations[0].presets).toHaveLength(1);

    expect((await app.inject({ method: 'DELETE', url: `/api/stomp/connections/${conn.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/stomp/connections/${conn.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/stomp/connections/${conn.id}` })).statusCode).toBe(404);
  });
});
