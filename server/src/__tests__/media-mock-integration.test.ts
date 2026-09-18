import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID as uuid } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb, getDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as endpointRepo from '../repositories/endpoint.repo.js';
import * as variantRepo from '../repositories/variant.repo.js';
import * as routeRegistry from '../services/route-registry.js';
import * as mediaService from '../services/media.service.js';
import { handleMockRequest } from '../services/mock-handler.service.js';
import { createMockServer } from '../mock-server.js';
import type { ResponseVariant } from '../models/response-variant.js';

function makeVariant(over: Partial<ResponseVariant> & { id: string; endpointId: string }): ResponseVariant {
  return {
    statusCode: 200, description: 'OK', body: '{}', headers: '{}', delay: null,
    memo: '', sortOrder: 0, matchRules: null, variantGroup: 'standard', presetId: null, datasetBinding: null,
    ...over,
  };
}

/** Register a file whose bytes are known, so a range request can be checked against them. */
async function registerFile(name: string, fileName: string, contents: string) {
  const dir = mkdtempSync(join(tmpdir(), 'mocka-src-'));
  const path = join(dir, fileName);
  writeFileSync(path, contents);
  try {
    return await mediaService.registerFromPath({ path, name });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function seedEndpoint(body: string) {
  const endpointId = uuid();
  const variantId = uuid();
  getDb()
    .prepare("INSERT INTO endpoints (id, method, path, name, active_variant_id) VALUES (?, 'GET', '/attachment/:idx', 'attachment', ?)")
    .run(endpointId, variantId);
  variantRepo.create(makeVariant({ id: variantId, endpointId, body }));
  routeRegistry.reload(endpointRepo.findAll());
}

describe('media in mock responses', () => {
  beforeEach(() => { initDb(':memory:'); initSchema(); routeRegistry.reload([]); });
  afterEach(() => { closeDb(); });

  it('hands out a URL on the host the request came in on', async () => {
    await registerFile('chat-clip', 'clip.mp4', 'ten-bytes!');
    seedEndpoint('{"data":{"downloadUrl":"{{$media \'chat-clip\'}}"}}');

    const fromDevice = await handleMockRequest('GET', '/attachment/501', {}, { host: '192.168.0.12:4650' });
    const url = JSON.parse(fromDevice.body).data.downloadUrl;
    expect(url).toMatch(/^http:\/\/192\.168\.0\.12:4650\/__mocka\/media\/[0-9a-f-]+\.mp4$/);

    const fromSimulator = await handleMockRequest('GET', '/attachment/501', {}, { host: 'localhost:4650' });
    expect(JSON.parse(fromSimulator.body).data.downloadUrl).toContain('http://localhost:4650/');
  });

  it('serves the registered file, and answers a range request so video can seek', async () => {
    // Register AFTER the server is up: a static setup that enumerates the
    // directory at boot would serve nothing added later, and that is the case
    // that matters — media is registered while Mocka is already running.
    const app = await createMockServer(0);
    const media = await registerFile('chat-clip', 'clip.mp4', '0123456789');
    try {
      const whole = await app.inject({ method: 'GET', url: `/__mocka/media/${media.fileName}` });
      expect(whole.statusCode).toBe(200);
      expect(whole.headers['content-type']).toBe('video/mp4');
      expect(whole.body).toBe('0123456789');

      const ranged = await app.inject({
        method: 'GET',
        url: `/__mocka/media/${media.fileName}`,
        headers: { range: 'bytes=4-8' },
      });
      expect(ranged.statusCode).toBe(206);
      expect(ranged.headers['content-range']).toBe('bytes 4-8/10');
      expect(ranged.body).toBe('45678');
    } finally {
      await app.close();
    }
  });

  it('keeps serving mock endpoints alongside the media prefix', async () => {
    const app = await createMockServer(0);
    await registerFile('chat-clip', 'clip.mp4', 'bytes');
    seedEndpoint('{"data":{"downloadUrl":"{{$media \'chat-clip\'}}"}}');
    try {
      const res = await app.inject({ method: 'GET', url: '/attachment/501', headers: { host: 'localhost:4650' } });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.downloadUrl).toContain('/__mocka/media/');

      // A media URL for a file that isn't there is not swallowed as a success.
      const missing = await app.inject({ method: 'GET', url: '/__mocka/media/does-not-exist.mp4' });
      expect(missing.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('leaves the placeholder visible when the name is not registered', async () => {
    seedEndpoint('{"data":{"downloadUrl":"{{$media \'typo\'}}"}}');
    const res = await handleMockRequest('GET', '/attachment/1', {}, { host: 'localhost:4650' });
    expect(res.body).toContain("{{$media 'typo'}}");
  });
});
