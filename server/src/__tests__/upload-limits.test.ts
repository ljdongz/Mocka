import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { request } from 'http';
import type { AddressInfo } from 'net';
import { initDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as routeRegistry from '../services/route-registry.js';
import * as settingsService from '../services/settings.service.js';
import * as historyService from '../services/history.service.js';
import { createMockServer } from '../mock-server.js';

type App = Awaited<ReturnType<typeof createMockServer>>;

/** POST a body over a real socket; resolves with the status, or 'aborted' if the server dropped the connection. */
function post(port: number, body: Buffer, headers: Record<string, string>): Promise<{ status: number | 'aborted'; body: string; ms: number }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const req = request({ port, method: 'POST', path: '/upload', headers: { 'content-length': String(body.length), ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode!, body: data, ms: Date.now() - started }));
    });
    req.on('error', () => resolve({ status: 'aborted', body: '', ms: Date.now() - started }));
    req.end(body);
  });
}

const MULTIPART = { 'content-type': 'multipart/form-data; boundary=x' };

describe('request body limits', () => {
  let app: App;
  let port: number;

  beforeEach(async () => {
    initDb(':memory:'); initSchema(); routeRegistry.reload([]);
    app = await createMockServer(0);
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as AddressInfo).port;
  });
  afterEach(async () => { await app.close(); closeDb(); });

  it('rejects an oversized body with 413 naming size and limit, using the live setting', async () => {
    settingsService.update({ maxBodyMB: 1 });
    const res = await post(port, Buffer.alloc(2 * 1024 * 1024), MULTIPART);
    expect(res.status).toBe(413);
    expect(JSON.parse(res.body).message).toMatch(/2\.0 MiB.*1\.0 MiB/);

    settingsService.update({ maxBodyMB: 3 });
    expect((await post(port, Buffer.alloc(2 * 1024 * 1024), MULTIPART)).status).not.toBe(413);
  });

  it('counts a chunked body without Content-Length against the cap', async () => {
    settingsService.update({ maxBodyMB: 1 });
    const status = await new Promise<number>((resolve) => {
      const req = request({ port, method: 'POST', path: '/upload', headers: { ...MULTIPART, 'transfer-encoding': 'chunked' } },
        (res) => { res.resume(); resolve(res.statusCode!); });
      req.on('error', () => resolve(-1));
      for (let i = 0; i < 4; i++) req.write(Buffer.alloc(512 * 1024));
      req.end();
    });
    expect(status).toBe(413);
  });

  it('also caps JSON bodies', async () => {
    settingsService.update({ maxBodyMB: 1 });
    const res = await post(port, Buffer.from(JSON.stringify({ s: 'a'.repeat(1.5 * 1024 * 1024) })), { 'content-type': 'application/json' });
    expect(res.status).toBe(413);
  });

  it('keeps only a size summary of a multipart body in History', async () => {
    await post(port, Buffer.alloc(300_000, 1), MULTIPART);
    const [entry] = historyService.getAll();
    expect(JSON.parse(entry.bodyOrParams)).toEqual({ _multipart: { bytes: 300_000, contentType: MULTIPART['content-type'] } });
  });

  it('reads at the throttled rate: header overrides the setting, 0 leaves it fast', async () => {
    const body = Buffer.alloc(400 * 1024);
    expect((await post(port, body, MULTIPART)).ms).toBeLessThan(300);

    const viaHeader = await post(port, body, { ...MULTIPART, 'x-mock-upload-rate-kbps': '1000' });
    expect(viaHeader.ms).toBeGreaterThan(300);
    expect(viaHeader.ms).toBeLessThan(900);

    settingsService.update({ uploadRateKbps: 1000 });
    expect((await post(port, body, MULTIPART)).ms).toBeGreaterThan(300);
  });

  it('drops the connection partway when asked', async () => {
    const res = await post(port, Buffer.alloc(2 * 1024 * 1024), { ...MULTIPART, 'x-mock-upload-abort-percent': '50' });
    expect(res.status).toBe('aborted');
  });
});
