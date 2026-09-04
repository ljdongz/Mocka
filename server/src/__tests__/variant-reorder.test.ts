import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID as uuid } from 'crypto';
import { initDb, closeDb, getDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as variantRepo from '../repositories/variant.repo.js';

function makeVariants(endpointId: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const id = uuid();
    variantRepo.create({
      id, endpointId, statusCode: 200, description: `v${i}`, body: '{}', headers: '{}',
      delay: null, memo: '', sortOrder: i, matchRules: null, variantGroup: 'standard',
      presetId: null, datasetBinding: null,
    });
    return id;
  });
}

describe('variant.repo reorderVariants', () => {
  let endpointId: string;
  beforeEach(() => {
    initDb(':memory:'); initSchema();
    endpointId = uuid();
    getDb().prepare("INSERT INTO endpoints (id, method, path, name) VALUES (?, 'GET', '/x', 'x')").run(endpointId);
  });
  afterEach(() => { closeDb(); });

  it('rewrites sort_order to match the given id order', () => {
    const ids = makeVariants(endpointId, 3);
    variantRepo.reorderVariants([ids[2], ids[0], ids[1]]);
    expect(variantRepo.findByEndpointId(endpointId).map(v => v.id)).toEqual([ids[2], ids[0], ids[1]]);
  });

  it('leaves variants outside the given list alone', () => {
    const ids = makeVariants(endpointId, 4);
    // Reorder only the first three; the fourth keeps sort_order 3 and stays last.
    variantRepo.reorderVariants([ids[1], ids[2], ids[0]]);
    expect(variantRepo.findByEndpointId(endpointId).map(v => v.id)).toEqual([ids[1], ids[2], ids[0], ids[3]]);
  });
});
