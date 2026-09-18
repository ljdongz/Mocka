import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { homedir, platform } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedDataDir: string | undefined;

export function resolveDataDir(): string {
  if (cachedDataDir) return cachedDataDir;

  // 1. MOCKA_DATA_DIR env var (brew formula sets this)
  if (process.env.MOCKA_DATA_DIR) {
    cachedDataDir = process.env.MOCKA_DATA_DIR;
    return cachedDataDir;
  }

  // 2. Existing relative path — dev environment compatibility
  const devDataDir = join(__dirname, '..', '..', 'data');
  if (existsSync(devDataDir)) {
    cachedDataDir = devDataDir;
    return cachedDataDir;
  }

  // 3. Platform default
  if (platform() === 'darwin') {
    cachedDataDir = join(homedir(), 'Library', 'Application Support', 'Mocka');
  } else {
    const xdgData = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
    cachedDataDir = join(xdgData, 'mocka');
  }

  return cachedDataDir;
}

/**
 * Directory holding registered media files, created if missing.
 * The mock server serves this directory statically, and static registration
 * fails on a missing root — so creating it here keeps boot order from mattering.
 */
export function resolveMediaDir(): string {
  const dir = join(resolveDataDir(), 'media');
  mkdirSync(dir, { recursive: true });
  return dir;
}
