import { getDb } from './connection.js';

export function initSchema(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS endpoints (
      id TEXT PRIMARY KEY,
      method TEXT NOT NULL CHECK(method IN ('GET','POST','PUT','DELETE','PATCH')),
      path TEXT NOT NULL,
      active_variant_id TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      request_body_content_type TEXT DEFAULT 'application/json',
      request_body_raw TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(method, path)
    );

    CREATE TABLE IF NOT EXISTS response_variants (
      id TEXT PRIMARY KEY,
      endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
      status_code INTEGER NOT NULL DEFAULT 200,
      description TEXT NOT NULL DEFAULT 'Success',
      body TEXT NOT NULL DEFAULT '{}',
      headers TEXT NOT NULL DEFAULT '{}',
      delay REAL,
      memo TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS query_params (
      id TEXT PRIMARY KEY,
      endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
      key TEXT NOT NULL DEFAULT '',
      value TEXT NOT NULL DEFAULT '',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS request_headers (
      id TEXT PRIMARY KEY,
      endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
      key TEXT NOT NULL DEFAULT '',
      value TEXT NOT NULL DEFAULT '',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_expanded INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS collection_endpoints (
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (collection_id, endpoint_id)
    );

    CREATE TABLE IF NOT EXISTS request_records (
      id TEXT PRIMARY KEY,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      body_or_params TEXT NOT NULL DEFAULT '',
      request_headers TEXT NOT NULL DEFAULT '{}',
      response_body TEXT NOT NULL DEFAULT '',
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings VALUES ('port', '8080');
    INSERT OR IGNORE INTO settings VALUES ('response_delay', '0');
    INSERT OR IGNORE INTO settings VALUES ('auto_save_endpoints', 'true');
    INSERT OR IGNORE INTO settings VALUES ('history_toast', 'true');
  `);
}
