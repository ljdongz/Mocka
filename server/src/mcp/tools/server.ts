import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mockaFetch, toolResult, toolError } from '../client.js';

export function registerServerTools(server: McpServer) {
  server.tool(
    'get_server_status',
    'Get mock server status including whether it is running, the current port, and local IP address',
    {},
    async () => {
      try {
        return toolResult(await mockaFetch('/api/server/status'));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'restart_server',
    'Restart the mock server. Use after changing the mock server port in settings.',
    {},
    async () => {
      try {
        return toolResult(await mockaFetch('/api/server/restart', { method: 'POST' }));
      } catch (e) { return toolError(e); }
    },
  );
}
