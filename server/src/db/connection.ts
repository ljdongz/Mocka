import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '..', '..', 'data');
const DB_PATH = join(DB_DIR, 'mocka.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
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
