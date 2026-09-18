import { afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Point the data directory at a throwaway location for the whole suite.
 * Tests that register media write real files; without this they would land in
 * the developer's own Mocka data directory — and deleting one would too.
 * Set before any module reads the path, which db/connection.ts does on import.
 */
const dataDir = mkdtempSync(join(tmpdir(), 'mocka-test-'));
process.env.MOCKA_DATA_DIR = dataDir;

/** Remove it afterwards, or a watch loop accumulates copies of every test video. */
afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});
