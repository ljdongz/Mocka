import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { handleMockRequest } from './services/mock-handler.service.js';
import { MEDIA_URL_PREFIX } from './utils/template-media.js';
import { ensureMediaDir } from './utils/paths.js';

/** Cap on accepted request body size — JSON via Fastify bodyLimit, multipart via manual counting. */
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MiB

export async function createMockServer(_port: number) {
  const app = Fastify({ logger: false, bodyLimit: MAX_BODY_BYTES });

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

  app.get('/*', handler);
  app.post('/*', handler);
  app.put('/*', handler);
  app.delete('/*', handler);
  app.patch('/*', handler);

  return app;
}
