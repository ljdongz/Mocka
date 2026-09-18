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

export function create(name: string): Collection {
  const existing = collectionRepo.findAll();
  const c = collectionRepo.create({ id: uuid(), name, sortOrder: existing.length });
  emit('collection:created', c);
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
  const collection = collectionRepo.findById(id);
  if (!collection) return false;
  const endpointIds = collection.endpointIds ?? [];

  // Tear down in-memory state before the rows go, while the paths are still readable.
  for (const endpointId of endpointIds) {
    const ep = endpointRepo.findById(endpointId);
    if (ep) routeRegistry.remove(ep.method, ep.path);
    sequenceCounter.cleanup(endpointId);
  }

  const ok = collectionRepo.removeWithEndpoints(id, endpointIds);
  if (ok) {
    for (const endpointId of endpointIds) emit('endpoint:deleted', { id: endpointId });
    emit('collection:deleted', { id });
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
