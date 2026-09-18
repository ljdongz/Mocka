import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as mediaService from '../services/media.service.js';
import { MediaError } from '../services/media.service.js';

/** Turn a MediaError into its status code; anything else is a 500. */
function fail(reply: FastifyReply, err: unknown) {
  if (err instanceof MediaError) {
    reply.code(err.statusCode);
    return { error: err.message };
  }
  reply.code(500);
  return { error: err instanceof Error ? err.message : String(err) };
}

/**
 * Registering by path makes the admin API read an arbitrary local file, so this
 * route is fenced off twice.
 *
 * The admin server listens on 0.0.0.0, so first: only this machine may call it.
 * That alone is not enough. The admin API allows any origin, and a page the user
 * happens to visit runs *on* this machine — its request arrives from 127.0.0.1
 * and passes an IP check, after which the page can read any file the user can
 * and fetch the bytes back from the mock port. So second: refuse anything a
 * browser sent. A browser attaches `Origin` to a cross-site POST (and `Sec-Fetch-Site`
 * to every request) and cannot suppress either; the clients this route is for —
 * the MCP server, curl — send neither.
 */
function isLocalNonBrowser(req: FastifyRequest): boolean {
  const ip = req.ip ?? '';
  const fromThisMachine = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  const fromBrowser = req.headers.origin !== undefined || req.headers['sec-fetch-site'] !== undefined;
  return fromThisMachine && !fromBrowser;
}

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/media', async () => mediaService.getAll());

  app.get('/api/media/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const media = mediaService.getById(id);
    if (!media) { reply.code(404); return { error: 'Not found' }; }
    return media;
  });

  // Upload one or more files as multipart/form-data. A `name` field, when present,
  // renames a single uploaded file; with several files the generated names are used.
  app.post('/api/media', async (req, reply) => {
    if (!req.isMultipart()) {
      reply.code(415);
      return { error: 'Expected multipart/form-data. Use POST /api/media/from-path to register a local file by path.' };
    }

    const created = [];
    try {
      for await (const part of req.parts()) {
        if (part.type !== 'file') continue;
        created.push(await mediaService.registerFromStream({
          stream: part.file,
          originalName: part.filename,
          mimeType: part.mimetype,
          name: typeof (part.fields as any)?.name?.value === 'string'
            ? (part.fields as any).name.value
            : undefined,
        }));
      }
    } catch (err) {
      return fail(reply, err);
    }

    if (created.length === 0) { reply.code(400); return { error: 'No file part in the request' }; }
    reply.code(201);
    return created;
  });

  app.post('/api/media/from-path', async (req, reply) => {
    if (!isLocalNonBrowser(req)) {
      reply.code(403);
      return { error: 'Registering by file path is allowed only for local non-browser clients such as the MCP server. Upload the file instead.' };
    }
    const body = req.body as { path?: string; name?: string };
    if (!body?.path) { reply.code(400); return { error: 'path is required' }; }
    try {
      reply.code(201);
      return await mediaService.registerFromPath({ path: body.path, name: body.name });
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.put('/api/media/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string };
    if (!body?.name) { reply.code(400); return { error: 'name is required' }; }
    try {
      const media = mediaService.rename(id, body.name);
      if (!media) { reply.code(404); return { error: 'Not found' }; }
      return media;
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.delete('/api/media/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!mediaService.remove(id)) { reply.code(404); return { error: 'Not found' }; }
    return { success: true };
  });
}
