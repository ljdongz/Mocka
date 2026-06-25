import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, closeDb, getDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';

describe('dataset schema', () => {
  beforeEach(() => { initDb(':memory:'); initSchema(); });
  afterEach(() => { closeDb(); });

  it('creates a datasets table with the expected columns', () => {
    const cols = getDb().prepare("PRAGMA table_info(datasets)").all() as { name: string }[];
    const names = cols.map(c => c.name);
    expect(names).toEqual(expect.arrayContaining(['id', 'name', 'key_field', 'records', 'created_at', 'updated_at']));
  });

  it('adds a dataset_binding column to response_variants', () => {
    const cols = getDb().prepare("PRAGMA table_info(response_variants)").all() as { name: string }[];
    expect(cols.map(c => c.name)).toContain('dataset_binding');
  });
});
