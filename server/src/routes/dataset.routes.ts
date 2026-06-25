import type { FastifyInstance } from 'fastify';
import * as datasetService from '../services/dataset.service.js';

export async function datasetRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/datasets', async () => datasetService.getAll());

  app.get('/api/datasets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ds = datasetService.getById(id);
    if (!ds) { reply.code(404); return { error: 'Not found' }; }
    return ds;
  });

  app.post('/api/datasets', async (req, reply) => {
    const body = req.body as { name?: string; keyField?: string; records?: any[] };
    if (!body.name || !body.keyField) { reply.code(400); return { error: 'name and keyField are required' }; }
    reply.code(201);
    return datasetService.create({ name: body.name, keyField: body.keyField, records: body.records });
  });

  app.put('/api/datasets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Partial<{ name: string; keyField: string; records: any[] }>;
    const ds = datasetService.update(id, body);
    if (!ds) { reply.code(404); return { error: 'Not found' }; }
    return ds;
  });

  app.delete('/api/datasets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = datasetService.remove(id);
    if (!ok) { reply.code(404); return { error: 'Not found' }; }
    return { success: true };
  });
}
