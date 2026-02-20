import { getDb } from '../db/connection.js';
import type { RequestRecord } from '../models/request-record.js';

function rowToRecord(row: any): RequestRecord {
  return {
    id: row.id,
    method: row.method,
    path: row.path,
    statusCode: row.status_code,
    bodyOrParams: row.body_or_params,
    requestHeaders: row.request_headers,
    responseBody: row.response_body,
    timestamp: row.timestamp,
  };
}

export function findAll(opts: { method?: string; search?: string; limit?: number; offset?: number } = {}): RequestRecord[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts.method) {
    conditions.push('method = ?');
    params.push(opts.method);
  }
  if (opts.search) {
    conditions.push('path LIKE ?');
    params.push(`%${opts.search}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;

  return db.prepare(`SELECT * FROM request_records ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset)
    .map(rowToRecord);
}

export function create(record: RequestRecord): RequestRecord {
  const db = getDb();
  db.prepare(`
    INSERT INTO request_records (id, method, path, status_code, body_or_params, request_headers, response_body)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(record.id, record.method, record.path, record.statusCode, record.bodyOrParams, record.requestHeaders, record.responseBody);
  return record;
}

export function clearAll(): void {
  const db = getDb();
  db.prepare('DELETE FROM request_records').run();
}
