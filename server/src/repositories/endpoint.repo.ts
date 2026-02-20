import { getDb } from '../db/connection.js';
import type { Endpoint, QueryParam, RequestHeader } from '../models/endpoint.js';
import type { ResponseVariant } from '../models/response-variant.js';

function rowToEndpoint(row: any): Endpoint {
  return {
    id: row.id,
    method: row.method,
    path: row.path,
    activeVariantId: row.active_variant_id,
    isEnabled: !!row.is_enabled,
    requestBodyContentType: row.request_body_content_type,
    requestBodyRaw: row.request_body_raw,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToParam(row: any): QueryParam {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    key: row.key,
    value: row.value,
    isEnabled: !!row.is_enabled,
    sortOrder: row.sort_order,
  };
}

function rowToHeader(row: any): RequestHeader {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    key: row.key,
    value: row.value,
    isEnabled: !!row.is_enabled,
    sortOrder: row.sort_order,
  };
}

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

export function findAll(): Endpoint[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM endpoints ORDER BY created_at ASC').all();
  return rows.map((row: any) => {
    const ep = rowToEndpoint(row);
    ep.queryParams = db.prepare('SELECT * FROM query_params WHERE endpoint_id = ? ORDER BY sort_order').all(ep.id).map(rowToParam);
    ep.requestHeaders = db.prepare('SELECT * FROM request_headers WHERE endpoint_id = ? ORDER BY sort_order').all(ep.id).map(rowToHeader);
    ep.responseVariants = db.prepare('SELECT * FROM response_variants WHERE endpoint_id = ? ORDER BY sort_order').all(ep.id).map(rowToVariant);
    return ep;
  });
}

export function findById(id: string): Endpoint | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM endpoints WHERE id = ?').get(id) as any;
  if (!row) return null;
  const ep = rowToEndpoint(row);
  ep.queryParams = db.prepare('SELECT * FROM query_params WHERE endpoint_id = ? ORDER BY sort_order').all(id).map(rowToParam);
  ep.requestHeaders = db.prepare('SELECT * FROM request_headers WHERE endpoint_id = ? ORDER BY sort_order').all(id).map(rowToHeader);
  ep.responseVariants = db.prepare('SELECT * FROM response_variants WHERE endpoint_id = ? ORDER BY sort_order').all(id).map(rowToVariant);
  return ep;
}

export function create(ep: Endpoint): Endpoint {
  const db = getDb();
  db.prepare(`
    INSERT INTO endpoints (id, method, path, active_variant_id, is_enabled, request_body_content_type, request_body_raw)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(ep.id, ep.method, ep.path, ep.activeVariantId, ep.isEnabled ? 1 : 0, ep.requestBodyContentType, ep.requestBodyRaw);
  return findById(ep.id)!;
}

export function update(id: string, data: Partial<Endpoint>): Endpoint | null {
  const db = getDb();
  const existing = findById(id);
  if (!existing) return null;

  const method = data.method ?? existing.method;
  const path = data.path ?? existing.path;
  const activeVariantId = data.activeVariantId !== undefined ? data.activeVariantId : existing.activeVariantId;
  const isEnabled = data.isEnabled !== undefined ? data.isEnabled : existing.isEnabled;
  const contentType = data.requestBodyContentType ?? existing.requestBodyContentType;
  const bodyRaw = data.requestBodyRaw ?? existing.requestBodyRaw;

  db.prepare(`
    UPDATE endpoints SET method=?, path=?, active_variant_id=?, is_enabled=?,
    request_body_content_type=?, request_body_raw=?, updated_at=datetime('now')
    WHERE id=?
  `).run(method, path, activeVariantId, isEnabled ? 1 : 0, contentType, bodyRaw, id);

  // Sync query params
  if (data.queryParams) {
    db.prepare('DELETE FROM query_params WHERE endpoint_id = ?').run(id);
    const ins = db.prepare('INSERT INTO query_params (id, endpoint_id, key, value, is_enabled, sort_order) VALUES (?,?,?,?,?,?)');
    for (const p of data.queryParams) {
      ins.run(p.id, id, p.key, p.value, p.isEnabled ? 1 : 0, p.sortOrder);
    }
  }

  // Sync request headers
  if (data.requestHeaders) {
    db.prepare('DELETE FROM request_headers WHERE endpoint_id = ?').run(id);
    const ins = db.prepare('INSERT INTO request_headers (id, endpoint_id, key, value, is_enabled, sort_order) VALUES (?,?,?,?,?,?)');
    for (const h of data.requestHeaders) {
      ins.run(h.id, id, h.key, h.value, h.isEnabled ? 1 : 0, h.sortOrder);
    }
  }

  return findById(id);
}

export function remove(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM endpoints WHERE id = ?').run(id);
  return result.changes > 0;
}

export function toggleEnabled(id: string): Endpoint | null {
  const db = getDb();
  db.prepare('UPDATE endpoints SET is_enabled = NOT is_enabled, updated_at = datetime(\'now\') WHERE id = ?').run(id);
  return findById(id);
}

export function setActiveVariant(id: string, variantId: string | null): Endpoint | null {
  const db = getDb();
  db.prepare('UPDATE endpoints SET active_variant_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(variantId, id);
  return findById(id);
}

export function findByMethodAndPath(method: string, path: string): Endpoint | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM endpoints WHERE method = ? AND path = ?').get(method, path) as any;
  if (!row) return null;
  const ep = rowToEndpoint(row);
  ep.responseVariants = db.prepare('SELECT * FROM response_variants WHERE endpoint_id = ? ORDER BY sort_order').all(ep.id).map(rowToVariant);
  return ep;
}
