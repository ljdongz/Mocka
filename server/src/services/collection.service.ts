import { v4 as uuid } from 'uuid';
import * as collectionRepo from '../repositories/collection.repo.js';
import type { Collection } from '../models/collection.js';

export function getAll(): Collection[] {
  return collectionRepo.findAll();
}

export function create(name: string): Collection {
  const existing = collectionRepo.findAll();
  return collectionRepo.create({ id: uuid(), name, sortOrder: existing.length });
}

export function update(id: string, data: { name?: string }): Collection | null {
  return collectionRepo.update(id, data);
}

export function remove(id: string): boolean {
  return collectionRepo.remove(id);
}

export function toggleExpanded(id: string): Collection | null {
  return collectionRepo.toggleExpanded(id);
}

export function moveEndpoint(endpointId: string, fromCollectionId: string | null, toCollectionId: string, sortOrder: number): void {
  collectionRepo.moveEndpoint(endpointId, fromCollectionId, toCollectionId, sortOrder);
}

export function addEndpoint(collectionId: string, endpointId: string): void {
  const collection = collectionRepo.findById(collectionId);
  const sortOrder = collection?.endpointIds?.length ?? 0;
  collectionRepo.addEndpoint(collectionId, endpointId, sortOrder);
}

export function removeEndpoint(collectionId: string, endpointId: string): void {
  collectionRepo.removeEndpoint(collectionId, endpointId);
}
