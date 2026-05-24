import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerEndpointTools } from './tools/endpoints.js';
import { registerVariantTools } from './tools/variants.js';
import { registerSequenceTools } from './tools/sequences.js';
import { registerEnvironmentTools } from './tools/environments.js';
import { registerCollectionTools } from './tools/collections.js';
import { registerHistoryTools } from './tools/history.js';
import { registerImportExportTools } from './tools/import-export.js';

export async function startMcpServer() {
  const server = new McpServer({
    name: 'mocka',
    version: '1.0.0',
  });

  registerEndpointTools(server);
  registerVariantTools(server);
  registerSequenceTools(server);
  registerEnvironmentTools(server);
  registerCollectionTools(server);
  registerHistoryTools(server);
  registerImportExportTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
