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

/** Directory holding registered media files. Computing the path creates nothing. */
export function resolveMediaDir(): string {
  return join(resolveDataDir(), 'media');
}

/**
 * The media directory, created if missing. Only the two callers that need it to
 * exist pay for the syscall — the mock server, whose static registration fails on
 * a missing root, and the service, before it writes a file. Asking for the path
 * of a file about to be deleted should not create a directory on a slow mount.
 */
export function ensureMediaDir(): string {
  const dir = resolveMediaDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}
