import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mockaFetch, toolResult, toolError } from '../client.js';

export function registerEnvironmentTools(server: McpServer) {
  server.tool(
    'list_environments',
    'List all environments and their variables. The active environment\'s variables are used as template values in response bodies.',
    {},
    async () => {
      try {
        return toolResult(await mockaFetch('/api/environments'));
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
