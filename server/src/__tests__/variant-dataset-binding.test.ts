import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID as uuid } from 'crypto';
import { initDb, closeDb, getDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as variantRepo from '../repositories/variant.repo.js';
import type { ResponseVariant } from '../models/response-variant.js';

function makeVariant(over: Partial<ResponseVariant> & { id: string; endpointId: string }): ResponseVariant {
  return {
    statusCode: 200, description: 'OK', body: '{}', headers: '{}', delay: null,
    memo: '', sortOrder: 0, matchRules: null, variantGroup: 'standard', presetId: null,
    datasetBinding: null,
    ...over,
  };
}

describe('variant.repo dataset_binding', () => {
  let endpointId: string;
  beforeEach(() => {
    initDb(':memory:'); initSchema();
    endpointId = uuid();
    // FK requires an endpoints row to exist
    getDb().prepare("INSERT INTO endpoints (id, method, path, name) VALUES (?, 'GET', '/x', 'x')").run(endpointId);
  });
  afterEach(() => { closeDb(); });

  it('round-trips a datasetBinding object', () => {
    const id = uuid();
    variantRepo.create(makeVariant({
      id, endpointId,
      datasetBinding: { datasetId: 'd1', mode: 'detail', keySource: { from: 'body', field: 'idx' } },
    }));
    expect(variantRepo.findById(id)!.datasetBinding).toEqual({
      datasetId: 'd1', mode: 'detail', keySource: { from: 'body', field: 'idx' },
    });
  });

  it('defaults datasetBinding to null and can be updated', () => {
    const id = uuid();
    variantRepo.create(makeVariant({ id, endpointId }));
    expect(variantRepo.findById(id)!.datasetBinding).toBeNull();

    variantRepo.update(id, { datasetBinding: { datasetId: 'd2', mode: 'list' } });
    expect(variantRepo.findById(id)!.datasetBinding).toEqual({ datasetId: 'd2', mode: 'list' });
  });
});
