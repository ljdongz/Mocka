import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mockaFetch, toolResult, toolError } from '../client.js';

export function registerDatasetTools(server: McpServer) {
  server.tool(
    'list_datasets',
    'List all shared datasets (id, name, keyField, records). Datasets back LIST/DETAIL mock responses.',
    {},
    async () => {
      try { return toolResult(await mockaFetch('/api/datasets')); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'get_dataset',
    'Get one dataset by id, including all its records.',
    { id: z.string() },
    async ({ id }) => {
      try { return toolResult(await mockaFetch(`/api/datasets/${id}`)); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'create_dataset',
    'Create a shared dataset. records is an array of objects; keyField names the field used to look up a record in detail mode (e.g. "id" or "idx").',
    {
      name: z.string(),
      keyField: z.string().describe('field every record is keyed by, e.g. "idx"'),
      records: z.array(z.any()).optional().describe('array of record objects (omit for empty)'),
    },
    async ({ name, keyField, records }) => {
      try {
        return toolResult(await mockaFetch('/api/datasets', {
          method: 'POST', body: JSON.stringify({ name, keyField, records }),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'update_dataset',
    'Update a dataset\'s name, keyField, and/or records (records fully replaces the existing array).',
    {
      id: z.string(),
      name: z.string().optional(),
      keyField: z.string().optional(),
      records: z.array(z.any()).optional(),
    },
    async ({ id, ...data }) => {
      try {
        return toolResult(await mockaFetch(`/api/datasets/${id}`, {
          method: 'PUT', body: JSON.stringify(data),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'delete_dataset',
    'Delete a dataset by id.',
    { id: z.string() },
    async ({ id }) => {
      try {
        return toolResult(await mockaFetch(`/api/datasets/${id}`, { method: 'DELETE' }));
      } catch (e) { return toolError(e); }
    },
  );
}
