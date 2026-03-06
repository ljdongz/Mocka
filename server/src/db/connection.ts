import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '..', '..', 'data');
const DB_PATH = join(DB_DIR, 'mocka.db');

let db: Database.Database;

/** Initialize the database with an optional custom path (e.g. ':memory:' for tests) */
export function initDb(path?: string): Database.Database {
  if (db) {
    try { db.close(); } catch { /* ignore */ }
  }
  if (path && path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  if (!path) {
    mkdirSync(DB_DIR, { recursive: true });
  }
  db = new Database(path ?? DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    return initDb();
  }
  return db;
}

/** Run a callback inside a database transaction */
export function withTransaction<T>(fn: () => T): T {
  const db = getDb();
  const txn = db.transaction(fn);
  return txn();
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
