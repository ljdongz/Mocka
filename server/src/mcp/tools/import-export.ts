import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mockaFetch, toolResult, toolError } from '../client.js';

export function registerImportExportTools(server: McpServer) {
  server.tool(
    'export_data',
    'Export all mock endpoints, collections and STOMP connections as JSON. Optionally filter by collection IDs (a filtered export carries HTTP endpoints only).',
    {
      collectionIds: z.array(z.string()).optional().describe('Export only these collections (omit for all)'),
    },
    async ({ collectionIds }) => {
      try {
        return toolResult(await mockaFetch('/api/export', {
          method: 'POST',
          body: JSON.stringify({ collectionIds }),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'import_data',
    'Import mock data from a previously exported JSON, including any STOMP connections it carries. Supports conflict policies: skip (keep existing), overwrite (replace existing on a method+path or STOMP path clash), replace (DELETE every existing endpoint, collection and STOMP connection first, then import). Datasets, environments, media and history are never touched.',
    {
      data: z.any().describe('The exported JSON data object (with version, endpoints, collections and optionally stompConnections fields)'),
      conflictPolicy: z.enum(['skip', 'overwrite', 'replace']).optional().describe('How to handle existing data (default: skip). replace wipes all endpoints, collections and STOMP connections before importing.'),
    },
    async ({ data, conflictPolicy }) => {
      try {
        return toolResult(await mockaFetch('/api/import', {
          method: 'POST',
          body: JSON.stringify({ data, conflictPolicy: conflictPolicy ?? 'skip' }),
        }));
      } catch (e) { return toolError(e); }
    },
  );
}
