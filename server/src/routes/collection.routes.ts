import type { FastifyInstance } from 'fastify';
import * as collectionService from '../services/collection.service.js';
import { broadcast } from '../plugins/websocket.js';

export async function collectionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/collections', async () => {
    return collectionService.getAll();
  });

  app.post('/api/collections', async (req, reply) => {
    const { name } = req.body as { name: string };
    const c = collectionService.create(name);
    broadcast('collection:created', c);
    reply.code(201);
    return c;
  });

  app.put('/api/collections/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = req.body as { name?: string };
    const c = collectionService.update(id, data);
    if (!c) { reply.code(404); return { error: 'Not found' }; }
    broadcast('collection:updated', c);
    return c;
  });

  app.delete('/api/collections/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = collectionService.remove(id);
    if (!ok) { reply.code(404); return { error: 'Not found' }; }
    broadcast('collection:deleted', { id });
    return { success: true };
  });

  app.patch('/api/collections/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = collectionService.toggleExpanded(id);
    if (!c) { reply.code(404); return { error: 'Not found' }; }
    broadcast('collection:updated', c);
    return c;
  });

  app.put('/api/collections/move-endpoint', async (req) => {
    const { endpointId, fromCollectionId, toCollectionId, sortOrder } = req.body as any;
    collectionService.moveEndpoint(endpointId, fromCollectionId, toCollectionId, sortOrder);
    broadcast('collection:reordered', null);
    return { success: true };
  });

  app.delete('/api/collections/:collectionId/endpoints/:endpointId', async (req, reply) => {
    const { collectionId, endpointId } = req.params as { collectionId: string; endpointId: string };
    collectionService.removeEndpoint(collectionId, endpointId);
    const updated = collectionService.getAll().find(c => c.id === collectionId);
    if (updated) broadcast('collection:updated', updated);
    return { success: true };
  });
}
