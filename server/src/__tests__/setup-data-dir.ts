import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Point the data directory at a throwaway location for the whole suite.
 * Tests that register media write real files; without this they would land in
 * the developer's own Mocka data directory — and deleting one would too.
 * Set before any module reads the path, which db/connection.ts does on import.
 */
process.env.MOCKA_DATA_DIR = mkdtempSync(join(tmpdir(), 'mocka-test-'));
