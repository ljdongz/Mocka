import { v4 as uuid } from 'uuid';
import * as endpointRepo from '../repositories/endpoint.repo.js';
import * as variantRepo from '../repositories/variant.repo.js';
import * as routeRegistry from './route-registry.js';
import * as collectionService from './collection.service.js';
import { emit } from './domain-events.js';
import type { Endpoint } from '../models/endpoint.js';
import type { HttpMethod } from '../models/http-method.js';

export function getAll(): Endpoint[] {
  return endpointRepo.findAll();
}

export function getById(id: string): Endpoint | null {
  return endpointRepo.findById(id);
}

export function create(data: { method: HttpMethod; path: string; collectionId?: string }): Endpoint {
  const id = uuid();
  const variantId = uuid();

  const ep = endpointRepo.create({
    id,
    method: data.method,
    path: data.path,
    activeVariantId: variantId,
    isEnabled: true,
    requestBodyContentType: 'application/json',
    requestBodyRaw: '',
    createdAt: '',
    updatedAt: '',
  });

  variantRepo.create({
    id: variantId,
    endpointId: id,
    statusCode: 200,
    description: 'Success',
    body: '{}',
    headers: '{}',
    delay: null,
    memo: '',
    sortOrder: 0,
    matchRules: null,
  });

  const full = endpointRepo.findById(id)!;
  routeRegistry.add(full);

  if (data.collectionId) {
    collectionService.addEndpoint(data.collectionId, full.id);
    const updated = collectionService.getAll().find(c => c.id === data.collectionId);
    if (updated) emit('collection:updated', updated);
  }
  emit('endpoint:created', full);

  return full;
}

export function update(id: string, data: Partial<Endpoint>): Endpoint | null {
  const existing = endpointRepo.findById(id);
  if (!existing) return null;

  // If method or path is changing, remove old route first
  const methodChanging = data.method && data.method !== existing.method;
  const pathChanging = data.path && data.path !== existing.path;
  if (methodChanging || pathChanging) {
    routeRegistry.remove(existing.method, existing.path);
  }

  const ep = endpointRepo.update(id, data);
  if (ep) {
    routeRegistry.update(ep);
    emit('endpoint:updated', ep);
  }
  return ep;
}

export function remove(id: string): boolean {
  const ep = endpointRepo.findById(id);
  if (ep) {
    routeRegistry.remove(ep.method, ep.path);
  }
  const ok = endpointRepo.remove(id);
  if (ok) emit('endpoint:deleted', { id });
  return ok;
}

export function toggleEnabled(id: string): Endpoint | null {
  const ep = endpointRepo.toggleEnabled(id);
  if (ep) {
    routeRegistry.update(ep);
    emit('endpoint:updated', ep);
  }
  return ep;
}

export function setActiveVariant(id: string, variantId: string | null): Endpoint | null {
  const ep = endpointRepo.setActiveVariant(id, variantId);
  if (ep) {
    routeRegistry.update(ep);
    emit('endpoint:updated', ep);
  }
  return ep;
}

export function addVariant(endpointId: string, data?: Partial<{ statusCode: number; description: string }>): Endpoint | null {
  const ep = endpointRepo.findById(endpointId);
  if (!ep) return null;
  const existing = variantRepo.findByEndpointId(endpointId);
  variantRepo.create({
    id: uuid(),
    endpointId,
    statusCode: data?.statusCode ?? 200,
    description: data?.description ?? 'New Response',
    body: '{}',
    headers: '{}',
    delay: null,
    memo: '',
    sortOrder: existing.length,
    matchRules: null,
  });
  const updated = endpointRepo.findById(endpointId)!;
  routeRegistry.update(updated);
  emit('endpoint:updated', updated);
  return updated;
}

export function updateVariant(variantId: string, data: any): any {
  const result = variantRepo.update(variantId, data);
  if (result) {
    const ep = endpointRepo.findById(result.endpointId);
    if (ep) routeRegistry.update(ep);
    emit('variant:updated', result);
  }
  return result;
}

export function removeVariant(variantId: string): boolean {
  const variant = variantRepo.findById(variantId);
  if (!variant) return false;
  const result = variantRepo.remove(variantId);
  if (result) {
    const ep = endpointRepo.findById(variant.endpointId);
    if (ep) {
      if (ep.activeVariantId === variantId) {
        const remaining = variantRepo.findByEndpointId(variant.endpointId);
        endpointRepo.setActiveVariant(variant.endpointId, remaining[0]?.id ?? null);
      }
      routeRegistry.update(endpointRepo.findById(variant.endpointId)!);
    }
    emit('variant:deleted', { id: variantId });
  }
  return result;
}
