import { intro, outro, select, log, isCancel, cancel, spinner } from '@clack/prompts';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

type Client = 'claude-code' | 'codex' | 'gemini';

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

function installClaudeCode(scope: 'user' | 'project') {
  if (!which('claude')) {
    throw new Error('Claude Code CLI not found. Install it first: https://docs.anthropic.com/en/docs/claude-code');
  }
  const scopeFlag = scope === 'project' ? '--scope project' : '';
  execSync(`claude mcp add ${scopeFlag} mocka -- mocka mcp`.replace(/\s+/g, ' ').trim(), { stdio: 'inherit' });
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

function uninstallClaudeCode() {
  if (!which('claude')) return;
  try {
    execSync('claude mcp remove mocka', { stdio: 'inherit' });
  } catch { /* may not exist */ }
}

function uninstallCodex() {
  if (!which('codex')) return;
  try {
    execSync('codex mcp remove mocka', { stdio: 'inherit' });
  } catch { /* may not exist */ }
}

function uninstallGemini() {
  removeJsonConfig(getGeminiConfigPath(), 'mocka');
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

  let scope: 'user' | 'project' = 'user';

  if (client === 'claude-code') {
    const scopeChoice = await select<'user' | 'project'>({
      message: 'Select scope:',
      options: [
        { value: 'user', label: 'User', hint: 'available in all projects' },
        { value: 'project', label: 'Project', hint: 'current directory only' },
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

  try {
    switch (client) {
      case 'claude-code': uninstallClaudeCode(); break;
      case 'codex': uninstallCodex(); break;
      case 'gemini': uninstallGemini(); break;
    }
    s.stop('Removed successfully.');
  } catch {
    s.stop('Removal may have partially failed.');
  }

  outro('Mocka MCP has been removed.');
}
