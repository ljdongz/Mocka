import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { mediaRoutes } from '../routes/media.routes.js';

let app: FastifyInstance;
let secretPath: string;

describe('POST /api/media/from-path', () => {
  beforeEach(async () => {
    initDb(':memory:');
    initSchema();
    app = Fastify({ logger: false });
    // Same CORS posture as the admin server: any origin is allowed.
    await app.register(cors, { origin: true });
    await app.register(mediaRoutes);
    await app.ready();

    const dir = mkdtempSync(join(tmpdir(), 'mocka-secret-'));
    secretPath = join(dir, 'id_rsa');
    writeFileSync(secretPath, 'PRIVATE KEY');
  });
  afterEach(async () => { await app.close(); closeDb(); });

  it('registers a local file for a local non-browser client', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/media/from-path',
      payload: { path: secretPath, name: 'ok' },
      remoteAddress: '127.0.0.1',
    });
    expect(res.statusCode).toBe(201);
  });

  /**
   * The attack this guards: a page the user visits runs on their own machine, so
   * its request arrives from 127.0.0.1 and an IP check alone lets it read any
   * file the user can — and the mock server hands the bytes back to any origin.
   */
  it('refuses a request a browser made, even from this machine', async () => {
    for (const headers of [
      { origin: 'https://evil.example' },
      { 'sec-fetch-site': 'cross-site' },
      { origin: 'http://localhost:4649', 'sec-fetch-site': 'same-origin' },
    ]) {
      const res = await app.inject({
        method: 'POST', url: '/api/media/from-path',
        payload: { path: secretPath }, headers,
        remoteAddress: '127.0.0.1',
      });
      expect(res.statusCode).toBe(403);
    }
  });

  it('refuses a request from another machine', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/media/from-path',
      payload: { path: secretPath },
      remoteAddress: '192.168.0.50',
    });
    expect(res.statusCode).toBe(403);
  });
});
