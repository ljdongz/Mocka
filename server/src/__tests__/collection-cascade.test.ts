import { describe, it, expect, beforeEach } from 'vitest';

import { initDb, getDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as collectionService from '../services/collection.service.js';
import * as endpointService from '../services/endpoint.service.js';
import * as routeRegistry from '../services/route-registry.js';

function seedCollectionWithEndpoints(name: string, paths: string[]) {
  const collection = collectionService.create(name);
  const endpoints = paths.map(path =>
    endpointService.create({ method: 'GET', path, collectionId: collection.id }),
  );
  return { collection, endpoints };
}

describe('deleting a collection', () => {
  beforeEach(() => {
    initDb(':memory:');
    initSchema();
    routeRegistry.reload([]);
  });

  it('deletes the endpoints it holds', () => {
    const { collection } = seedCollectionWithEndpoints('Auth', ['/login', '/logout']);

    expect(collectionService.remove(collection.id)).toBe(true);

    expect(endpointService.getAll()).toHaveLength(0);
    expect(collectionService.getAll()).toHaveLength(0);
  });

  it('leaves endpoints outside the collection alone', () => {
    const { collection } = seedCollectionWithEndpoints('Auth', ['/login']);
    const loose = endpointService.create({ method: 'GET', path: '/ping' });

    collectionService.remove(collection.id);

    expect(endpointService.getAll().map(e => e.id)).toEqual([loose.id]);
  });

  it('unregisters the deleted endpoints from the mock route registry', () => {
    const { collection } = seedCollectionWithEndpoints('Users', ['/users', '/users/:id']);
    expect(routeRegistry.match('GET', '/users')).toBeDefined();
    expect(routeRegistry.match('GET', '/users/42')).toBeDefined();

    collectionService.remove(collection.id);

    expect(routeRegistry.match('GET', '/users')).toBeUndefined();
    expect(routeRegistry.match('GET', '/users/42')).toBeUndefined();
  });

  it('takes the endpoints\' variants with them', () => {
    const { collection, endpoints } = seedCollectionWithEndpoints('Auth', ['/login']);
    const variantCount = () =>
      (getDb()
        .prepare('SELECT COUNT(*) AS n FROM response_variants WHERE endpoint_id = ?')
        .get(endpoints[0].id) as { n: number }).n;
    expect(variantCount()).toBeGreaterThan(0);

    collectionService.remove(collection.id);

    expect(variantCount()).toBe(0);
  });

  it('is atomic: if the collection delete fails, its endpoints survive', () => {
    const { collection, endpoints } = seedCollectionWithEndpoints('Auth', ['/login', '/logout']);
    const db = getDb();
    const realPrepare = db.prepare.bind(db);
    // removeWithEndpoints deletes the endpoint rows first and the collection row
    // last, all inside one transaction. Blow up on that last statement: if the
    // transaction is real, the endpoint deletes roll back with it.
    (db as any).prepare = (sql: string) =>
      sql.startsWith('DELETE FROM collections')
        ? { run: () => { throw new Error('simulated failure'); } }
        : realPrepare(sql);

    try {
      expect(() => collectionService.remove(collection.id)).toThrow('simulated failure');
    } finally {
      (db as any).prepare = realPrepare;
    }

    expect(endpointService.getAll().map(e => e.id).sort()).toEqual(endpoints.map(e => e.id).sort());
    expect(collectionService.getAll()).toHaveLength(1);
  });

  it('returns false for an unknown collection', () => {
    expect(collectionService.remove('does-not-exist')).toBe(false);
  });
});
