import type { FastifyInstance } from 'fastify';
import * as settingsService from '../services/settings.service.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings', async () => {
    return settingsService.getAll();
  });

  app.put('/api/settings', async (req) => {
    const data = req.body as any;
    return settingsService.update(data);
  });
}
