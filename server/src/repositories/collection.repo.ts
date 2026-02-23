import { getDb } from '../db/connection.js';
import type { Collection } from '../models/collection.js';

function rowToCollection(row: any): Collection {
  return {
    id: row.id,
    name: row.name,
    isExpanded: !!row.is_expanded,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export function findAll(): Collection[] {
  const db = getDb();
  const collections = db.prepare('SELECT * FROM collections ORDER BY sort_order ASC').all().map((r: any) => rowToCollection(r));
  for (const c of collections) {
    const rows = db.prepare('SELECT endpoint_id FROM collection_endpoints WHERE collection_id = ? ORDER BY sort_order').all(c.id) as any[];
    c.endpointIds = rows.map((r) => r.endpoint_id);
  }
  return collections;
}

export function findById(id: string): Collection | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as any;
  if (!row) return null;
  const c = rowToCollection(row);
  const rows = db.prepare('SELECT endpoint_id FROM collection_endpoints WHERE collection_id = ? ORDER BY sort_order').all(id) as any[];
  c.endpointIds = rows.map((r) => r.endpoint_id);
  return c;
}

export function create(c: { id: string; name: string; sortOrder: number }): Collection {
  const db = getDb();
  db.prepare('INSERT INTO collections (id, name, sort_order) VALUES (?, ?, ?)').run(c.id, c.name, c.sortOrder);
  return findById(c.id)!;
}

export function update(id: string, data: { name?: string }): Collection | null {
  const db = getDb();
  if (data.name) {
    db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(data.name, id);
  }
  return findById(id);
}

export function remove(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM collections WHERE id = ?').run(id);
  return result.changes > 0;
}

export function toggleExpanded(id: string): Collection | null {
  const db = getDb();
  db.prepare('UPDATE collections SET is_expanded = NOT is_expanded WHERE id = ?').run(id);
  return findById(id);
}

export function addEndpoint(collectionId: string, endpointId: string, sortOrder: number): void {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO collection_endpoints (collection_id, endpoint_id, sort_order) VALUES (?, ?, ?)').run(collectionId, endpointId, sortOrder);
}

export function removeEndpoint(collectionId: string, endpointId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM collection_endpoints WHERE collection_id = ? AND endpoint_id = ?').run(collectionId, endpointId);
}

export function reorderCollections(orderedIds: string[]): void {
  const db = getDb();
  const update = db.prepare('UPDATE collections SET sort_order = ? WHERE id = ?');
  const txn = db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, id));
  });
  txn();
}

export function reorderEndpoints(collectionId: string, orderedEndpointIds: string[]): void {
  const db = getDb();
  const update = db.prepare('UPDATE collection_endpoints SET sort_order = ? WHERE collection_id = ? AND endpoint_id = ?');
  const txn = db.transaction(() => {
    orderedEndpointIds.forEach((eid, index) => update.run(index, collectionId, eid));
  });
  txn();
}

export function moveEndpoint(endpointId: string, fromCollectionId: string | null, toCollectionId: string, sortOrder: number): void {
  const db = getDb();
  if (fromCollectionId) {
    db.prepare('DELETE FROM collection_endpoints WHERE collection_id = ? AND endpoint_id = ?').run(fromCollectionId, endpointId);
  }
  db.prepare('INSERT OR REPLACE INTO collection_endpoints (collection_id, endpoint_id, sort_order) VALUES (?, ?, ?)').run(toCollectionId, endpointId, sortOrder);
}
