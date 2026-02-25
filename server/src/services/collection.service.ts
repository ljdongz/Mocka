import { v4 as uuid } from 'uuid';
import * as collectionRepo from '../repositories/collection.repo.js';
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

export function remove(id: string): boolean {
  const ok = collectionRepo.remove(id);
  if (ok) emit('collection:deleted', { id });
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
