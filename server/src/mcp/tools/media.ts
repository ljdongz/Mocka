import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mockaFetch, toolResult, toolError } from '../client.js';

export function registerMediaTools(server: McpServer) {
  server.tool(
    'list_media',
    "List registered media files (id, name, mimeType, size). Reference one from a response body with {{$media 'name'}}.",
    {},
    async () => {
      try { return toolResult(await mockaFetch('/api/media')); } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'register_media',
    "Register a local image, video, or file so mock responses can hand out a URL for it. The file is copied into Mocka's data directory, so moving the original afterwards is safe. Put {{$media 'name'}} in a response body and the mock server replaces it with a URL that serves this file — reachable from the simulator and from a real device on the same network.",
    {
      path: z.string().describe('absolute path to the file on this machine, e.g. /Users/me/Movies/clip.mp4 (~ is expanded)'),
      name: z.string().optional().describe("name to reference it by in {{$media '...'}}; defaults to the file name"),
    },
    async ({ path, name }) => {
      try {
        return toolResult(await mockaFetch('/api/media/from-path', {
          method: 'POST', body: JSON.stringify({ path, name }),
        }));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool(
    'delete_media',
    'Delete a registered media file by id, removing both the record and the copied file.',
    { id: z.string() },
    async ({ id }) => {
      try {
        return toolResult(await mockaFetch(`/api/media/${id}`, { method: 'DELETE' }));
      } catch (e) { return toolError(e); }
    },
  );
}
