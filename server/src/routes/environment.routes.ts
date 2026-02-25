import type { FastifyInstance } from 'fastify';
import * as environmentService from '../services/environment.service.js';

export async function environmentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/environments', async () => {
    return environmentService.getAll();
  });

  app.post('/api/environments', async (req, reply) => {
    const { name } = req.body as { name: string };
    const env = environmentService.create({ name });
    reply.code(201);
    return env;
  });

  app.put('/api/environments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = req.body as any;
    const env = environmentService.update(id, data);
    if (!env) { reply.code(404); return { error: 'Not found' }; }
    return env;
  });

  app.patch('/api/environments/active', async (req) => {
    const { id } = req.body as { id: string | null };
    return environmentService.setActive(id);
  });

  app.delete('/api/environments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = environmentService.remove(id);
    if (!ok) { reply.code(404); return { error: 'Not found' }; }
    return { success: true };
  });
}
