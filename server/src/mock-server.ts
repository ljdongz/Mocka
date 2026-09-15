import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { handleMockRequest } from './services/mock-handler.service.js';
import { stompWsHandler } from './stomp/handler.js';
import * as stompRuntime from './stomp/runtime.js';
import * as stompRegistry from './services/stomp-registry.js';
import { normalizeStompPath } from './models/stomp.js';

/** Cap on accepted request body size — JSON via Fastify bodyLimit, multipart via manual counting. */
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MiB

export async function createMockServer(_port: number) {
  const app = Fastify({ logger: false, bodyLimit: MAX_BODY_BYTES });

  // Accept multipart/form-data requests (store raw body without parsing), with a size cap.
  app.addContentTypeParser('multipart/form-data', function (_req, payload, done) {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (err: Error | null, value?: unknown) => {
      if (settled) return;
      settled = true;
      done(err, value);
    };

    payload.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        finish(new Error('Request payload too large'));
        payload.destroy();
        return;
      }
      chunks.push(chunk);
    });
    payload.on('end', () => finish(null, { raw: Buffer.concat(chunks).toString() }));
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
