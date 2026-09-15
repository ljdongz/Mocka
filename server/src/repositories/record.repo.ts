import { getDb } from '../db/connection.js';
import type { RequestRecord } from '../models/request-record.js';

/** Upper bound on retained history rows to keep the DB from growing unbounded. */
const MAX_HISTORY_RECORDS = 5000;

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
    protocol: row.protocol ?? 'http',
    direction: row.direction ?? null,
    sessionId: row.session_id ?? null,
  };
}

export interface RecordQuery {
  method?: string;
  search?: string;
  protocol?: string;
  limit?: number;
  offset?: number;
}

export function findAll(opts: RecordQuery = {}): RequestRecord[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts.method) {
    conditions.push('method = ?');
    params.push(opts.method);
  }
  if (opts.protocol) {
    conditions.push('protocol = ?');
    params.push(opts.protocol);
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
    INSERT INTO request_records (id, method, path, status_code, body_or_params, request_headers, response_body, protocol, direction, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(record.id, record.method, record.path, record.statusCode, record.bodyOrParams, record.requestHeaders, record.responseBody,
    record.protocol ?? 'http', record.direction ?? null, record.sessionId ?? null);

  // Periodically prune to bound history growth (~1% of inserts; cheap, keeps the cap soft).
  if (Math.random() < 0.01) {
    db.prepare(`
      DELETE FROM request_records
      WHERE id NOT IN (SELECT id FROM request_records ORDER BY timestamp DESC LIMIT ?)
    `).run(MAX_HISTORY_RECORDS);
  }

  return record;
}

export function clearAll(): void {
  const db = getDb();
  db.prepare('DELETE FROM request_records').run();
}
