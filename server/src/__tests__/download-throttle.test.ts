import type { InjectOptions } from 'fastify';
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
import * as settingsService from '../services/settings.service.js';
import * as mediaService from '../services/media.service.js';
import { createMockServer } from '../mock-server.js';

type App = Awaited<ReturnType<typeof createMockServer>>;

const BODY = JSON.stringify({ s: 'a'.repeat(400 * 1024) });

function seedEndpoint(body: string) {
  const endpointId = uuid();
  const variantId = uuid();
  getDb()
    .prepare("INSERT INTO endpoints (id, method, path, name, active_variant_id) VALUES (?, 'GET', '/big', 'big', ?)")
    .run(endpointId, variantId);
  variantRepo.create({
    id: variantId, endpointId, statusCode: 200, description: 'OK', body, headers: '{}', delay: null,
    memo: '', sortOrder: 0, matchRules: null, variantGroup: 'standard', presetId: null, datasetBinding: null,
  });
  routeRegistry.reload(endpointRepo.findAll());
}

async function timed(app: App, opts: InjectOptions) {
  const started = Date.now();
  const res = await app.inject(opts);
  return { res, ms: Date.now() - started };
}

describe('download throttle', () => {
  let app: App;

  beforeEach(async () => {
    initDb(':memory:'); initSchema(); routeRegistry.reload([]);
    app = await createMockServer(0);
  });
  afterEach(async () => { await app.close(); closeDb(); });

  it('sends at the throttled rate: header overrides the setting, 0 leaves it fast', async () => {
    seedEndpoint(BODY);
    expect((await timed(app, { method: 'GET', url: '/big' })).ms).toBeLessThan(300);

    const { res, ms } = await timed(app, { method: 'GET', url: '/big', headers: { 'x-mock-download-rate-kbps': '1000' } });
    expect(ms).toBeGreaterThan(300);
    expect(ms).toBeLessThan(900);
    expect(res.body).toBe(BODY);
    expect(res.headers['content-length']).toBe(String(BODY.length));

    settingsService.update({ downloadRateKbps: 1000 });
    expect((await timed(app, { method: 'GET', url: '/big' })).ms).toBeGreaterThan(300);
  });

  it('paces media files and keeps a range response intact', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mocka-src-'));
    const contents = Buffer.alloc(800 * 1024, 7);
    contents.write('head', 0);
    writeFileSync(join(dir, 'clip.mp4'), contents);
    const media = await mediaService.registerFromPath({ path: join(dir, 'clip.mp4'), name: 'clip' });
    rmSync(dir, { recursive: true, force: true });

    const { res, ms } = await timed(app, {
      method: 'GET',
      url: `/__mocka/media/${media.fileName}`,
      headers: { range: 'bytes=0-409599', 'x-mock-download-rate-kbps': '1000' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-length']).toBe('409600');
    expect(res.rawPayload.equals(contents.subarray(0, 409600))).toBe(true);
    expect(ms).toBeGreaterThan(300);
    expect(ms).toBeLessThan(900);
  });
});
