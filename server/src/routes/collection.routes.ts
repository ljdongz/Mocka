import type { FastifyInstance } from 'fastify';
import * as collectionService from '../services/collection.service.js';

export async function collectionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/collections', async () => {
    return collectionService.getAll();
  });

  app.post('/api/collections', async (req, reply) => {
    const { name, parentId } = req.body as { name: string; parentId?: string | null };
    const c = collectionService.create(name, parentId ?? null);
    if (!c) { reply.code(404); return { error: 'Parent collection not found' }; }
    reply.code(201);
    return c;
  });

  app.put('/api/collections/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = req.body as { name?: string };
    const c = collectionService.update(id, data);
    if (!c) { reply.code(404); return { error: 'Not found' }; }
    return c;
  });

  app.delete('/api/collections/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = collectionService.remove(id);
    if (!ok) { reply.code(404); return { error: 'Not found' }; }
    return { success: true };
  });

  app.patch('/api/collections/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = collectionService.toggleExpanded(id);
    if (!c) { reply.code(404); return { error: 'Not found' }; }
    return c;
  });

  app.put('/api/collections/:id/move', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { parentId, index } = req.body as { parentId: string | null; index?: number };
    const result = collectionService.move(id, parentId ?? null, typeof index === 'number' ? index : undefined);
    if (typeof result === 'string') { reply.code(result.endsWith('not found') ? 404 : 400); return { error: result }; }
    return result;
  });

  app.put('/api/collections/reorder', async (req) => {
    const { orderedIds } = req.body as { orderedIds: string[] };
    collectionService.reorderCollections(orderedIds);
    return { success: true };
  });

  app.put('/api/collections/:id/reorder-endpoints', async (req) => {
    const { id } = req.params as { id: string };
    const { orderedEndpointIds } = req.body as { orderedEndpointIds: string[] };
    collectionService.reorderEndpoints(id, orderedEndpointIds);
    return { success: true };
  });

  app.put('/api/collections/move-endpoint', async (req) => {
    const { endpointId, fromCollectionId, toCollectionId, sortOrder } = req.body as any;
    collectionService.moveEndpoint(endpointId, fromCollectionId, toCollectionId, sortOrder);
    return { success: true };
  });

  // Drag and drop: put a collection or endpoint anywhere in the tree.
  app.put('/api/collections/place', async (req, reply) => {
    const { type, id, fromCollectionId, parentId, index } = req.body as {
      type: 'collection' | 'endpoint'; id: string; fromCollectionId?: string | null; parentId: string | null; index?: number;
    };
    if (type !== 'collection' && type !== 'endpoint') { reply.code(400); return { error: 'type must be collection or endpoint' }; }
    const error = collectionService.place({ type, id }, fromCollectionId ?? null, parentId ?? null,
      typeof index === 'number' ? index : Number.MAX_SAFE_INTEGER);
    if (error) { reply.code(error.endsWith('not found') ? 404 : 400); return { error }; }
    return { success: true };
  });

  app.delete('/api/collections/:collectionId/endpoints/:endpointId', async (req, reply) => {
    const { collectionId, endpointId } = req.params as { collectionId: string; endpointId: string };
    collectionService.removeEndpoint(collectionId, endpointId);
    return { success: true };
  });
}
