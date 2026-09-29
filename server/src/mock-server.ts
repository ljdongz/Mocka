import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { handleMockRequest } from './services/mock-handler.service.js';
import { stompWsHandler } from './stomp/handler.js';
import * as stompRuntime from './stomp/runtime.js';
import * as stompRegistry from './services/stomp-registry.js';
import { normalizeStompPath } from './models/stomp.js';
import { MEDIA_URL_PREFIX } from './utils/template-media.js';
import { ensureMediaDir } from './utils/paths.js';
import * as settingsService from './services/settings.service.js';
import { Transform } from 'stream';

function payloadTooLarge(bytes: number, limit: number) {
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return Object.assign(new Error(`Request body is ${mb(bytes)}, over the ${mb(limit)} limit (Settings → Max body size)`), {
    statusCode: 413, bytes, limit,
  });
}

/**
 * Wrap a request body stream to enforce the live settings, per request:
 * - size cap (Settings.maxBodyMB) → 413, up front from Content-Length when present, else while counting;
 * - read throttle (x-mock-upload-rate-kbps header > Settings.uploadRateKbps, KB/s). Holding the transform
 *   callback stops reading from the socket, so the client can only send as fast as we read — its upload
 *   progress moves in steps instead of jumping to 100%;
 * - x-mock-upload-abort-percent: N → drop the connection once N% of Content-Length has arrived.
 */
export function limitBody(headers: Record<string, string | string[] | undefined>, destroySocket: () => void): Transform | Error {
  const settings = settingsService.getAll();
  const limit = settings.maxBodyMB * 1024 * 1024;
  const length = Number(headers['content-length']);
  if (length > limit) return payloadTooLarge(length, limit);

  const headerRate = Number(headers['x-mock-upload-rate-kbps']);
  const bytesPerSec = (headerRate > 0 ? headerRate : settings.uploadRateKbps) * 1024;
  const abortPct = Number(headers['x-mock-upload-abort-percent']);
  const abortAt = abortPct > 0 && length > 0 ? length * abortPct / 100 : Infinity;

  const started = Date.now();
  let size = 0;
  return new Transform({
    // Past the cap, keep reading and dropping until the body ends, then fail. Failing mid-stream makes Fastify
    // close the socket while the client is still sending, and the client sees a reset instead of the 413.
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > limit) return cb();
      if (size >= abortAt) { destroySocket(); return cb(); }
      const ahead = bytesPerSec > 0 ? size / bytesPerSec * 1000 - (Date.now() - started) : 0;
      if (ahead > 0) setTimeout(() => cb(null, chunk), ahead);
      else cb(null, chunk);
    },
    flush(cb) {
      cb(size > limit ? payloadTooLarge(size, limit) : null);
    },
  });
}

export async function createMockServer(_port: number) {
  // The real cap is Settings.maxBodyMB, enforced live in preParsing; Fastify's own limit is only kept out of the way.
  // forceCloseConnections: a restart must not wait on a client's keep-alive socket (e.g. one that just got a 413).
  const app = Fastify({ logger: false, bodyLimit: Number.MAX_SAFE_INTEGER, forceCloseConnections: true });

  app.addHook('preParsing', async (req, _reply, payload) => {
    if (!req.headers['content-length'] && !req.headers['transfer-encoding']) return payload;
    const out = limitBody(req.headers, () => req.raw.socket.destroy());
    if (out instanceof Error) throw out;
    return payload.pipe(out);
  });
  // A 413 leaves the rest of the body unread. Drain and discard it: closing the socket instead makes a client
  // that is still sending see a connection reset rather than the 413.
  app.addHook('onSend', async (req, reply) => {
    if (reply.statusCode === 413) req.raw.resume();
  });

  // Registered media files, served straight off disk under a reserved prefix.
  // The plugin sets Content-Type from the file's extension and answers Range
  // requests with a 206, which is what makes video seeking work.
  //
  // `wildcard` must stay on: with it off the plugin enumerates the directory at
  // registration time, so any file registered after the server started would
  // 404. The wildcard it registers lives under this prefix and does not collide
  // with the catch-all mock routes below.
  await app.register(fastifyStatic, {
    root: ensureMediaDir(),
    prefix: MEDIA_URL_PREFIX,
  });

  // Accept multipart/form-data by counting and discarding it: uploads are usually binary, so keeping them
  // would cost their full size in memory and again in History. History gets a summary instead.
  app.addContentTypeParser('multipart/form-data', function (req, payload, done) {
    let bytes = 0;
    let settled = false;
    const finish = (err: Error | null, value?: unknown) => {
      if (settled) return;
      settled = true;
      done(err, value);
    };

    payload.on('data', (chunk: Buffer) => { bytes += chunk.length; });
    payload.on('end', () => finish(null, { _multipart: { bytes, contentType: req.headers['content-type'] } }));
    payload.on('error', (err) => finish(err));
  });

  // Manual CORS handling via hooks (avoids route conflict with catch-all)
  app.addHook('onRequest', async (req, reply) => {
    reply.header('access-control-allow-origin', '*');
    reply.header('access-control-allow-methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    reply.header('access-control-allow-headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      reply.code(204).send();
    }
  });

  // STOMP over raw WebSocket. A fresh mock server (start or restart) begins with no live sessions.
  await app.register(websocket);
  stompRuntime.resetAll();

  // Reject upgrades for paths without an enabled STOMP connection with a plain HTTP 404.
  app.addHook('preValidation', async (req, reply) => {
    if (String(req.headers.upgrade ?? '').toLowerCase() !== 'websocket') return;
    const path = normalizeStompPath(req.url.split('?')[0]);
    const conn = stompRegistry.getByPath(path);
    if (!conn || !conn.isEnabled) {
      reply.code(404).send({ error: `No STOMP connection configured for ${path}` });
    }
  });

  // Catch-all handler delegates to mock-handler service
  const handler = async (req: any, reply: any) => {
    const result = await handleMockRequest(
      req.method,
      req.url,
      req.body ?? req.query ?? {},
      req.headers as Record<string, string>,
    );

    for (const [key, value] of Object.entries(result.headers)) {
      reply.header(key, value);
    }

    reply.code(result.statusCode);
    reply.header('content-type', 'application/json');
    return reply.send(result.body);
  };

  // GET /* serves HTTP mocks and, on upgrade, STOMP — Fastify allows only one GET /* registration.
  app.get('/*', { handler, wsHandler: stompWsHandler } as any);
  app.post('/*', handler);
  app.put('/*', handler);
  app.delete('/*', handler);
  app.patch('/*', handler);

  return app;
}
