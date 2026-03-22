import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { handleMockRequest } from './services/mock-handler.service.js';
import { wsHandler } from './plugins/ws-mock.js';

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

  // Register WebSocket support
  await app.register(websocket);

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

  // GET /* combines HTTP handler + WebSocket handler on a single route
  // Fastify does not allow two GET /* registrations, so wsHandler is attached here
  app.get('/*', { handler, wsHandler } as any);
  app.post('/*', handler);
  app.put('/*', handler);
  app.delete('/*', handler);
  app.patch('/*', handler);

  return app;
}
