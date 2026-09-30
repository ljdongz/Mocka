import { getDb } from '../db/connection.js';
import type { Collection } from '../models/collection.js';

function rowToCollection(row: any): Collection {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id ?? null,
    isExpanded: !!row.is_expanded,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export function findAll(): Collection[] {
  const db = getDb();
  const collections = db.prepare('SELECT * FROM collections ORDER BY sort_order ASC').all().map((r: any) => rowToCollection(r));
  for (const c of collections) {
    const rows = db.prepare('SELECT endpoint_id, sort_order FROM collection_endpoints WHERE collection_id = ? ORDER BY sort_order').all(c.id) as any[];
    c.endpointIds = rows.map((r) => r.endpoint_id);
    c.endpointSortOrders = rows.map((r) => r.sort_order);
  }
  return collections;
}

// ── One order per parent ─────────────────────────────────────────────────────
// A parent's children — its collections and its endpoints — share one order scale: collections.sort_order
// for collections, collection_endpoints.sort_order for endpoints inside a collection, and
// endpoints.root_sort_order for endpoints at the top level. Ties list collections first.

export type TreeItem = { type: 'collection' | 'endpoint'; id: string };

/** The children of `parentId` (null = top level) in shown order. */
export function childOrder(parentId: string | null): TreeItem[] {
  const db = getDb();
  const cols = (parentId
    ? db.prepare('SELECT id, sort_order AS o FROM collections WHERE parent_id = ? ORDER BY sort_order, created_at').all(parentId)
    : db.prepare('SELECT id, sort_order AS o FROM collections WHERE parent_id IS NULL ORDER BY sort_order, created_at').all()) as any[];
  const eps = (parentId
    ? db.prepare('SELECT endpoint_id AS id, sort_order AS o FROM collection_endpoints WHERE collection_id = ? ORDER BY sort_order').all(parentId)
    : db.prepare(`SELECT id, root_sort_order AS o FROM endpoints e
        WHERE NOT EXISTS (SELECT 1 FROM collection_endpoints ce WHERE ce.endpoint_id = e.id)
        ORDER BY root_sort_order, created_at`).all()) as any[];
  const merged = [
    ...cols.map((r, i) => ({ type: 'collection' as const, id: r.id as string, o: r.o as number, k: 0, i })),
    ...eps.map((r, i) => ({ type: 'endpoint' as const, id: r.id as string, o: r.o as number, k: 1, i })),
  ];
  merged.sort((a, b) => a.o - b.o || a.k - b.k || a.i - b.i);
  return merged.map(({ type, id }) => ({ type, id }));
}

/** An order value after every current child of `parentId`. */
export function nextOrder(parentId: string | null): number {
  const db = getDb();
  const row = (parentId
    ? db.prepare(`SELECT MAX(o) AS m FROM (
        SELECT MAX(sort_order) AS o FROM collections WHERE parent_id = ?
        UNION ALL SELECT MAX(sort_order) FROM collection_endpoints WHERE collection_id = ?)`).get(parentId, parentId)
    : db.prepare(`SELECT MAX(o) AS m FROM (
        SELECT MAX(sort_order) AS o FROM collections WHERE parent_id IS NULL
        UNION ALL SELECT MAX(root_sort_order) FROM endpoints)`).get()) as { m: number | null };
  return (row.m ?? -1) + 1;
}

/** Renumber `parentId`'s children 0..n in the given order. */
function writeChildOrder(parentId: string | null, items: TreeItem[]): void {
  const db = getDb();
  const col = db.prepare('UPDATE collections SET sort_order = ? WHERE id = ?');
  const ep = parentId
    ? db.prepare('UPDATE collection_endpoints SET sort_order = ? WHERE endpoint_id = ? AND collection_id = ?')
    : db.prepare('UPDATE endpoints SET root_sort_order = ? WHERE id = ?');
  items.forEach((it, i) => {
    if (it.type === 'collection') col.run(i, it.id);
    else if (parentId) ep.run(i, it.id, parentId);
    else ep.run(i, it.id);
  });
}

/**
 * Put a collection or an endpoint at position `index` among `parentId`'s children (null = top level).
 * An endpoint leaves `fromCollectionId` (null = it was at the top level, or is being added as a copy).
 * No validation here — the service checks cycles and existence.
 */
export function placeItem(item: TreeItem, fromCollectionId: string | null, parentId: string | null, index: number): void {
  const db = getDb();
  const txn = db.transaction(() => {
    if (item.type === 'collection') {
      db.prepare('UPDATE collections SET parent_id = ? WHERE id = ?').run(parentId, item.id);
    } else {
      if (fromCollectionId) {
        db.prepare('DELETE FROM collection_endpoints WHERE collection_id = ? AND endpoint_id = ?').run(fromCollectionId, item.id);
      }
      if (parentId) {
        db.prepare('INSERT OR REPLACE INTO collection_endpoints (collection_id, endpoint_id, sort_order) VALUES (?, ?, 0)').run(parentId, item.id);
      }
    }
    const items = childOrder(parentId).filter(x => !(x.type === item.type && x.id === item.id));
    items.splice(Math.max(0, Math.min(index, items.length)), 0, item);
    writeChildOrder(parentId, items);
  });
  txn();
}

/**
 * One-off normalization for data written before children shared one order: collections keep their
 * relative order and come first, endpoints follow in theirs — exactly how they were shown.
 */
export function normalizeCollectionsFirst(): void {
  const db = getDb();
  const parents: (string | null)[] = [null, ...(db.prepare('SELECT id FROM collections').all() as any[]).map(r => r.id)];
  for (const parentId of parents) {
    const items = childOrder(parentId);
    writeChildOrder(parentId, [...items.filter(i => i.type === 'collection'), ...items.filter(i => i.type === 'endpoint')]);
  }
}

export function findById(id: string): Collection | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as any;
  if (!row) return null;
  const c = rowToCollection(row);
  const rows = db.prepare('SELECT endpoint_id, sort_order FROM collection_endpoints WHERE collection_id = ? ORDER BY sort_order').all(id) as any[];
  c.endpointIds = rows.map((r) => r.endpoint_id);
  c.endpointSortOrders = rows.map((r) => r.sort_order);
  return c;
}

export function create(c: { id: string; name: string; sortOrder: number; parentId?: string | null }): Collection {
  const db = getDb();
  db.prepare('INSERT INTO collections (id, name, sort_order, parent_id) VALUES (?, ?, ?, ?)').run(c.id, c.name, c.sortOrder, c.parentId ?? null);
  return findById(c.id)!;
}

export function update(id: string, data: { name?: string }): Collection | null {
  const db = getDb();
  if (data.name) {
    db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(data.name, id);
  }
  return findById(id);
}

/**
 * Delete a collection together with the endpoints its subtree holds, in one transaction.
 * Child collections, variants, params, headers and presets follow via ON DELETE CASCADE.
 */
export function removeWithEndpoints(id: string, endpointIds: string[]): boolean {
  const db = getDb();
  const delEndpoint = db.prepare('DELETE FROM endpoints WHERE id = ?');
  const delCollection = db.prepare('DELETE FROM collections WHERE id = ?');
  const txn = db.transaction(() => {
    for (const endpointId of endpointIds) delEndpoint.run(endpointId);
    return delCollection.run(id).changes > 0;
  });
  return txn();
}

/** Every collection; endpoints are left alone (their memberships cascade away). */
export function removeAll(): number {
  return getDb().prepare('DELETE FROM collections').run().changes;
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
  // Landing at the top level: go last there.
  db.prepare(`UPDATE endpoints SET root_sort_order = ?
    WHERE id = ? AND NOT EXISTS (SELECT 1 FROM collection_endpoints WHERE endpoint_id = ?)`).run(nextOrder(null), endpointId, endpointId);
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

export function findMembershipsByEndpointId(endpointId: string): { collectionId: string; sortOrder: number }[] {
  const db = getDb();
  const rows = db.prepare('SELECT collection_id, sort_order FROM collection_endpoints WHERE endpoint_id = ?').all(endpointId) as any[];
  return rows.map(r => ({ collectionId: r.collection_id, sortOrder: r.sort_order }));
}

export function isEndpointLinked(collectionId: string, endpointId: string): boolean {
  const db = getDb();
  return !!db.prepare('SELECT 1 FROM collection_endpoints WHERE collection_id = ? AND endpoint_id = ?').get(collectionId, endpointId);
}

export function getMaxSortOrder(collectionId: string): number {
  const db = getDb();
  const row = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM collection_endpoints WHERE collection_id = ?').get(collectionId) as { m: number };
  return row.m;
}

/** Move (or, with a null source, add) an endpoint into a collection at position `sortOrder` among its children. */
export function moveEndpoint(endpointId: string, fromCollectionId: string | null, toCollectionId: string, sortOrder: number): void {
  placeItem({ type: 'endpoint', id: endpointId }, fromCollectionId, toCollectionId, sortOrder);
}
