import { getDb } from '../db/connection.js';
import type { ResponseVariant } from '../models/response-variant.js';

function rowToVariant(row: any): ResponseVariant {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    statusCode: row.status_code,
    description: row.description,
    body: row.body,
    headers: row.headers,
    delay: row.delay,
    memo: row.memo,
    sortOrder: row.sort_order,
  };
}

export function findByEndpointId(endpointId: string): ResponseVariant[] {
  const db = getDb();
  return db.prepare('SELECT * FROM response_variants WHERE endpoint_id = ? ORDER BY sort_order').all(endpointId).map(rowToVariant);
}

export function findById(id: string): ResponseVariant | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM response_variants WHERE id = ?').get(id) as any;
  return row ? rowToVariant(row) : null;
}

export function create(v: ResponseVariant): ResponseVariant {
  const db = getDb();
  db.prepare(`
    INSERT INTO response_variants (id, endpoint_id, status_code, description, body, headers, delay, memo, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(v.id, v.endpointId, v.statusCode, v.description, v.body, v.headers, v.delay, v.memo, v.sortOrder);
  return findById(v.id)!;
}

export function update(id: string, data: Partial<ResponseVariant>): ResponseVariant | null {
  const db = getDb();
  const existing = findById(id);
  if (!existing) return null;

  db.prepare(`
    UPDATE response_variants SET status_code=?, description=?, body=?, headers=?, delay=?, memo=?, sort_order=?
    WHERE id=?
  `).run(
    data.statusCode ?? existing.statusCode,
    data.description ?? existing.description,
    data.body ?? existing.body,
    data.headers ?? existing.headers,
    data.delay !== undefined ? data.delay : existing.delay,
    data.memo ?? existing.memo,
    data.sortOrder ?? existing.sortOrder,
    id,
  );
  return findById(id);
}

export function remove(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM response_variants WHERE id = ?').run(id);
  return result.changes > 0;
}
