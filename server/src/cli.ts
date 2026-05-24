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
  const existingPid = readPid();
  if (existingPid && isProcessAlive(existingPid)) {
    console.log(`Mocka is already running (PID ${existingPid})`);
    process.exit(0);
  }

  mkdirSync(DATA_DIR, { recursive: true });

  const child = spawn(process.execPath, [join(__dirname, 'cli.js')], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });

  if (child.pid) {
    writeFileSync(PID_FILE, String(child.pid));
    console.log(`Mocka started (PID ${child.pid})`);

    const adminPort = process.env.ADMIN_PORT || '3000';
    const mockPort = process.env.MOCK_PORT || '8080';
    console.log(`  Admin UI:    http://localhost:${adminPort}`);
    console.log(`  Mock Server: http://localhost:${mockPort}`);
  }

  child.unref();
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

  // Wait briefly for PID file cleanup by the server's shutdown handler
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

  const adminPort = process.env.ADMIN_PORT || '3000';
  const mockPort = process.env.MOCK_PORT || '8080';
  console.log(`Mocka is running (PID ${pid})`);
  console.log(`  Admin UI:    http://localhost:${adminPort}`);
  console.log(`  Mock Server: http://localhost:${mockPort}`);
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
  case undefined:
    // Foreground mode — used by brew services and direct invocation
    await import('./index.js');
    break;
  default:
    console.log(`Usage: mocka [start|stop|status]`);
    console.log('');
    console.log('Commands:');
    console.log('  start    Start Mocka in the background');
    console.log('  stop     Stop the running Mocka instance');
    console.log('  status   Show whether Mocka is running');
    console.log('');
    console.log('Run without arguments to start in the foreground.');
    process.exit(1);
}
