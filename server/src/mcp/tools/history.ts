import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mockaFetch, toolResult, toolError } from '../client.js';

export function registerHistoryTools(server: McpServer) {
  server.tool(
    'get_history',
    'Get request history log. Shows recent requests made to the mock server with method, path, status code, and timestamps.',
    {
      method: z.string().optional().describe('Filter by HTTP method'),
      search: z.string().optional().describe('Search in path'),
      limit: z.number().optional().describe('Max results (default: 50)'),
      offset: z.number().optional().describe('Pagination offset'),
    },
    async (params) => {
      try {
        const qs = new URLSearchParams();
        if (params.method) qs.set('method', params.method);
        if (params.search) qs.set('search', params.search);
        if (params.limit) qs.set('limit', String(params.limit));
        if (params.offset) qs.set('offset', String(params.offset));
        const query = qs.toString();
        return toolResult(await mockaFetch(`/api/history${query ? `?${query}` : ''}`));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'clear_history',
    'Clear all request history',
    {},
    async () => {
      try {
        await mockaFetch('/api/history', { method: 'DELETE' });
        return toolResult({ success: true });
      } catch (e) { return toolError(e); }
    },
  );
}
