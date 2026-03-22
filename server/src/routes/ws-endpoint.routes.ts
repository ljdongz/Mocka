import type { FastifyInstance } from 'fastify';
import * as wsEndpointService from '../services/ws-endpoint.service.js';
import { normalizePath } from '../models/route-path.js';

export async function wsEndpointRoutes(app: FastifyInstance): Promise<void> {
  // List all WS endpoints
  app.get('/api/ws-endpoints', async () => {
    return wsEndpointService.getAll();
  });

  // Get single WS endpoint by ID
  app.get('/api/ws-endpoints/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ep = wsEndpointService.getById(id);
    if (!ep) { reply.code(404); return { error: 'Not found' }; }
    return ep;
  });

  // Create WS endpoint
  app.post('/api/ws-endpoints', async (req, reply) => {
    const body = req.body as { path: string; name?: string };
    if (!body.path || !body.path.startsWith('/')) {
      reply.code(400);
      return { error: 'Path must start with /' };
    }
    try {
      const ep = wsEndpointService.create({
        path: body.path,
        name: body.name,
      });
      reply.code(201);
      return ep;
    } catch (e: any) {
      reply.code(400);
      const msg = e.message?.includes('UNIQUE constraint')
        ? `WS endpoint ${body.path} already exists`
        : 'Failed to create WS endpoint';
      return { error: msg };
    }
  });

  // Update WS endpoint
  app.put('/api/ws-endpoints/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = req.body as any;
    if (data.path !== undefined && !data.path.startsWith('/')) {
      reply.code(400);
      return { error: 'Path must start with /' };
    }
    const ep = wsEndpointService.update(id, data);
    if (!ep) { reply.code(404); return { error: 'Not found' }; }
    return ep;
  });

  // Delete WS endpoint
  app.delete('/api/ws-endpoints/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = wsEndpointService.remove(id);
    if (!ok) { reply.code(404); return { error: 'Not found' }; }
    return { success: true };
  });

  // Toggle enabled
  app.patch('/api/ws-endpoints/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ep = wsEndpointService.toggleEnabled(id);
    if (!ep) { reply.code(404); return { error: 'Not found' }; }
    return ep;
  });

  // Set active frame
  app.patch('/api/ws-endpoints/:id/active-frame', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { frameId } = req.body as { frameId: string | null };
    const ep = wsEndpointService.setActiveFrame(id, frameId);
    if (!ep) { reply.code(404); return { error: 'Not found' }; }
    return ep;
  });

  // Add frame to WS endpoint
  app.post('/api/ws-endpoints/:id/frames', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = req.body as any;
    const ep = wsEndpointService.addFrame(id, data);
    if (!ep) { reply.code(404); return { error: 'Not found' }; }
    reply.code(201);
    return ep;
  });

  // Update a frame
  app.put('/api/ws-frames/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = req.body as any;
    if (data.delay !== undefined && data.delay !== null && data.delay < 0) {
      reply.code(400);
      return { error: 'Delay must be non-negative' };
    }
    const frame = wsEndpointService.updateFrame(id, data);
    if (!frame) { reply.code(404); return { error: 'Not found' }; }
    return frame;
  });

  // Delete a frame
  app.delete('/api/ws-frames/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = wsEndpointService.removeFrame(id);
    if (!ok) { reply.code(404); return { error: 'Not found' }; }
    return { success: true };
  });
}
