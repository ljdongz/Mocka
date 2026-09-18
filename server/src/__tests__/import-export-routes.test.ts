import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { initDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { importExportRoutes } from '../routes/import-export.routes.js';
import * as stompService from '../services/stomp.service.js';
import * as stompRegistry from '../services/stomp-registry.js';
import * as endpointService from '../services/endpoint.service.js';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(importExportRoutes);
  await app.ready();
  return app;
}

describe('export/import routes carry STOMP', () => {
  let app: FastifyInstance;
  beforeEach(async () => { initDb(':memory:'); initSchema(); stompRegistry.reload([]); app = await buildApp(); });
  afterEach(async () => { await app.close(); closeDb(); });

  it('POST /api/export emits stompConnections, POST /api/import restores them', async () => {
    endpointService.create({ method: 'GET', path: '/api/users', name: 'Users' });
    stompService.createConnection({ name: 'chat', path: '/api/app/ws/chat' });

    const exported = await app.inject({ method: 'POST', url: '/api/export', payload: {} });
    expect(exported.statusCode).toBe(200);
    const data = exported.json();
    expect(data.version).toBe(4);
    expect(data.stompConnections).toHaveLength(1);

    // wipe, then import the very same document back through the route
    initDb(':memory:'); initSchema(); stompRegistry.reload([]);
    const imported = await app.inject({ method: 'POST', url: '/api/import', payload: { data, conflictPolicy: 'skip' } });
    expect(imported.statusCode).toBe(200);
    const result = imported.json();
    expect(result.errors).toEqual([]);
    expect(result.stompCreated).toBe(1);
    expect(stompService.getAll()[0].path).toBe('/api/app/ws/chat');
  });

  it('still accepts a legacy v3 document', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/import', payload: {
      data: { version: 3, exportedAt: new Date().toISOString(), endpoints: [], collections: [] },
      conflictPolicy: 'skip',
    }});
    expect(res.statusCode).toBe(200);
    expect(res.json().errors).toEqual([]);
  });
});
