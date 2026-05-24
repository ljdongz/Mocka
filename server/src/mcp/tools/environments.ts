import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mockaFetch, toolResult, toolError } from '../client.js';

export function registerEnvironmentTools(server: McpServer) {
  server.tool(
    'list_environments',
    'List all environments and their variables. The active environment\'s variables are used as template values in response bodies via {{varName}} syntax.',
    {},
    async () => {
      try {
        return toolResult(await mockaFetch('/api/environments'));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'create_environment',
    'Create a new environment. The first environment is automatically activated.',
    { name: z.string().describe('Environment name (e.g. "Development", "Staging")') },
    async ({ name }) => {
      try {
        return toolResult(await mockaFetch('/api/environments', {
          method: 'POST',
          body: JSON.stringify({ name }),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'update_environment',
    'Update an environment name or variables. Variables are key-value pairs used in response body templates via {{varName}} syntax.',
    {
      id: z.string().describe('Environment ID'),
      name: z.string().optional().describe('New environment name'),
      variables: z.record(z.string()).optional().describe('Variables as key-value pairs (e.g. {"baseUrl": "https://api.example.com", "apiKey": "xyz"})'),
    },
    async ({ id, ...data }) => {
      try {
        return toolResult(await mockaFetch(`/api/environments/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'delete_environment',
    'Delete an environment',
    { id: z.string().describe('Environment ID') },
    async ({ id }) => {
      try {
        await mockaFetch(`/api/environments/${id}`, { method: 'DELETE' });
        return toolResult({ success: true });
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'set_active_environment',
    'Set the active environment. Pass null to deactivate all environments.',
    { id: z.string().nullable().describe('Environment ID to activate, or null to deactivate') },
    async ({ id }) => {
      try {
        return toolResult(await mockaFetch('/api/environments/active', {
          method: 'PATCH',
          body: JSON.stringify({ id }),
        }));
      } catch (e) { return toolError(e); }
    },
  );
}
