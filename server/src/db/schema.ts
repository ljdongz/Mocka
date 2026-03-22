import { getDb } from './connection.js';

export function initSchema(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS endpoints (
      id TEXT PRIMARY KEY,
      method TEXT NOT NULL CHECK(method IN ('GET','POST','PUT','DELETE','PATCH')),
      path TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
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
      sort_order INTEGER NOT NULL DEFAULT 0,
      match_rules TEXT
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
      protocol TEXT NOT NULL DEFAULT 'http',
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL DEFAULT 0,
      body_or_params TEXT NOT NULL DEFAULT '',
      request_headers TEXT NOT NULL DEFAULT '{}',
      response_body TEXT NOT NULL DEFAULT '',
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ws_endpoints (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      active_frame_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ws_response_frames (
      id TEXT PRIMARY KEY,
      ws_endpoint_id TEXT NOT NULL REFERENCES ws_endpoints(id) ON DELETE CASCADE,
      trigger TEXT NOT NULL DEFAULT 'message' CHECK(trigger IN ('message','connect')),
      label TEXT NOT NULL DEFAULT 'Response',
      message_body TEXT NOT NULL DEFAULT '',
      delay REAL,
      interval_min REAL,
      interval_max REAL,
      memo TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      match_rules TEXT
    );

    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      variables TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings VALUES ('port', '8080');
    INSERT OR IGNORE INTO settings VALUES ('response_delay', '0');
    INSERT OR IGNORE INTO settings VALUES ('auto_save_endpoints', 'true');
    INSERT OR IGNORE INTO settings VALUES ('history_toast', 'true');
    INSERT OR IGNORE INTO settings VALUES ('theme', 'dark');
  `);

  // Migration: add protocol column to request_records if missing (for existing databases)
  const recordCols = db.prepare("PRAGMA table_info(request_records)").all() as { name: string }[];
  if (!recordCols.some(c => c.name === 'protocol')) {
    db.exec("ALTER TABLE request_records ADD COLUMN protocol TEXT NOT NULL DEFAULT 'http'");
  }

  // Migration: add trigger column to ws_response_frames if missing (for existing databases)
  const frameCols = db.prepare("PRAGMA table_info(ws_response_frames)").all() as { name: string }[];
  if (frameCols.length > 0 && !frameCols.some(c => c.name === 'trigger')) {
    db.exec("ALTER TABLE ws_response_frames ADD COLUMN trigger TEXT NOT NULL DEFAULT 'message'");
  }

  // Migration: add interval_min/interval_max columns to ws_response_frames if missing
  const frameCols2 = db.prepare("PRAGMA table_info(ws_response_frames)").all() as { name: string }[];
  if (frameCols2.length > 0 && !frameCols2.some(c => c.name === 'interval_min')) {
    db.exec("ALTER TABLE ws_response_frames ADD COLUMN interval_min REAL");
    db.exec("ALTER TABLE ws_response_frames ADD COLUMN interval_max REAL");
  }

  // Migration: add match_rules column if missing (for existing databases)
  const variantCols = db.prepare("PRAGMA table_info(response_variants)").all() as { name: string }[];
  if (!variantCols.some(c => c.name === 'match_rules')) {
    db.exec("ALTER TABLE response_variants ADD COLUMN match_rules TEXT");
  }

  // Migration: add name column if missing (for existing databases)
  const endpointCols = db.prepare("PRAGMA table_info(endpoints)").all() as { name: string }[];
  if (!endpointCols.some(c => c.name === 'name')) {
    db.exec("ALTER TABLE endpoints ADD COLUMN name TEXT NOT NULL DEFAULT ''");
  }

  // Migration: normalize trailing slashes in existing endpoint paths
  const trailingSlashRows = db.prepare(
    "SELECT id, method, path, created_at FROM endpoints WHERE length(path) > 1 AND path LIKE '%/'"
  ).all() as { id: string; method: string; path: string; created_at: string }[];

  if (trailingSlashRows.length > 0) {
    console.log(`[Mocka] Normalizing ${trailingSlashRows.length} endpoint path(s) with trailing slashes...`);

    for (const ep of trailingSlashRows) {
      const normalized = ep.path.replace(/\/+$/, '');

      // Check for UNIQUE conflict: does the normalized path already exist for the same method?
      const conflict = db.prepare(
        "SELECT id, created_at FROM endpoints WHERE method = ? AND path = ? AND id != ?"
      ).get(ep.method, normalized, ep.id) as { id: string; created_at: string } | undefined;

      if (conflict) {
        // Merge strategy: keep earlier endpoint, move variants & collection links from later one
        const keepId = conflict.created_at <= ep.created_at ? conflict.id : ep.id;
        const removeId = keepId === conflict.id ? ep.id : conflict.id;

        console.log(`[Mocka]   Merging duplicate ${ep.method} ${normalized}: keeping ${keepId}, merging from ${removeId}`);

        // Move response variants from removeId to keepId
        db.prepare("UPDATE response_variants SET endpoint_id = ? WHERE endpoint_id = ?").run(keepId, removeId);

        // Relink collection_endpoints from removeId to keepId (skip if already linked)
        const orphanedLinks = db.prepare(
          "SELECT collection_id, sort_order FROM collection_endpoints WHERE endpoint_id = ?"
        ).all(removeId) as { collection_id: string; sort_order: number }[];

        for (const link of orphanedLinks) {
          const alreadyLinked = db.prepare(
            "SELECT 1 FROM collection_endpoints WHERE collection_id = ? AND endpoint_id = ?"
          ).get(link.collection_id, keepId);
          if (!alreadyLinked) {
            db.prepare(
              "INSERT INTO collection_endpoints (collection_id, endpoint_id, sort_order) VALUES (?, ?, ?)"
            ).run(link.collection_id, keepId, link.sort_order);
          }
        }

        // Delete orphaned collection links and the duplicate endpoint
        db.prepare("DELETE FROM collection_endpoints WHERE endpoint_id = ?").run(removeId);
        db.prepare("DELETE FROM query_params WHERE endpoint_id = ?").run(removeId);
        db.prepare("DELETE FROM request_headers WHERE endpoint_id = ?").run(removeId);
        db.prepare("DELETE FROM endpoints WHERE id = ?").run(removeId);

        // Ensure the kept endpoint has the normalized path
        if (keepId === ep.id) {
          db.prepare("UPDATE endpoints SET path = ? WHERE id = ?").run(normalized, keepId);
        }
      } else {
        // No conflict: simply normalize
        db.prepare("UPDATE endpoints SET path = ? WHERE id = ?").run(normalized, ep.id);
      }
    }

    console.log(`[Mocka] Path normalization complete.`);
  }
}
