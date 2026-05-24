import { v4 as uuid } from 'uuid';
import * as endpointRepo from '../repositories/endpoint.repo.js';
import * as variantRepo from '../repositories/variant.repo.js';
import * as presetRepo from '../repositories/preset.repo.js';
import * as routeRegistry from './route-registry.js';
import * as collectionService from './collection.service.js';
import * as sequenceCounter from './sequence-counter.service.js';
import { emit } from './domain-events.js';
import type { Endpoint } from '../models/endpoint.js';
import { resolveActiveVariantAfterRemoval } from '../models/endpoint.js';
import type { SequencePreset } from '../models/sequence-preset.js';
import { resolveActivePresetAfterRemoval } from '../models/sequence-preset.js';
import type { HttpMethod } from '../models/http-method.js';
import { normalizePath } from '../models/route-path.js';

export function getAll(): Endpoint[] {
  return endpointRepo.findAll();
}

export function getById(id: string): Endpoint | null {
  return endpointRepo.findById(id);
}

export function create(data: { method: HttpMethod; path: string; name?: string; collectionId?: string }): Endpoint {
  const id = uuid();
  const variantId = uuid();

  const ep = endpointRepo.create({
    id,
    method: data.method,
    path: normalizePath(data.path),
    name: data.name ?? '',
    activeVariantId: variantId,
    activePresetId: null,
    sequenceMode: 'off',
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
    variantGroup: 'standard',
    presetId: null,
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

  if (data.sequenceMode === 'on' && existing.sequenceMode === 'off' && existing.activePresetId) {
    sequenceCounter.reset(existing.activePresetId);
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
    sequenceCounter.cleanup(id);
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

export function addVariant(endpointId: string, data?: Partial<{ statusCode: number; description: string; variantGroup: 'standard' | 'sequence'; presetId: string }>): Endpoint | null {
  const ep = endpointRepo.findById(endpointId);
  if (!ep) return null;
  const group = data?.variantGroup ?? 'standard';
  const presetId = data?.presetId ?? null;
  const existing = presetId
    ? variantRepo.findByPresetId(presetId)
    : variantRepo.findByEndpointId(endpointId, group);
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
    variantGroup: group,
    presetId,
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
        const newActiveId = resolveActiveVariantAfterRemoval(ep.activeVariantId, variantId, remaining);
        endpointRepo.setActiveVariant(variant.endpointId, newActiveId);
      }
      routeRegistry.update(endpointRepo.findById(variant.endpointId)!);
    }
    emit('variant:deleted', { id: variantId });
  }
  return result;
}

export function resetSequence(id: string, presetId?: string): boolean {
  const ep = endpointRepo.findById(id);
  if (!ep) return false;
  const key = presetId ?? ep.activePresetId ?? id;
  sequenceCounter.reset(key);
  return true;
}

export function resetAllSequences(): void {
  sequenceCounter.resetAll();
}

export function getSequenceState(id: string): { index: number; mode: string; presetId: string | null } | null {
  const ep = endpointRepo.findById(id);
  if (!ep) return null;
  const preset = ep.sequencePresets?.find(p => p.id === ep.activePresetId);
  const key = ep.activePresetId ?? id;
  return { index: sequenceCounter.peek(key), mode: preset?.mode ?? ep.sequenceMode, presetId: ep.activePresetId };
}

// ── Preset CRUD ──

export function getPresets(endpointId: string): SequencePreset[] {
  return presetRepo.findByEndpointId(endpointId);
}

export function createPreset(endpointId: string, data?: Partial<{ name: string; mode: 'sequential' | 'loop' }>): SequencePreset | null {
  const ep = endpointRepo.findById(endpointId);
  if (!ep) return null;
  const existing = presetRepo.findByEndpointId(endpointId);
  const preset = presetRepo.create({
    id: uuid(),
    endpointId,
    name: data?.name ?? 'New Preset',
    mode: data?.mode ?? 'sequential',
    sortOrder: existing.length,
    createdAt: '',
  });
  variantRepo.create({
    id: uuid(),
    endpointId,
    statusCode: 200,
    description: 'Success',
    body: '{}',
    headers: '{}',
    delay: null,
    memo: '',
    sortOrder: 0,
    matchRules: null,
    variantGroup: 'sequence',
    presetId: preset.id,
  });
  if (existing.length === 0) {
    endpointRepo.setActivePreset(endpointId, preset.id);
  }
  const updated = endpointRepo.findById(endpointId)!;
  routeRegistry.update(updated);
  emit('endpoint:updated', updated);
  return preset;
}

export function updatePreset(presetId: string, data: Partial<{ name: string; mode: 'sequential' | 'loop' }>): SequencePreset | null {
  const preset = presetRepo.update(presetId, data);
  if (preset) {
    const ep = endpointRepo.findById(preset.endpointId);
    if (ep) {
      routeRegistry.update(ep);
      emit('endpoint:updated', ep);
    }
  }
  return preset;
}

export function removePreset(presetId: string): boolean {
  const preset = presetRepo.findById(presetId);
  if (!preset) return false;
  const ok = presetRepo.remove(presetId);
  if (ok) {
    sequenceCounter.cleanup(presetId);
    const ep = endpointRepo.findById(preset.endpointId);
    if (ep) {
      if (ep.activePresetId === presetId) {
        const remaining = presetRepo.findByEndpointId(preset.endpointId);
        const newActiveId = resolveActivePresetAfterRemoval(ep.activePresetId, presetId, remaining);
        endpointRepo.setActivePreset(preset.endpointId, newActiveId);
        if (!newActiveId) {
          endpointRepo.update(preset.endpointId, { sequenceMode: 'off' });
        }
      }
      const updated = endpointRepo.findById(preset.endpointId)!;
      routeRegistry.update(updated);
      emit('endpoint:updated', updated);
    }
  }
  return ok;
}

export function setActivePreset(endpointId: string, presetId: string | null): Endpoint | null {
  const ep = endpointRepo.setActivePreset(endpointId, presetId);
  if (ep) {
    routeRegistry.update(ep);
    emit('endpoint:updated', ep);
  }
  return ep;
}

export function addPresetVariant(presetId: string, data?: Partial<{ statusCode: number; description: string }>): Endpoint | null {
  const preset = presetRepo.findById(presetId);
  if (!preset) return null;
  const existing = variantRepo.findByPresetId(presetId);
  variantRepo.create({
    id: uuid(),
    endpointId: preset.endpointId,
    statusCode: data?.statusCode ?? 200,
    description: data?.description ?? 'New Response',
    body: '{}',
    headers: '{}',
    delay: null,
    memo: '',
    sortOrder: existing.length,
    matchRules: null,
    variantGroup: 'sequence',
    presetId,
  });
  const updated = endpointRepo.findById(preset.endpointId)!;
  routeRegistry.update(updated);
  emit('endpoint:updated', updated);
  return updated;
}
