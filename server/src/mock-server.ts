import Fastify from 'fastify';
import { match } from './services/route-registry.js';
import * as historyService from './services/history.service.js';
import { broadcast } from './plugins/websocket.js';

export async function createMockServer(port: number) {
  const app = Fastify({ logger: false });

  // Accept multipart/form-data requests (store raw body without parsing)
  app.addContentTypeParser('multipart/form-data', function (_req, payload, done) {
    const chunks: Buffer[] = [];
    payload.on('data', (chunk: Buffer) => chunks.push(chunk));
    payload.on('end', () => {
      done(null, { raw: Buffer.concat(chunks).toString() });
    });
    payload.on('error', done);
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

  // Catch-all handler for actual requests
  const handler = async (req: any, reply: any) => {
    const method = req.method;
    const fullUrl = req.url;
    const path = fullUrl.split('?')[0];

    const endpoint = match(method, path);

    if (!endpoint) {
      const message = `No mock endpoint configured for ${method} ${path}`;
      const record = historyService.record({
        method,
        path: fullUrl,
        statusCode: 404,
        bodyOrParams: JSON.stringify(req.body ?? {}),
        requestHeaders: JSON.stringify(req.headers),
        responseBody: JSON.stringify({ error: message }),
      });
      broadcast('history:new', record);
      reply.code(404);
      return { error: message };
    }

    // Find active variant
    const variant = endpoint.responseVariants?.find(v => v.id === endpoint.activeVariantId)
      ?? endpoint.responseVariants?.[0];

    if (!variant) {
      reply.code(500);
      return { error: 'No response variant configured' };
    }

    // Apply delay
    const delay = variant.delay ?? 0;
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Parse response headers
    try {
      const headers = JSON.parse(variant.headers);
      for (const [key, value] of Object.entries(headers)) {
        reply.header(key, value as string);
      }
    } catch { /* ignore invalid headers */ }

    // Record request
    const record = historyService.record({
      method,
      path: fullUrl,
      statusCode: variant.statusCode,
      bodyOrParams: JSON.stringify(req.body ?? req.query ?? {}),
      requestHeaders: JSON.stringify(req.headers),
      responseBody: variant.body,
    });
    broadcast('history:new', record);

    reply.code(variant.statusCode);
    reply.header('content-type', 'application/json');
    return reply.send(variant.body);
  };

  // Register for each method individually (avoids OPTIONS conflict)
  app.get('/*', handler);
  app.post('/*', handler);
  app.put('/*', handler);
  app.delete('/*', handler);
  app.patch('/*', handler);

  return app;
}
