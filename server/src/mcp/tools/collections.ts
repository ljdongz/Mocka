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

  server.tool(
    'reorder_collections',
    'Reorder collections by providing the full list of collection IDs in the desired order',
    { orderedIds: z.array(z.string()).describe('Collection IDs in desired order') },
    async ({ orderedIds }) => {
      try {
        await mockaFetch('/api/collections/reorder', {
          method: 'PUT',
          body: JSON.stringify({ orderedIds }),
        });
        return toolResult({ success: true });
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'reorder_collection_endpoints',
    'Reorder endpoints within a collection',
    {
      collectionId: z.string().describe('Collection ID'),
      orderedEndpointIds: z.array(z.string()).describe('Endpoint IDs in desired order'),
    },
    async ({ collectionId, orderedEndpointIds }) => {
      try {
        await mockaFetch(`/api/collections/${collectionId}/reorder-endpoints`, {
          method: 'PUT',
          body: JSON.stringify({ orderedEndpointIds }),
        });
        return toolResult({ success: true });
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'move_endpoint',
    'Move an endpoint from one collection to another',
    {
      endpointId: z.string().describe('Endpoint ID to move'),
      fromCollectionId: z.string().nullable().describe('Source collection ID (null if ungrouped)'),
      toCollectionId: z.string().describe('Destination collection ID'),
      sortOrder: z.number().optional().describe('Position in destination collection (default: 0)'),
    },
    async ({ endpointId, fromCollectionId, toCollectionId, sortOrder }) => {
      try {
        await mockaFetch('/api/collections/move-endpoint', {
          method: 'PUT',
          body: JSON.stringify({ endpointId, fromCollectionId, toCollectionId, sortOrder: sortOrder ?? 0 }),
        });
        return toolResult({ success: true });
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'remove_endpoint_from_collection',
    'Remove an endpoint from a collection without deleting the endpoint itself',
    {
      collectionId: z.string().describe('Collection ID'),
      endpointId: z.string().describe('Endpoint ID to remove'),
    },
    async ({ collectionId, endpointId }) => {
      try {
        await mockaFetch(`/api/collections/${collectionId}/endpoints/${endpointId}`, { method: 'DELETE' });
        return toolResult({ success: true });
      } catch (e) { return toolError(e); }
    },
  );
}
