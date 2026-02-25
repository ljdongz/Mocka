import type { FastifyInstance } from 'fastify';
import * as importExportService from '../services/import-export.service.js';
import type { ConflictPolicy } from '../services/import-export.service.js';

const VALID_POLICIES = new Set(['skip', 'overwrite', 'merge']);

export async function importExportRoutes(app: FastifyInstance): Promise<void> {
  // Export all or by collection IDs
  app.post('/api/export', async (req) => {
    const { collectionIds } = (req.body as { collectionIds?: string[] }) ?? {};
    return importExportService.exportData(collectionIds);
  });

  // Import with conflict policy
  app.post('/api/import', async (req, reply) => {
    const { data, conflictPolicy } = req.body as {
      data: importExportService.ExportData;
      conflictPolicy: ConflictPolicy;
    };

    if (!data || data.version !== 1) {
      reply.code(400);
      return { error: 'Invalid or unsupported export format. Expected version 1.' };
    }

    if (!Array.isArray(data.endpoints)) {
      reply.code(400);
      return { error: 'Invalid import data: endpoints must be an array.' };
    }

    if (data.collections !== undefined && !Array.isArray(data.collections)) {
      reply.code(400);
      return { error: 'Invalid import data: collections must be an array.' };
    }

    const policy: ConflictPolicy = VALID_POLICIES.has(conflictPolicy) ? conflictPolicy : 'skip';
    const result = importExportService.importData(data, policy);
    return result;
  });
}
