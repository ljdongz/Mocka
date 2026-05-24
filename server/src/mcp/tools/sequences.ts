import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mockaFetch, toolResult, toolError } from '../client.js';

export function registerSequenceTools(server: McpServer) {
  server.tool(
    'reset_sequence',
    'Reset the sequence counter for an endpoint (or a specific preset) back to the first variant',
    {
      endpointId: z.string().describe('Endpoint ID'),
      presetId: z.string().optional().describe('Preset ID (resets specific preset counter)'),
    },
    async ({ endpointId }) => {
      try {
        await mockaFetch(`/api/endpoints/${endpointId}/sequence/reset`, { method: 'POST' });
        return toolResult({ success: true });
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'reset_all_sequences',
    'Reset all sequence counters for all endpoints',
    {},
    async () => {
      try {
        await mockaFetch('/api/sequence/reset-all', { method: 'POST' });
        return toolResult({ success: true });
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'list_presets',
    'List all sequence presets for an endpoint. Each preset has its own name, mode (sequential/loop), and set of response variants.',
    { endpointId: z.string().describe('Endpoint ID') },
    async ({ endpointId }) => {
      try {
        return toolResult(await mockaFetch(`/api/endpoints/${endpointId}/presets`));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'create_preset',
    'Create a new sequence preset for an endpoint. The first preset is automatically activated.',
    {
      endpointId: z.string().describe('Endpoint ID'),
      name: z.string().optional().describe('Preset name (e.g. "Token Expired Flow")'),
      mode: z.enum(['sequential', 'loop']).optional().describe('sequential = stop at last, loop = wrap around (default: sequential)'),
    },
    async ({ endpointId, ...data }) => {
      try {
        return toolResult(await mockaFetch(`/api/endpoints/${endpointId}/presets`, {
          method: 'POST',
          body: JSON.stringify(data),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'update_preset',
    'Update a sequence preset name or mode',
    {
      presetId: z.string().describe('Preset ID'),
      name: z.string().optional(),
      mode: z.enum(['sequential', 'loop']).optional(),
    },
    async ({ presetId, ...data }) => {
      try {
        return toolResult(await mockaFetch(`/api/presets/${presetId}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'delete_preset',
    'Delete a sequence preset and all its variants. If it was the active preset, another preset is activated or sequence mode is turned off.',
    { presetId: z.string().describe('Preset ID') },
    async ({ presetId }) => {
      try {
        await mockaFetch(`/api/presets/${presetId}`, { method: 'DELETE' });
        return toolResult({ success: true });
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'set_active_preset',
    'Set the active sequence preset for an endpoint',
    {
      endpointId: z.string().describe('Endpoint ID'),
      presetId: z.string().describe('Preset ID to activate'),
    },
    async ({ endpointId, presetId }) => {
      try {
        return toolResult(await mockaFetch(`/api/endpoints/${endpointId}/active-preset`, {
          method: 'PATCH',
          body: JSON.stringify({ presetId }),
        }));
      } catch (e) { return toolError(e); }
    },
  );
}
