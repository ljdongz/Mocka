import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
}
