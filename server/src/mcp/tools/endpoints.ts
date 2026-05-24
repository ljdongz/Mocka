import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mockaFetch, toolResult, toolError } from '../client.js';

const methodEnum = z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);

export function registerEndpointTools(server: McpServer) {
  server.tool(
    'list_endpoints',
    'List all mock endpoints with their response variants',
    {},
    async () => {
      try {
        return toolResult(await mockaFetch('/api/endpoints'));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'get_endpoint',
    'Get a specific endpoint by ID, including all response variants and match rules',
    { id: z.string().describe('Endpoint ID') },
    async ({ id }) => {
      try {
        return toolResult(await mockaFetch(`/api/endpoints/${id}`));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'create_endpoint',
    'Create a new mock endpoint. A default 200 response variant is created automatically.',
    {
      method: methodEnum.describe('HTTP method'),
      path: z.string().describe('URL path (e.g. /api/users/:id)'),
      name: z.string().optional().describe('Display name'),
      collectionId: z.string().optional().describe('Collection ID to add this endpoint to'),
    },
    async (params) => {
      try {
        return toolResult(await mockaFetch('/api/endpoints', {
          method: 'POST',
          body: JSON.stringify(params),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'update_endpoint',
    'Update an existing endpoint (method, path, name, sequenceMode, isEnabled)',
    {
      id: z.string().describe('Endpoint ID'),
      method: methodEnum.optional(),
      path: z.string().optional(),
      name: z.string().optional(),
      sequenceMode: z.enum(['off', 'on']).optional().describe('off = standard mode, on = sequence mode (uses active preset)'),
      isEnabled: z.boolean().optional(),
    },
    async ({ id, ...data }) => {
      try {
        return toolResult(await mockaFetch(`/api/endpoints/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'delete_endpoint',
    'Delete an endpoint and all its response variants',
    { id: z.string().describe('Endpoint ID') },
    async ({ id }) => {
      try {
        await mockaFetch(`/api/endpoints/${id}`, { method: 'DELETE' });
        return toolResult({ success: true });
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'toggle_endpoint',
    'Enable or disable an endpoint',
    { id: z.string().describe('Endpoint ID') },
    async ({ id }) => {
      try {
        return toolResult(await mockaFetch(`/api/endpoints/${id}/toggle`, { method: 'PATCH' }));
      } catch (e) { return toolError(e); }
    },
  );
}
