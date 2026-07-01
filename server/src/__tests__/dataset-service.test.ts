import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../services/domain-events.js', () => ({ emit: vi.fn() }));

import { initDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { emit } from '../services/domain-events.js';
import * as datasetService from '../services/dataset.service.js';

describe('dataset.service', () => {
  beforeEach(() => { initDb(':memory:'); initSchema(); vi.clearAllMocks(); });
  afterEach(() => { closeDb(); });

  it('create() generates an id, defaults records to [], and emits dataset:created', () => {
    const ds = datasetService.create({ name: 'plans', keyField: 'idx' });
    expect(ds.id).toBeTruthy();
    expect(ds.records).toEqual([]);
    expect(emit).toHaveBeenCalledWith('dataset:created', expect.objectContaining({ name: 'plans' }));
  });

  it('update() emits dataset:updated when the dataset exists', () => {
    const ds = datasetService.create({ name: 'plans', keyField: 'idx' });
    vi.clearAllMocks();
    datasetService.update(ds.id, { name: 'renamed' });
    expect(emit).toHaveBeenCalledWith('dataset:updated', expect.objectContaining({ name: 'renamed' }));
  });

  it('remove() emits dataset:deleted only when something was deleted', () => {
    const ds = datasetService.create({ name: 'plans', keyField: 'idx' });
    vi.clearAllMocks();
    expect(datasetService.remove(ds.id)).toBe(true);
    expect(emit).toHaveBeenCalledWith('dataset:deleted', { id: ds.id });

    vi.clearAllMocks();
    expect(datasetService.remove('nope')).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });
});
