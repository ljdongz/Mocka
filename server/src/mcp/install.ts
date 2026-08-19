import { intro, outro, select, log, isCancel, cancel, spinner } from '@clack/prompts';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

type Client = 'claude-code' | 'codex' | 'gemini';
type Scope = 'user' | 'project' | 'local';

const MCP_SERVER_CONFIG = { command: 'mocka', args: ['mcp'] };

function which(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function mergeJsonConfig(filePath: string, serverName: string, config: object) {
  let data: any = {};
  if (existsSync(filePath)) {
    try {
      data = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      data = {};
    }
  } else {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    mkdirSync(dir, { recursive: true });
  }
  if (!data.mcpServers) data.mcpServers = {};
  data.mcpServers[serverName] = config;
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function removeJsonConfig(filePath: string, serverName: string): boolean {
  if (!existsSync(filePath)) return false;
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (!data.mcpServers?.[serverName]) return false;
    delete data.mcpServers[serverName];
    writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    return true;
  } catch {
    return false;
  }
}

function getGeminiConfigPath(): string {
  return join(homedir(), '.gemini', 'settings.json');
}

function installClaudeCode(scope: Scope) {
  if (!which('claude')) {
    throw new Error('Claude Code CLI not found. Install it first: https://docs.anthropic.com/en/docs/claude-code');
  }
  execSync(`claude mcp add --scope ${scope} mocka -- mocka mcp`, { stdio: 'inherit' });
}

function installCodex() {
  if (!which('codex')) {
    throw new Error('Codex CLI not found. Install it first: npm install -g @openai/codex');
  }
  execSync('codex mcp add mocka -- mocka mcp', { stdio: 'inherit' });
}

function installGemini() {
  const configPath = getGeminiConfigPath();
  mergeJsonConfig(configPath, 'mocka', MCP_SERVER_CONFIG);
}

// `claude mcp remove` without --scope refuses when the server exists in more
// than one scope, so remove from each scope explicitly.
const CLAUDE_SCOPES: Scope[] = ['local', 'project', 'user'];

export function uninstallClaudeCode(): string[] {
  if (!which('claude')) {
    throw new Error('Claude Code CLI not found. Nothing was removed.');
  }
  const removed: string[] = [];
  for (const scope of CLAUDE_SCOPES) {
    try {
      execSync(`claude mcp remove mocka --scope ${scope}`, { stdio: 'pipe' });
      removed.push(scope);
    } catch { /* not registered in this scope */ }
  }
  return removed;
}

// Codex and Gemini have no scopes, so they report a single unnamed location.
function uninstallCodex(): string[] {
  if (!which('codex')) {
    throw new Error('Codex CLI not found. Nothing was removed.');
  }
  try {
    execSync('codex mcp remove mocka', { stdio: 'pipe' });
    return [''];
  } catch {
    return [];
  }
}

function uninstallGemini(): string[] {
  return removeJsonConfig(getGeminiConfigPath(), 'mocka') ? [''] : [];
}

export async function runInstall() {
  intro('Mocka MCP Installer');

  const client = await select<Client>({
    message: 'Select an AI client:',
    options: [
      { value: 'claude-code', label: 'Claude Code' },
      { value: 'codex', label: 'Codex CLI' },
      { value: 'gemini', label: 'Gemini CLI' },
    ],
  });
  if (isCancel(client)) { cancel('Installation cancelled.'); process.exit(0); }

  let scope: Scope = 'user';

  if (client === 'claude-code') {
    const scopeChoice = await select<Scope>({
      message: 'Select scope:',
      options: [
        { value: 'user', label: 'User', hint: 'available in all projects' },
        { value: 'project', label: 'Project', hint: 'shared via .mcp.json in current directory' },
        { value: 'local', label: 'Local', hint: 'current directory only, private to you' },
      ],
    });
    if (isCancel(scopeChoice)) { cancel('Installation cancelled.'); process.exit(0); }
    scope = scopeChoice;
  } else if (client === 'gemini') {
    log.info('Gemini CLI only supports user scope.');
  }

  const s = spinner();
  s.start('Registering Mocka MCP...');

  try {
    switch (client) {
      case 'claude-code': installClaudeCode(scope); break;
      case 'codex': installCodex(); break;
      case 'gemini': installGemini(); break;
    }
    s.stop('Registered successfully.');
  } catch (e: any) {
    s.stop('Registration failed.');
    log.error(e.message);
    process.exit(1);
  }

  outro('Start the server with `mocka start` to begin.');
}

export async function runUninstall() {
  intro('Mocka MCP Uninstaller');

  const client = await select<Client>({
    message: 'Select an AI client to remove Mocka MCP from:',
    options: [
      { value: 'claude-code', label: 'Claude Code' },
      { value: 'codex', label: 'Codex CLI' },
      { value: 'gemini', label: 'Gemini CLI' },
    ],
  });
  if (isCancel(client)) { cancel('Uninstall cancelled.'); process.exit(0); }

  const s = spinner();
  s.start('Removing Mocka MCP...');

  let removed: string[] = [];
  try {
    switch (client) {
      case 'claude-code': removed = uninstallClaudeCode(); break;
      case 'codex': removed = uninstallCodex(); break;
      case 'gemini': removed = uninstallGemini(); break;
    }
  } catch (e: any) {
    s.stop('Removal failed.');
    log.error(e.message);
    process.exit(1);
  }

  if (removed.length === 0) {
    s.stop('Nothing to remove.');
    log.warn('Mocka MCP was not registered for this client.');
    if (client === 'claude-code') {
      log.info('Local and project scopes are per-directory. Run this from the project directory that registered Mocka.');
    }
    outro('No changes made.');
    return;
  }

  if (client === 'claude-code') {
    s.stop(`Removed from scopes: ${removed.join(', ')}.`);
    log.info('Local and project scopes only cover the current directory. Re-run elsewhere if Mocka is registered in other projects.');
  } else {
    s.stop('Removed successfully.');
  }
  outro('Mocka MCP has been removed.');
}
