import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { initDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { datasetRoutes } from '../routes/dataset.routes.js';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(datasetRoutes);
  await app.ready();
  return app;
}

describe('dataset routes', () => {
  let app: FastifyInstance;
  beforeEach(async () => { initDb(':memory:'); initSchema(); app = await buildApp(); });
  afterEach(async () => { await app.close(); closeDb(); });

  it('POST creates (201) and GET lists it', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/datasets',
      payload: { name: 'plans', keyField: 'idx', records: [{ idx: 1 }] } });
    expect(created.statusCode).toBe(201);
    const ds = created.json();
    expect(ds.name).toBe('plans');

    const list = await app.inject({ method: 'GET', url: '/api/datasets' });
    expect(list.json()).toHaveLength(1);
  });

  it('POST without name or keyField returns 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/datasets', payload: { name: 'x' } });
    expect(res.statusCode).toBe(400);
  });

  it('GET/PUT/DELETE unknown id returns 404', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/datasets/nope' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: '/api/datasets/nope', payload: { name: 'y' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/api/datasets/nope' })).statusCode).toBe(404);
  });

  it('PUT updates records and DELETE removes', async () => {
    const created = (await app.inject({ method: 'POST', url: '/api/datasets',
      payload: { name: 'plans', keyField: 'idx', records: [] } })).json();
    const upd = await app.inject({ method: 'PUT', url: `/api/datasets/${created.id}`,
      payload: { records: [{ idx: 7 }] } });
    expect(upd.json().records).toEqual([{ idx: 7 }]);
    expect((await app.inject({ method: 'DELETE', url: `/api/datasets/${created.id}` })).statusCode).toBe(200);
  });

  it('POST with non-array records returns 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/datasets',
      payload: { name: 'x', keyField: 'id', records: 'oops' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('records must be an array');
  });

  it('PUT with non-array records returns 400', async () => {
    const created = (await app.inject({ method: 'POST', url: '/api/datasets',
      payload: { name: 'y', keyField: 'id', records: [] } })).json();
    const res = await app.inject({ method: 'PUT', url: `/api/datasets/${created.id}`,
      payload: { records: 42 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('records must be an array');
  });
});
