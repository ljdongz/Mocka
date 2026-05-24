#!/usr/bin/env node

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveDataDir } from './utils/paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolveDataDir();
const PID_FILE = join(DATA_DIR, 'mocka.pid');

const command = process.argv[2];
const flags = process.argv.slice(3);

function readPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
  if (isNaN(pid)) return null;
  return pid;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function start() {
  const isDetachedChild = process.env.MOCKA_DETACHED === '1';

  if (!isDetachedChild) {
    const existingPid = readPid();
    if (existingPid && isProcessAlive(existingPid)) {
      console.log(`Mocka is already running (PID ${existingPid})`);
      process.exit(0);
    }
  }

  if (!isDetachedChild && (flags.includes('-d') || flags.includes('--detach'))) {
    mkdirSync(DATA_DIR, { recursive: true });

    const child = spawn(process.execPath, [join(__dirname, 'cli.js'), 'start'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, MOCKA_DETACHED: '1' },
    });

    if (child.pid) {
      console.log(`Mocka started in background (PID ${child.pid})`);
    }

    child.unref();
    return;
  }

  // Foreground — write PID for status/stop, then run server
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));
  await import('./index.js');
}

function stop() {
  const pid = readPid();
  if (!pid) {
    console.log('Mocka is not running (no PID file found)');
    process.exit(1);
  }

  if (!isProcessAlive(pid)) {
    console.log(`Mocka is not running (stale PID ${pid})`);
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
    process.exit(1);
  }

  process.kill(pid, 'SIGTERM');
  console.log(`Mocka stopped (PID ${pid})`);

  setTimeout(() => {
    if (existsSync(PID_FILE)) {
      try { unlinkSync(PID_FILE); } catch { /* ignore */ }
    }
  }, 1000);
}

function status() {
  const pid = readPid();
  if (!pid || !isProcessAlive(pid)) {
    console.log('Mocka is not running');
    process.exit(1);
  }

  console.log(`Mocka is running (PID ${pid})`);
}

switch (command) {
  case 'start':
    await start();
    break;
  case 'stop':
    stop();
    break;
  case 'status':
    status();
    break;
  case 'mcp': {
    const subCommand = process.argv[3];
    if (subCommand === 'install') {
      const { runInstall } = await import('./mcp/install.js');
      await runInstall();
    } else if (subCommand === 'uninstall') {
      const { runUninstall } = await import('./mcp/install.js');
      await runUninstall();
    } else {
      const { startMcpServer } = await import('./mcp/server.js');
      await startMcpServer();
    }
    break;
  }
  default:
    console.log('Usage: mocka <command>');
    console.log('');
    console.log('Commands:');
    console.log('  start           Start Mocka (foreground)');
    console.log('  start -d        Start Mocka in the background');
    console.log('  stop            Stop the running Mocka instance');
    console.log('  status          Show whether Mocka is running');
    console.log('  mcp             Start the MCP server (stdio)');
    console.log('  mcp install     Register Mocka MCP with an AI client');
    console.log('  mcp uninstall   Remove Mocka MCP from an AI client');
    process.exit(command === undefined ? 0 : 1);
}
