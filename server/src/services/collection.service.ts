import { v4 as uuid } from 'uuid';
import * as collectionRepo from '../repositories/collection.repo.js';
import * as endpointRepo from '../repositories/endpoint.repo.js';
import * as routeRegistry from './route-registry.js';
import * as sequenceCounter from './sequence-counter.service.js';
import { emit } from './domain-events.js';
import type { Collection } from '../models/collection.js';

export function getAll(): Collection[] {
  return collectionRepo.findAll();
}

/** Ids of `id` and every collection nested under it. */
function subtreeIds(all: Collection[], id: string): Set<string> {
  const ids = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const c of all) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); grew = true; }
    }
  }
  return ids;
}

export function create(name: string, parentId: string | null = null): Collection | null {
  const all = collectionRepo.findAll();
  if (parentId && !all.some(c => c.id === parentId)) return null;
  const c = collectionRepo.create({ id: uuid(), name, sortOrder: collectionRepo.nextOrder(parentId), parentId });
  emit('collection:created', c);
  return c;
}

/**
 * Put a collection or an endpoint at position `index` among the children of `parentId` (null = top
 * level; collections and endpoints share one order there). An endpoint leaves `fromCollectionId`.
 * Returns an error string when a collection is unknown or would land inside itself.
 */
export function place(
  item: collectionRepo.TreeItem, fromCollectionId: string | null, parentId: string | null, index: number,
): string | null {
  const all = collectionRepo.findAll();
  if (parentId && !all.some(c => c.id === parentId)) return 'Target collection not found';
  if (item.type === 'collection') {
    if (!all.some(c => c.id === item.id)) return 'Collection not found';
    if (parentId && subtreeIds(all, item.id).has(parentId)) return 'Cannot move a collection into itself or its descendants';
  } else if (!endpointRepo.findById(item.id)) {
    return 'Endpoint not found';
  }
  collectionRepo.placeItem(item, fromCollectionId, parentId, index);
  if (item.type === 'collection') emit('collection:updated', collectionRepo.findById(item.id)!);
  emit('collection:reordered', null);
  return null;
}

/** Move a collection under another (or to the top level) at `index` among its new siblings (default: last). */
export function move(id: string, parentId: string | null, index?: number): Collection | string {
  const error = place({ type: 'collection', id }, null, parentId, index ?? Number.MAX_SAFE_INTEGER);
  return error ?? collectionRepo.findById(id)!;
}

export function update(id: string, data: { name?: string }): Collection | null {
  const c = collectionRepo.update(id, data);
  if (c) emit('collection:updated', c);
  return c;
}

/**
 * Delete a collection and the endpoints inside it. A collection owns its
 * endpoints, so removing it removes them — deliberately, rather than leaving
 * them behind ungrouped the way a bare FK cascade would.
 *
 * Deliberately not routed through endpoint.service.remove: that module imports
 * this one, and reaching back would make the cycle load-bearing.
 */
export function remove(id: string): boolean {
  const all = collectionRepo.findAll();
  if (!all.some(c => c.id === id)) return false;
  const subtree = subtreeIds(all, id);

  // collection_endpoints is keyed on (collection, endpoint), so an endpoint can
  // sit in more than one collection — move_endpoint with a null source leaves it
  // in both. Only take the ones this subtree alone holds; deleting a shared
  // endpoint would empty a slot a collection outside it still lists.
  const held = new Set(all.filter(c => subtree.has(c.id)).flatMap(c => c.endpointIds ?? []));
  const ownedEndpointIds = [...held].filter(endpointId =>
    collectionRepo.findMembershipsByEndpointId(endpointId).every(m => subtree.has(m.collectionId)),
  );

  // Tear down in-memory state before the rows go, while the paths are still readable.
  for (const endpointId of ownedEndpointIds) {
    const ep = endpointRepo.findById(endpointId);
    if (ep) routeRegistry.remove(ep.method, ep.path);
    sequenceCounter.cleanup(endpointId);
  }

  const ok = collectionRepo.removeWithEndpoints(id, ownedEndpointIds);
  if (ok) {
    for (const endpointId of ownedEndpointIds) emit('endpoint:deleted', { id: endpointId });
    for (const collectionId of subtree) emit('collection:deleted', { id: collectionId });
  }
  return ok;
}

export function toggleExpanded(id: string): Collection | null {
  const c = collectionRepo.toggleExpanded(id);
  if (c) emit('collection:updated', c);
  return c;
}

export function reorderCollections(orderedIds: string[]): void {
  collectionRepo.reorderCollections(orderedIds);
  emit('collection:reordered', null);
}

export function reorderEndpoints(collectionId: string, orderedEndpointIds: string[]): void {
  collectionRepo.reorderEndpoints(collectionId, orderedEndpointIds);
  emit('collection:reordered', null);
}

export function moveEndpoint(endpointId: string, fromCollectionId: string | null, toCollectionId: string, sortOrder: number): void {
  place({ type: 'endpoint', id: endpointId }, fromCollectionId, toCollectionId, sortOrder);
}

export function addEndpoint(collectionId: string, endpointId: string): void {
  collectionRepo.addEndpoint(collectionId, endpointId, collectionRepo.nextOrder(collectionId));
}

export function removeEndpoint(collectionId: string, endpointId: string): void {
  collectionRepo.removeEndpoint(collectionId, endpointId);
  const updated = collectionRepo.findById(collectionId);
  if (updated) emit('collection:updated', updated);
}
