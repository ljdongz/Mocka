import type { Collection } from '../types';

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
