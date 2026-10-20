import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
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
    'get_settings',
    'Get mock server settings: global response delay (seconds), upload and download rate limits (KB/s, 0 = unlimited), max request body (MB), ports',
    {},
    async () => {
      try {
        return toolResult(await mockaFetch('/api/settings'));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'update_settings',
    'Update network-simulation settings; they apply from the next request, no restart. downloadRateKbps paces response ' +
    'bodies (mock JSON and media files) so a client\'s download progress shows; uploadRateKbps reads request bodies that slowly. ' +
    'Per-request headers x-mock-download-rate-kbps, x-mock-upload-rate-kbps and x-mock-response-delay override these. ' +
    'Only the fields passed are changed.',
    {
      responseDelay: z.number().int().min(0).optional().describe('Global response delay in whole SECONDS (a variant delay wins)'),
      uploadRateKbps: z.number().min(0).optional().describe('Upload rate limit in KB/s, 0 = unlimited'),
      downloadRateKbps: z.number().min(0).optional().describe('Download rate limit in KB/s, 0 = unlimited'),
      maxBodyMB: z.number().positive().optional().describe('Largest accepted request body in MB; larger requests get a 413'),
    },
    async (data) => {
      try {
        return toolResult(await mockaFetch('/api/settings', { method: 'PUT', body: JSON.stringify(data) }));
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
