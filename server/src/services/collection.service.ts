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
  const siblings = all.filter(c => c.parentId === parentId).length;
  const c = collectionRepo.create({ id: uuid(), name, sortOrder: siblings, parentId });
  emit('collection:created', c);
  return c;
}

/**
 * Move a collection under another (or to the top level with null), appended after its new siblings.
 * Returns an error string when the target is unknown or inside the collection itself.
 */
export function move(id: string, parentId: string | null): Collection | string {
  const all = collectionRepo.findAll();
  if (!all.some(c => c.id === id)) return 'Collection not found';
  if (parentId && !all.some(c => c.id === parentId)) return 'Target collection not found';
  if (parentId && subtreeIds(all, id).has(parentId)) return 'Cannot move a collection into itself or its descendants';
  const siblings = all.filter(c => c.parentId === parentId && c.id !== id).length;
  const c = collectionRepo.setParent(id, parentId, siblings)!;
  emit('collection:updated', c);
  return c;
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
  collectionRepo.moveEndpoint(endpointId, fromCollectionId, toCollectionId, sortOrder);
  emit('collection:reordered', null);
}

export function addEndpoint(collectionId: string, endpointId: string): void {
  const collection = collectionRepo.findById(collectionId);
  const sortOrder = collection?.endpointIds?.length ?? 0;
  collectionRepo.addEndpoint(collectionId, endpointId, sortOrder);
}

export function removeEndpoint(collectionId: string, endpointId: string): void {
  collectionRepo.removeEndpoint(collectionId, endpointId);
  const updated = collectionRepo.findById(collectionId);
  if (updated) emit('collection:updated', updated);
}
