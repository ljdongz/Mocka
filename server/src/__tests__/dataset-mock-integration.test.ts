import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID as uuid } from 'crypto';
import { initDb, closeDb, getDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as datasetRepo from '../repositories/dataset.repo.js';
import * as endpointRepo from '../repositories/endpoint.repo.js';
import * as variantRepo from '../repositories/variant.repo.js';
import * as routeRegistry from '../services/route-registry.js';
import { handleMockRequest } from '../services/mock-handler.service.js';
import type { ResponseVariant } from '../models/response-variant.js';

function makeVariant(over: Partial<ResponseVariant> & { id: string; endpointId: string }): ResponseVariant {
  return {
    statusCode: 200, description: 'OK', body: '{}', headers: '{}', delay: null,
    memo: '', sortOrder: 0, matchRules: null, variantGroup: 'standard', presetId: null, datasetBinding: null,
    ...over,
  };
}

describe('handleMockRequest with dataset binding', () => {
  beforeEach(() => { initDb(':memory:'); initSchema(); routeRegistry.reload([]); });
  afterEach(() => { closeDb(); });

  function seed(binding: ResponseVariant['datasetBinding']) {
    const dataset = datasetRepo.create({
      id: uuid(), name: 'plans', keyField: 'idx',
      records: [{ idx: 1, title: 'alpha' }, { idx: 2, title: 'beta' }],
    });
    const endpointId = uuid();
    const variantId = uuid();
    // minimal endpoint row (raw insert keeps the test independent of endpoint-repo internals)
    const db = getDb();
    db.prepare("INSERT INTO endpoints (id, method, path, name, active_variant_id) VALUES (?, 'POST', '/detail', 'detail', ?)")
      .run(endpointId, variantId);
    variantRepo.create(makeVariant({
      id: variantId, endpointId,
      body: '{"errorCode":null,"data": {{$dataset}}}',
      datasetBinding: { ...binding!, datasetId: dataset.id },
    }));
    routeRegistry.reload(endpointRepo.findAll());
    return { endpointId, variantId };
  }

  it('detail mode returns the record matching the body key', async () => {
    seed({ datasetId: '', mode: 'detail', keySource: { from: 'body', field: 'idx' } });
    const res = await handleMockRequest('POST', '/detail', { idx: 2 }, {});
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ errorCode: null, data: { idx: 2, title: 'beta' } });
  });

  it('detail mode returns data:null when no record matches', async () => {
    seed({ datasetId: '', mode: 'detail', keySource: { from: 'body', field: 'idx' } });
    const res = await handleMockRequest('POST', '/detail', { idx: 99 }, {});
    expect(JSON.parse(res.body)).toEqual({ errorCode: null, data: null });
  });

  it('list mode returns the whole records array', async () => {
    seed({ datasetId: '', mode: 'list' });
    const res = await handleMockRequest('POST', '/detail', {}, {});
    expect(JSON.parse(res.body).data).toHaveLength(2);
  });
});
