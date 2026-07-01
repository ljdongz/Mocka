import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID as uuid } from 'crypto';
import { initDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as datasetRepo from '../repositories/dataset.repo.js';

describe('dataset.repo', () => {
  beforeEach(() => { initDb(':memory:'); initSchema(); });
  afterEach(() => { closeDb(); });

  it('create() round-trips records as JSON and populates timestamps', () => {
    const id = uuid();
    const ds = datasetRepo.create({ id, name: 'plans', keyField: 'idx', records: [{ idx: 1 }, { idx: 2 }] });
    expect(ds.id).toBe(id);
    expect(ds.keyField).toBe('idx');
    expect(ds.records).toEqual([{ idx: 1 }, { idx: 2 }]);
    expect(ds.createdAt).toBeTruthy();
  });

  it('findById() returns null for unknown id', () => {
    expect(datasetRepo.findById('nope')).toBeNull();
  });

  it('update() coalesces unspecified fields and replaces records', () => {
    const id = uuid();
    datasetRepo.create({ id, name: 'plans', keyField: 'idx', records: [{ idx: 1 }] });
    const updated = datasetRepo.update(id, { records: [{ idx: 9 }] });
    expect(updated!.name).toBe('plans');
    expect(updated!.records).toEqual([{ idx: 9 }]);
  });

  it('remove() deletes and reports success', () => {
    const id = uuid();
    datasetRepo.create({ id, name: 'x', keyField: 'id', records: [] });
    expect(datasetRepo.remove(id)).toBe(true);
    expect(datasetRepo.findById(id)).toBeNull();
    expect(datasetRepo.remove(id)).toBe(false);
  });

  it('findAll() returns all datasets ordered by created_at', () => {
    datasetRepo.create({ id: uuid(), name: 'a', keyField: 'id', records: [] });
    datasetRepo.create({ id: uuid(), name: 'b', keyField: 'id', records: [] });
    expect(datasetRepo.findAll()).toHaveLength(2);
  });
});
