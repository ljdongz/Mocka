import { describe, it, expect, vi, beforeEach } from 'vitest';

const execSyncMock = vi.fn();
vi.mock('child_process', () => ({
  execSync: (...args: any[]) => execSyncMock(...args),
}));

const { uninstallClaudeCode } = await import('../mcp/install.js');

describe('uninstallClaudeCode', () => {
  beforeEach(() => { execSyncMock.mockReset(); });

  it('removes from every scope the server exists in, not just one', () => {
    // Reproduces the bug: `claude mcp remove mocka` without --scope refuses
    // outright when the server is registered in more than one scope.
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith('which ')) return '';
      if (cmd.includes('--scope project')) throw new Error('No MCP server named "mocka" in .mcp.json');
      return '';
    });

    expect(uninstallClaudeCode()).toEqual(['local', 'user']);

    const removeCmds = execSyncMock.mock.calls
      .map(([cmd]) => cmd as string)
      .filter((cmd) => cmd.includes('mcp remove'));
    expect(removeCmds).toEqual([
      'claude mcp remove mocka --scope local',
      'claude mcp remove mocka --scope project',
      'claude mcp remove mocka --scope user',
    ]);
  });

  it('reports nothing removed when the server is not registered', () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith('which ')) return '';
      throw new Error('No MCP server named "mocka"');
    });

    expect(uninstallClaudeCode()).toEqual([]);
  });

  it('throws instead of reporting success when the CLI is missing', () => {
    execSyncMock.mockImplementation(() => { throw new Error('not found'); });
    expect(() => uninstallClaudeCode()).toThrow(/Claude Code CLI not found/);
  });
});
