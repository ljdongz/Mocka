import { describe, it, expect, beforeEach } from 'vitest';

import { initDb, getDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { create, findAll, clearAll } from '../repositories/record.repo.js';
import type { RequestRecord } from '../models/request-record.js';

function makeRecord(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    id: 'rec-1',
    method: 'GET',
    path: '/api/users',
    statusCode: 200,
    bodyOrParams: '{"q":"1"}',
    requestHeaders: '{"accept":"application/json"}',
    responseBody: '{"ok":true}',
    timestamp: '2026-06-14T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * create() does NOT write the timestamp column (it relies on the DB default
 * datetime('now')). For deterministic ORDER BY timestamp DESC assertions we
 * insert the row first via create(), then stamp an explicit timestamp directly.
 */
function insertWithTimestamp(record: RequestRecord): void {
  create(record);
  getDb()
    .prepare('UPDATE request_records SET timestamp = ? WHERE id = ?')
    .run(record.timestamp, record.id);
}

describe('record.repo', () => {
  beforeEach(() => {
    initDb(':memory:');
    initSchema();
  });

  describe('create + findAll', () => {
    it('inserts a record and returns it with the right fields', () => {
      const rec = makeRecord();
      const returned = create(rec);

      // create() returns the same record it was given
      expect(returned).toBe(rec);

      const all = findAll();
      expect(all).toHaveLength(1);

      const row = all[0];
      expect(row.id).toBe('rec-1');
      expect(row.method).toBe('GET');
      expect(row.path).toBe('/api/users');
      expect(row.statusCode).toBe(200);
      expect(row.bodyOrParams).toBe('{"q":"1"}');
      expect(row.requestHeaders).toBe('{"accept":"application/json"}');
      expect(row.responseBody).toBe('{"ok":true}');
      // timestamp is populated by the DB default when create() runs
      expect(typeof row.timestamp).toBe('string');
      expect(row.timestamp.length).toBeGreaterThan(0);
    });

    it('does NOT expose a protocol property', () => {
      create(makeRecord());
      const row = findAll()[0];

      expect('protocol' in row).toBe(false);
      expect(row).not.toHaveProperty('protocol');
      // exact set of keys, no extras
      expect(Object.keys(row).sort()).toEqual(
        [
          'bodyOrParams',
          'id',
          'method',
          'path',
          'requestHeaders',
          'responseBody',
          'statusCode',
          'timestamp',
        ].sort(),
      );
    });

    it('persists distinct rows for distinct ids', () => {
      create(makeRecord({ id: 'a', path: '/a' }));
      create(makeRecord({ id: 'b', path: '/b' }));
      create(makeRecord({ id: 'c', path: '/c' }));

      const all = findAll();
      expect(all).toHaveLength(3);
      expect(all.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('findAll filtering', () => {
    beforeEach(() => {
      insertWithTimestamp(makeRecord({ id: 'g1', method: 'GET', path: '/api/users', timestamp: '2026-06-14T00:00:01.000Z' }));
      insertWithTimestamp(makeRecord({ id: 'p1', method: 'POST', path: '/api/users', timestamp: '2026-06-14T00:00:02.000Z' }));
      insertWithTimestamp(makeRecord({ id: 'g2', method: 'GET', path: '/api/orders', timestamp: '2026-06-14T00:00:03.000Z' }));
      insertWithTimestamp(makeRecord({ id: 'd1', method: 'DELETE', path: '/api/orders/42', timestamp: '2026-06-14T00:00:04.000Z' }));
    });

    it('filters by method', () => {
      const gets = findAll({ method: 'GET' });
      expect(gets.map((r) => r.id).sort()).toEqual(['g1', 'g2']);
      expect(gets.every((r) => r.method === 'GET')).toBe(true);

      const posts = findAll({ method: 'POST' });
      expect(posts.map((r) => r.id)).toEqual(['p1']);

      expect(findAll({ method: 'PATCH' })).toHaveLength(0);
    });

    it('filters by search using path LIKE substring', () => {
      const orders = findAll({ search: 'orders' });
      expect(orders.map((r) => r.id).sort()).toEqual(['d1', 'g2']);

      const users = findAll({ search: 'users' });
      expect(users.map((r) => r.id).sort()).toEqual(['g1', 'p1']);

      // partial substring still matches via LIKE %...%
      const partial = findAll({ search: 'api/ord' });
      expect(partial.map((r) => r.id).sort()).toEqual(['d1', 'g2']);

      expect(findAll({ search: 'nomatch' })).toHaveLength(0);
    });

    it('combines method and search filters (AND)', () => {
      const result = findAll({ method: 'GET', search: 'orders' });
      expect(result.map((r) => r.id)).toEqual(['g2']);

      // POST + orders has no match
      expect(findAll({ method: 'POST', search: 'orders' })).toHaveLength(0);
    });
  });

  describe('findAll ordering / limit / offset', () => {
    beforeEach(() => {
      // Insert in non-sorted order; timestamps define the expected DESC order.
      insertWithTimestamp(makeRecord({ id: 'r2', path: '/2', timestamp: '2026-06-14T00:00:02.000Z' }));
      insertWithTimestamp(makeRecord({ id: 'r4', path: '/4', timestamp: '2026-06-14T00:00:04.000Z' }));
      insertWithTimestamp(makeRecord({ id: 'r1', path: '/1', timestamp: '2026-06-14T00:00:01.000Z' }));
      insertWithTimestamp(makeRecord({ id: 'r3', path: '/3', timestamp: '2026-06-14T00:00:03.000Z' }));
    });

    it('orders by timestamp DESC', () => {
      const all = findAll();
      expect(all.map((r) => r.id)).toEqual(['r4', 'r3', 'r2', 'r1']);
    });

    it('respects limit', () => {
      const top2 = findAll({ limit: 2 });
      expect(top2.map((r) => r.id)).toEqual(['r4', 'r3']);
    });

    it('respects offset together with limit (DESC ordering preserved)', () => {
      const page2 = findAll({ limit: 2, offset: 2 });
      expect(page2.map((r) => r.id)).toEqual(['r2', 'r1']);
    });

    it('offset past the end returns empty', () => {
      expect(findAll({ limit: 10, offset: 10 })).toHaveLength(0);
    });
  });

  describe('clearAll', () => {
    it('empties the table', () => {
      create(makeRecord({ id: 'a' }));
      create(makeRecord({ id: 'b' }));
      expect(findAll()).toHaveLength(2);

      clearAll();
      expect(findAll()).toHaveLength(0);
    });

    it('is a no-op on an already empty table', () => {
      expect(findAll()).toHaveLength(0);
      clearAll();
      expect(findAll()).toHaveLength(0);
    });
  });
});
