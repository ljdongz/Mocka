import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
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
    await app.register(multipart);
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

describe('POST /api/media (upload)', () => {
  beforeEach(async () => {
    initDb(':memory:');
    initSchema();
    app = Fastify({ logger: false });
    await app.register(multipart);
    await app.register(mediaRoutes);
    await app.ready();
  });
  afterEach(async () => { await app.close(); closeDb(); });

  function form(files: { name: string; body: string }[], extra = ''): { payload: string; headers: Record<string, string> } {
    const boundary = '----mockatest';
    let payload = extra;
    for (const f of files) {
      payload += `--${boundary}\r\n`
        + `Content-Disposition: form-data; name="file"; filename="${f.name}"\r\n`
        + 'Content-Type: application/octet-stream\r\n\r\n'
        + `${f.body}\r\n`;
    }
    payload += `--${boundary}--\r\n`;
    return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
  }

  it('names each file after itself, so several files never collide on one name', async () => {
    const { payload, headers } = form([
      { name: 'clip.mp4', body: 'a' },
      { name: 'clip.mp4', body: 'b' },
      { name: '회의록.mp4', body: 'c' },
    ]);
    const res = await app.inject({ method: 'POST', url: '/api/media', payload, headers });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).map((m: { name: string }) => m.name)).toEqual(['clip', 'clip-2', '회의록']);
  });

  it('ignores a name field rather than applying it to every file', async () => {
    const boundary = '----mockatest';
    const nameField = `--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\nhero\r\n`;
    const { payload, headers } = form(
      [{ name: 'a.mp4', body: 'a' }, { name: 'b.mp4', body: 'b' }],
      nameField,
    );
    const res = await app.inject({ method: 'POST', url: '/api/media', payload, headers });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).map((m: { name: string }) => m.name)).toEqual(['a', 'b']);
  });

  it('rejects a request that carries no file part', async () => {
    const { payload, headers } = form([]);
    const res = await app.inject({ method: 'POST', url: '/api/media', payload, headers });
    expect(res.statusCode).toBe(400);
  });

  it('refuses a non-multipart body instead of treating it as an upload', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/media', payload: { path: '/etc/passwd' } });
    expect(res.statusCode).toBe(415);
  });
});
