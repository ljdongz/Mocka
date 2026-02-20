import type { FastifyInstance } from 'fastify';
import * as historyService from '../services/history.service.js';
import { broadcast } from '../plugins/websocket.js';

export async function historyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/history', async (req) => {
    const query = req.query as { method?: string; search?: string; limit?: string; offset?: string };
    return historyService.getAll({
      method: query.method,
      search: query.search,
      limit: query.limit ? parseInt(query.limit) : undefined,
      offset: query.offset ? parseInt(query.offset) : undefined,
    });
  });

  app.delete('/api/history', async () => {
    historyService.clearAll();
    broadcast('history:cleared');
    return { success: true };
  });
}
