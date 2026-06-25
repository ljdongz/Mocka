import { getDb } from '../db/connection.js';
import type { Dataset } from '../models/dataset.js';

export function rowToDataset(row: any): Dataset {
  return {
    id: row.id,
    name: row.name,
    keyField: row.key_field,
    records: row.records ? JSON.parse(row.records) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function findAll(): Dataset[] {
  const db = getDb();
  return db.prepare('SELECT * FROM datasets ORDER BY created_at').all().map(rowToDataset);
}

export function findById(id: string): Dataset | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) as any;
  return row ? rowToDataset(row) : null;
}

export function create(d: { id: string; name: string; keyField: string; records: any[] }): Dataset {
  const db = getDb();
  db.prepare('INSERT INTO datasets (id, name, key_field, records) VALUES (?, ?, ?, ?)')
    .run(d.id, d.name, d.keyField, JSON.stringify(d.records ?? []));
  return findById(d.id)!;
}

export function update(
  id: string,
  data: Partial<Pick<Dataset, 'name' | 'keyField' | 'records'>>,
): Dataset | null {
  const db = getDb();
  const existing = findById(id);
  if (!existing) return null;

  db.prepare("UPDATE datasets SET name=?, key_field=?, records=?, updated_at=datetime('now') WHERE id=?").run(
    data.name ?? existing.name,
    data.keyField ?? existing.keyField,
    JSON.stringify(data.records !== undefined ? data.records : existing.records),
    id,
  );
  return findById(id);
}

export function remove(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM datasets WHERE id = ?').run(id);
  return result.changes > 0;
}
