import { describe, it, expect, vi, afterEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerServerTools } from '../mcp/tools/server.js';

function tools() {
  const tool = vi.fn();
  registerServerTools({ tool } as unknown as McpServer);
  return new Map(tool.mock.calls.map(c => [c[0] as string, c[3] as (args: unknown) => Promise<unknown>]));
}

describe('server MCP tools', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('registers the documented tool set', () => {
    expect([...tools().keys()].sort()).toEqual(['get_server_status', 'get_settings', 'restart_server', 'update_settings']);
  });

  it('update_settings sends only the fields given to PUT /api/settings', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ downloadRateKbps: 300 }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await tools().get('update_settings')!({ downloadRateKbps: 300 });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/settings$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ downloadRateKbps: 300 });
  });
});
