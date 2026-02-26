import type { FastifyInstance } from 'fastify';
import * as endpointService from '../services/endpoint.service.js';

export async function endpointRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/endpoints', async () => {
    return endpointService.getAll();
  });

  app.get('/api/endpoints/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ep = endpointService.getById(id);
    if (!ep) { reply.code(404); return { error: 'Not found' }; }
    return ep;
  });

  app.post('/api/endpoints', async (req, reply) => {
    const body = req.body as { method: string; path: string; name?: string; collectionId?: string };
    try {
      const ep = endpointService.create({
        method: body.method as any,
        path: body.path,
        name: body.name,
        collectionId: body.collectionId,
      });
      reply.code(201);
      return ep;
    } catch (e: any) {
      reply.code(400);
      const msg = e.message?.includes('UNIQUE constraint')
        ? `Endpoint ${body.method} ${body.path} already exists`
        : 'Failed to create endpoint';
      return { error: msg };
    }
  });

  app.put('/api/endpoints/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = req.body as any;
    const ep = endpointService.update(id, data);
    if (!ep) { reply.code(404); return { error: 'Not found' }; }
    return ep;
  });

  app.delete('/api/endpoints/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = endpointService.remove(id);
    if (!ok) { reply.code(404); return { error: 'Not found' }; }
    return { success: true };
  });

  app.patch('/api/endpoints/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ep = endpointService.toggleEnabled(id);
    if (!ep) { reply.code(404); return { error: 'Not found' }; }
    return ep;
  });

  app.patch('/api/endpoints/:id/active-variant', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { variantId } = req.body as { variantId: string | null };
    const ep = endpointService.setActiveVariant(id, variantId);
    if (!ep) { reply.code(404); return { error: 'Not found' }; }
    return ep;
  });

  // Variants
  app.post('/api/endpoints/:id/variants', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = req.body as any;
    const ep = endpointService.addVariant(id, data);
    if (!ep) { reply.code(404); return { error: 'Not found' }; }
    reply.code(201);
    return ep;
  });

  app.put('/api/variants/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = req.body as any;
    const variant = endpointService.updateVariant(id, data);
    if (!variant) { reply.code(404); return { error: 'Not found' }; }
    return variant;
  });

  app.delete('/api/variants/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = endpointService.removeVariant(id);
    if (!ok) { reply.code(404); return { error: 'Not found' }; }
    return { success: true };
  });
}
