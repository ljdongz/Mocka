import { getDb } from '../db/connection.js';
import type { Media } from '../models/media.js';

export function rowToMedia(row: any): Media {
  return {
    id: row.id,
    name: row.name,
    fileName: row.file_name,
    mimeType: row.mime_type,
    size: row.size,
    originalName: row.original_name,
    createdAt: row.created_at,
  };
}

export function findAll(): Media[] {
  const db = getDb();
  // created_at is datetime('now') — whole seconds, so a batch upload writes
  // several rows with the same value. rowid breaks the tie in insertion order,
  // which is what "the one I just added" means to a caller reading this list.
  return db.prepare('SELECT * FROM media ORDER BY created_at, rowid').all().map(rowToMedia);
}

export function findById(id: string): Media | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(id) as any;
  return row ? rowToMedia(row) : null;
}

export function findByName(name: string): Media | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM media WHERE name = ?').get(name) as any;
  return row ? rowToMedia(row) : null;
}

export function create(m: {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  size: number;
  originalName: string;
}): Media {
  const db = getDb();
  db.prepare(
    'INSERT INTO media (id, name, file_name, mime_type, size, original_name) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(m.id, m.name, m.fileName, m.mimeType, m.size, m.originalName);
  return findById(m.id)!;
}

export function rename(id: string, name: string): Media | null {
  const db = getDb();
  const result = db.prepare('UPDATE media SET name = ? WHERE id = ?').run(name, id);
  if (result.changes === 0) return null;
  return findById(id);
}

export function remove(id: string): boolean {
  const db = getDb();
  return db.prepare('DELETE FROM media WHERE id = ?').run(id).changes > 0;
}
