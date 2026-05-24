import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mockaFetch, toolResult, toolError } from '../client.js';

export function registerCollectionTools(server: McpServer) {
  server.tool(
    'list_collections',
    'List all collections and their endpoint IDs',
    {},
    async () => {
      try {
        return toolResult(await mockaFetch('/api/collections'));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'create_collection',
    'Create a new collection to group endpoints',
    { name: z.string().describe('Collection name (e.g. "Auth", "Users")') },
    async ({ name }) => {
      try {
        return toolResult(await mockaFetch('/api/collections', {
          method: 'POST',
          body: JSON.stringify({ name }),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'update_collection',
    'Rename a collection',
    {
      id: z.string().describe('Collection ID'),
      name: z.string().describe('New collection name'),
    },
    async ({ id, name }) => {
      try {
        return toolResult(await mockaFetch(`/api/collections/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ name }),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'delete_collection',
    'Delete a collection. Endpoints in the collection are NOT deleted, only ungrouped.',
    { id: z.string().describe('Collection ID') },
    async ({ id }) => {
      try {
        await mockaFetch(`/api/collections/${id}`, { method: 'DELETE' });
        return toolResult({ success: true });
      } catch (e) { return toolError(e); }
    },
  );
}
