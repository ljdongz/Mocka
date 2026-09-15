import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerStompTools } from '../mcp/tools/stomp.js';

describe('STOMP MCP tools', () => {
  it('registers the documented tool set', () => {
    const tool = vi.fn();
    registerStompTools({ tool } as unknown as McpServer);
    const names = tool.mock.calls.map(c => c[0]).sort();
    expect(names).toEqual([
      'add_message_variant',
      'create_destination',
      'create_stomp_connection',
      'delete_destination',
      'delete_message_variant',
      'delete_stomp_connection',
      'disconnect_session',
      'fire_destination',
      'inject_error',
      'list_connections',
      'list_sessions',
      'push_message',
      'set_active_message_variant',
      'stop_heartbeat',
      'update_destination',
      'update_message_variant',
      'update_stomp_connection',
    ]);
    // every tool ships a non-trivial description for the agent
    for (const call of tool.mock.calls) {
      expect(typeof call[1]).toBe('string');
      expect((call[1] as string).length).toBeGreaterThan(20);
      expect(typeof call[3]).toBe('function');
    }
  });

  it('does not collide with the HTTP tool names', () => {
    const tool = vi.fn();
    registerStompTools({ tool } as unknown as McpServer);
    const names = tool.mock.calls.map(c => c[0]);
    expect(names).not.toContain('set_active_variant');
    expect(names).not.toContain('add_variant');
    expect(names).not.toContain('list_endpoints');
  });
});
