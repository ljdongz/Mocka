import type { Collection, Endpoint } from '../types';

/** Direct children of `parentId` (null = top level), in their stored order. */
export function childrenOf(collections: Collection[], parentId: string | null): Collection[] {
  return collections.filter(c => (c.parentId ?? null) === parentId).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** `id` and every collection nested under it. */
export function subtreeIds(collections: Collection[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) {
    for (const c of collections) if (c.parentId === out[i]) out.push(c.id);
  }
  return out;
}

/** The chain from `id` up to its top-level ancestor, `id` first. */
export function ancestorIds(collections: Collection[], id: string): string[] {
  const byId = new Map(collections.map(c => [c.id, c]));
  const out: string[] = [];
  for (let c = byId.get(id); c && !out.includes(c.id); c = c.parentId ? byId.get(c.parentId) : undefined) out.push(c.id);
  return out;
}

/** Every collection in tree order with its depth — for indented pickers. */
export function flattenTree(collections: Collection[]): { collection: Collection; depth: number }[] {
  const out: { collection: Collection; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const c of childrenOf(collections, parentId)) { out.push({ collection: c, depth }); walk(c.id, depth + 1); }
  };
  walk(null, 0);
  return out;
}

// ── One order per parent ─────────────────────────────────────────────────────

export type TreeChild = { type: 'collection'; collection: Collection } | { type: 'endpoint'; endpoint: Endpoint };

/**
 * A parent's children — collections and endpoints interleaved — in shown order (null = top level).
 * Both share one order scale per parent; on a tie the collection comes first, as the server does.
 */
export function mixedChildren(collections: Collection[], endpoints: Endpoint[], parentId: string | null): TreeChild[] {
  const byId = new Map(endpoints.map(e => [e.id, e]));
  const out: { child: TreeChild; order: number; kind: number; i: number }[] = [];
  childrenOf(collections, parentId).forEach((c, i) => out.push({ child: { type: 'collection', collection: c }, order: c.sortOrder, kind: 0, i }));
  if (parentId) {
    const c = collections.find(x => x.id === parentId);
    (c?.endpointIds ?? []).forEach((id, i) => {
      const ep = byId.get(id);
      if (ep) out.push({ child: { type: 'endpoint', endpoint: ep }, order: c?.endpointSortOrders?.[i] ?? i, kind: 1, i });
    });
  } else {
    const grouped = new Set(collections.flatMap(c => c.endpointIds ?? []));
    endpoints.filter(e => !grouped.has(e.id))
      .forEach((ep, i) => out.push({ child: { type: 'endpoint', endpoint: ep }, order: ep.rootSortOrder ?? i, kind: 1, i }));
  }
  out.sort((a, b) => a.order - b.order || a.kind - b.kind || a.i - b.i);
  return out.map(o => o.child);
}

const childKey = (c: TreeChild) => c.type === 'collection' ? `c:${c.collection.id}` : `e:${c.endpoint.id}`;

// ── Drag and drop ────────────────────────────────────────────────────────────

export type DragItem =
  | { type: 'collection'; id: string }
  | { type: 'endpoint'; id: string; collectionId: string | null };

/** What the pointer is over: a collection header, an endpoint row, or the empty space below the tree (top level). */
export type DropSpot =
  | { type: 'collection'; id: string; parentId: string | null }
  | { type: 'endpoint'; id: string; collectionId: string | null }
  | { type: 'root' };

export type DropZone = 'before' | 'inside' | 'after';

/** Put `item` at `index` among `parentId`'s children (collections and endpoints together). */
export interface DropPlan {
  item: DragItem;
  parentId: string | null;
  index: number;
  zone: DropZone;
}

/**
 * Where on the row the pointer sits (ratio 0 = top edge, 1 = bottom). On a collection header the edges
 * mean before/after it and the middle means into it; on an endpoint row it is the top or bottom half.
 */
export function dropZone(_item: DragItem, spot: DropSpot, ratio: number): DropZone {
  if (spot.type === 'root') return 'inside';
  if (spot.type === 'collection') return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside';
  return ratio < 0.5 ? 'before' : 'after';
}

/** Turn a drop into the one move it means, or null when it means nothing (or something invalid). */
export function planDrop(collections: Collection[], endpoints: Endpoint[], item: DragItem, spot: DropSpot, zone: DropZone): DropPlan | null {
  const own = item.type === 'collection' ? new Set(subtreeIds(collections, item.id)) : new Set<string>();
  const itemKey = item.type === 'collection' ? `c:${item.id}` : `e:${item.id}`;
  const place = (parentId: string | null, anchorKey?: string, atIndex?: number): DropPlan | null => {
    if (parentId && own.has(parentId)) return null;
    const siblings = mixedChildren(collections, endpoints, parentId).map(childKey).filter(k => k !== itemKey);
    let index = atIndex ?? siblings.length;
    if (anchorKey) {
      const at = siblings.indexOf(anchorKey);
      if (at === -1) return null;
      index = at + (zone === 'after' ? 1 : 0);
    }
    return { item, parentId, index, zone };
  };

  if (spot.type === 'root') return place(null);
  const spotKey = spot.type === 'collection' ? `c:${spot.id}` : `e:${spot.id}`;
  if (spotKey === itemKey) return null;
  if (spot.type === 'collection') {
    // Into a collection = its first child, the row right under the header the drop line points at.
    return zone === 'inside' ? place(spot.id, undefined, 0) : place(spot.parentId, spotKey);
  }
  return place(spot.collectionId, spotKey);
}
