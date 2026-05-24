import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
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
