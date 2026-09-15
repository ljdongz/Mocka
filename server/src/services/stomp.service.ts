import { v4 as uuid } from 'uuid';
import * as connectionRepo from '../repositories/stomp-connection.repo.js';
import * as destinationRepo from '../repositories/stomp-destination.repo.js';
import * as variantRepo from '../repositories/stomp-variant.repo.js';
import * as stompRegistry from './stomp-registry.js';
import * as sequenceCounter from './sequence-counter.service.js';
import { emit } from './domain-events.js';
import { resolveActiveVariantAfterRemoval } from '../models/endpoint.js';
import { resolveActivePresetAfterRemoval } from '../models/sequence-preset.js';
import { normalizeStompPath } from '../models/stomp.js';
import type { StompConnection, StompDestination, StompMessageVariant, StompPreset, StompTrigger } from '../models/stomp.js';

/** Runtime registers itself here so disabling/deleting a connection tears its sessions down. */
let onConnectionDisabled: (connectionId: string) => void = () => {};
export function setConnectionDisabledHook(fn: (connectionId: string) => void): void {
  onConnectionDisabled = fn;
}

/** Reload the in-memory rule snapshot and tell the UI something changed. */
export function syncRegistry(): void {
  stompRegistry.reload(connectionRepo.findAll());
  emit('stomp:changed', null);
}

function defaultVariant(destinationId: string, over: Partial<StompMessageVariant> = {}): StompMessageVariant {
  return {
    id: uuid(),
    destinationId,
    description: 'Message',
    kind: 'message',
    targetDestination: '',
    scope: 'broadcast',
    body: '{}',
    headers: '{}',
    delay: null,
    repeatIntervalMs: null,
    repeatCount: null,
    matchRules: null,
    datasetBinding: null,
    variantGroup: 'standard',
    presetId: null,
    memo: '',
    sortOrder: 0,
    ...over,
  };
}

// ── connections ──

export function getAll(): StompConnection[] {
  return connectionRepo.findAll();
}

export function getById(id: string): StompConnection | null {
  return connectionRepo.findById(id);
}

export function createConnection(data: { path: string } & Partial<StompConnection>): StompConnection {
  const path = normalizeStompPath(data.path);
  if (connectionRepo.findByPath(path)) {
    throw new Error(`Connection path ${path} already exists`);
  }
  const existing = connectionRepo.findAll();
  const c = connectionRepo.create({
    id: uuid(),
    name: data.name ?? '',
    path,
    isEnabled: data.isEnabled ?? true,
    connectPolicy: data.connectPolicy ?? 'accept',
    requiredHeaders: data.requiredHeaders ?? [],
    rejectMessage: data.rejectMessage ?? 'Connection rejected',
    heartbeatOutgoing: data.heartbeatOutgoing ?? 10000,
    heartbeatIncoming: data.heartbeatIncoming ?? 10000,
    stompVersion: data.stompVersion ?? '1.2',
    defaultDelay: data.defaultDelay ?? null,
    replayBufferSize: data.replayBufferSize ?? 0,
    sortOrder: existing.length,
  });
  syncRegistry();
  return c;
}

export function updateConnection(id: string, data: Partial<StompConnection>): StompConnection | null {
  const existing = connectionRepo.findById(id);
  if (!existing) return null;
  if (data.path !== undefined) {
    const path = normalizeStompPath(data.path);
    const clash = connectionRepo.findByPath(path);
    if (clash && clash.id !== id) throw new Error(`Connection path ${path} already exists`);
    data = { ...data, path };
  }
  const c = connectionRepo.update(id, data);
  if (c) {
    if (existing.isEnabled && !c.isEnabled) onConnectionDisabled(id);
    syncRegistry();
  }
  return c;
}

export function removeConnection(id: string): boolean {
  const existing = connectionRepo.findById(id);
  if (!existing) return false;
  for (const d of existing.destinations ?? []) {
    for (const p of d.presets ?? []) sequenceCounter.cleanup(p.id);
  }
  onConnectionDisabled(id);
  const ok = connectionRepo.remove(id);
  if (ok) syncRegistry();
  return ok;
}

export function toggleConnection(id: string): StompConnection | null {
  const c = connectionRepo.toggleEnabled(id);
  if (c) {
    if (!c.isEnabled) onConnectionDisabled(id);
    syncRegistry();
  }
  return c;
}

export function reorderConnections(orderedIds: string[]): void {
  connectionRepo.reorder(orderedIds);
  syncRegistry();
}

// ── destinations ──

export function getDestination(id: string): StompDestination | null {
  return destinationRepo.findById(id);
}

export function createDestination(connectionId: string, data: { name?: string; pattern: string; trigger: StompTrigger }): StompConnection | null {
  const conn = connectionRepo.findById(connectionId);
  if (!conn) return null;
  const destinationId = uuid();
  const variant = defaultVariant(destinationId);
  destinationRepo.create({
    id: destinationId,
    connectionId,
    name: data.name ?? '',
    pattern: data.pattern.trim(),
    trigger: data.trigger,
    isEnabled: true,
    activeVariantId: variant.id,
    activePresetId: null,
    sequenceMode: 'off',
    sortOrder: conn.destinations?.length ?? 0,
  });
  variantRepo.create(variant);
  syncRegistry();
  return connectionRepo.findById(connectionId);
}

export function updateDestination(id: string, data: Partial<StompDestination>): StompDestination | null {
  const existing = destinationRepo.findById(id);
  if (!existing) return null;
  if (data.sequenceMode === 'on' && existing.sequenceMode === 'off' && existing.activePresetId) {
    sequenceCounter.reset(existing.activePresetId);
  }
  if (data.pattern !== undefined) data = { ...data, pattern: data.pattern.trim() };
  const d = destinationRepo.update(id, data);
  if (d) syncRegistry();
  return d;
}

export function removeDestination(id: string): boolean {
  const existing = destinationRepo.findById(id);
  if (!existing) return false;
  for (const p of existing.presets ?? []) sequenceCounter.cleanup(p.id);
  const ok = destinationRepo.remove(id);
  if (ok) syncRegistry();
  return ok;
}

export function toggleDestination(id: string): StompDestination | null {
  const d = destinationRepo.toggleEnabled(id);
  if (d) syncRegistry();
  return d;
}

export function setActiveVariant(destinationId: string, variantId: string | null): StompDestination | null {
  const d = destinationRepo.setActiveVariant(destinationId, variantId);
  if (d) syncRegistry();
  return d;
}

export function setActivePreset(destinationId: string, presetId: string | null): StompDestination | null {
  const d = destinationRepo.setActivePreset(destinationId, presetId);
  if (d) syncRegistry();
  return d;
}

export function reorderDestinations(connectionId: string, orderedIds: string[]): StompConnection | null {
  const conn = connectionRepo.findById(connectionId);
  if (!conn) return null;
  const owned = new Set((conn.destinations ?? []).map(d => d.id));
  if (!orderedIds.every(id => owned.has(id))) return null;
  destinationRepo.reorder(orderedIds);
  syncRegistry();
  return connectionRepo.findById(connectionId);
}

// ── variants ──

export function addVariant(destinationId: string, data: Partial<StompMessageVariant> = {}): StompDestination | null {
  const dest = destinationRepo.findById(destinationId);
  if (!dest) return null;
  let presetId = data.presetId ?? null;
  let group: 'standard' | 'sequence' = data.variantGroup ?? 'standard';
  if (group === 'sequence' && !presetId && dest.activePresetId) presetId = dest.activePresetId;
  if (presetId) group = 'sequence';
  const siblings = presetId ? variantRepo.findByPresetId(presetId) : variantRepo.findByDestinationId(destinationId, group);
  const { id: _ignored, destinationId: _d, ...rest } = data;
  variantRepo.create(defaultVariant(destinationId, {
    ...rest,
    description: data.description ?? 'New Message',
    variantGroup: group,
    presetId,
    sortOrder: siblings.length,
  }));
  syncRegistry();
  return destinationRepo.findById(destinationId);
}

export function updateVariant(id: string, data: Partial<StompMessageVariant>): StompMessageVariant | null {
  if (data.presetId !== undefined) {
    data = { ...data, variantGroup: data.presetId ? 'sequence' : 'standard' };
  }
  const v = variantRepo.update(id, data);
  if (v) syncRegistry();
  return v;
}

export function removeVariant(id: string): boolean {
  const variant = variantRepo.findById(id);
  if (!variant) return false;
  const ok = variantRepo.remove(id);
  if (!ok) return false;
  const dest = destinationRepo.findById(variant.destinationId);
  if (dest && dest.activeVariantId === id) {
    const remaining = variantRepo.findByDestinationId(variant.destinationId, 'standard');
    destinationRepo.setActiveVariant(dest.id, resolveActiveVariantAfterRemoval(dest.activeVariantId, id, remaining));
  }
  syncRegistry();
  return true;
}

export function reorderVariants(destinationId: string, orderedIds: string[]): StompDestination | null {
  const dest = destinationRepo.findById(destinationId);
  if (!dest) return null;
  const owned = new Set((dest.variants ?? []).map(v => v.id));
  if (!orderedIds.every(id => owned.has(id))) return null;
  variantRepo.reorder(orderedIds);
  syncRegistry();
  return destinationRepo.findById(destinationId);
}

// ── presets ──

export function createPreset(destinationId: string, data: { name?: string; mode?: 'sequential' | 'loop' } = {}): StompPreset | null {
  const dest = destinationRepo.findById(destinationId);
  if (!dest) return null;
  const existing = variantRepo.findPresetsByDestinationId(destinationId);
  const preset = variantRepo.createPreset({
    id: uuid(),
    destinationId,
    name: data.name ?? 'New Preset',
    mode: data.mode ?? 'sequential',
    sortOrder: existing.length,
  });
  variantRepo.create(defaultVariant(destinationId, { variantGroup: 'sequence', presetId: preset.id }));
  if (existing.length === 0) destinationRepo.setActivePreset(destinationId, preset.id);
  syncRegistry();
  return preset;
}

export function updatePreset(id: string, data: Partial<StompPreset>): StompPreset | null {
  const p = variantRepo.updatePreset(id, data);
  if (p) syncRegistry();
  return p;
}

export function removePreset(id: string): boolean {
  const preset = variantRepo.findPresetById(id);
  if (!preset) return false;
  const ok = variantRepo.removePreset(id);
  if (!ok) return false;
  sequenceCounter.cleanup(id);
  const dest = destinationRepo.findById(preset.destinationId);
  if (dest && dest.activePresetId === id) {
    const remaining = variantRepo.findPresetsByDestinationId(preset.destinationId);
    const next = resolveActivePresetAfterRemoval(dest.activePresetId, id, remaining);
    destinationRepo.setActivePreset(dest.id, next);
    if (!next) destinationRepo.update(dest.id, { sequenceMode: 'off' });
  }
  syncRegistry();
  return true;
}

export function addPresetVariant(presetId: string, data: Partial<StompMessageVariant> = {}): StompDestination | null {
  const preset = variantRepo.findPresetById(presetId);
  if (!preset) return null;
  return addVariant(preset.destinationId, { ...data, presetId, variantGroup: 'sequence' });
}

export function resetSequence(destinationId: string, presetId?: string): boolean {
  const dest = destinationRepo.findById(destinationId);
  if (!dest) return false;
  sequenceCounter.reset(presetId ?? dest.activePresetId ?? destinationId);
  return true;
}
