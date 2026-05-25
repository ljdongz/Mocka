import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mockaFetch, toolResult, toolError } from '../client.js';

const matchRuleSchema = z.object({
  field: z.string(),
  operator: z.enum(['equals', 'contains', 'startsWith', 'endsWith', 'regex']),
  value: z.string(),
});

const matchRulesSchema = z.object({
  bodyRules: z.array(matchRuleSchema).optional().default([]),
  headerRules: z.array(matchRuleSchema).optional().default([]),
  queryParamRules: z.array(matchRuleSchema).optional().default([]),
  pathParamRules: z.array(matchRuleSchema).optional().default([]),
  combineWith: z.enum(['AND', 'OR']).optional().default('AND'),
});

export function registerVariantTools(server: McpServer) {
  server.tool(
    'add_variant',
    'Add a response variant. For standard variants, provide endpointId. For sequence variants, provide presetId (from create_preset or list_presets). Do NOT use variantGroup — it is determined automatically by whether presetId is provided.',
    {
      endpointId: z.string().optional().describe('Endpoint ID (required — identifies which endpoint)'),
      presetId: z.string().optional().describe('Preset ID — if provided, variant is added to this sequence preset. If omitted, variant is added as a standard variant.'),
      statusCode: z.number().optional().describe('HTTP status code (default: 200)'),
      description: z.string().optional().describe('Variant label'),
    },
    async ({ endpointId, presetId, ...data }) => {
      try {
        if (presetId) {
          return toolResult(await mockaFetch(`/api/presets/${presetId}/variants`, {
            method: 'POST',
            body: JSON.stringify(data),
          }));
        }
        if (!endpointId) return toolError(new Error('endpointId is required'));
        return toolResult(await mockaFetch(`/api/endpoints/${endpointId}/variants`, {
          method: 'POST',
          body: JSON.stringify(data),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'update_variant',
    'Update a response variant (status code, body, headers, delay, match rules, preset link, etc.)',
    {
      id: z.string().describe('Variant ID'),
      statusCode: z.number().optional(),
      description: z.string().optional(),
      body: z.string().optional().describe('Response body (JSON string). Supports template helpers like {{$body.field}}, {{$query.key}}, {{$path.segment}}'),
      headers: z.string().optional().describe('Response headers as JSON string (e.g. {"Content-Type":"application/json"})'),
      delay: z.number().nullable().optional().describe('Response delay in seconds'),
      memo: z.string().optional(),
      presetId: z.string().nullable().optional().describe('Link this variant to a sequence preset (set null to unlink)'),
      matchRules: matchRulesSchema.nullable().optional().describe('Conditional match rules for this variant'),
    },
    async ({ id, ...data }) => {
      try {
        if (typeof data.body === 'string') {
          data.body = data.body.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
        }
        return toolResult(await mockaFetch(`/api/variants/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'delete_variant',
    'Delete a response variant',
    { id: z.string().describe('Variant ID') },
    async ({ id }) => {
      try {
        await mockaFetch(`/api/variants/${id}`, { method: 'DELETE' });
        return toolResult({ success: true });
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'set_active_variant',
    'Set which variant is the default response for an endpoint (used when sequenceMode is off and no match rules match)',
    {
      endpointId: z.string().describe('Endpoint ID'),
      variantId: z.string().nullable().describe('Variant ID to activate, or null'),
    },
    async ({ endpointId, variantId }) => {
      try {
        return toolResult(await mockaFetch(`/api/endpoints/${endpointId}/active-variant`, {
          method: 'PATCH',
          body: JSON.stringify({ variantId }),
        }));
      } catch (e) { return toolError(e); }
    },
  );
}
