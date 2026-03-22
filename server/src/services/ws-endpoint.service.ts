import { v4 as uuid } from 'uuid';
import * as wsEndpointRepo from '../repositories/ws-endpoint.repo.js';
import { emit } from './domain-events.js';
import * as wsRegistry from './ws-registry.js';
import type { WsEndpoint, WsResponseFrame } from '../models/ws-endpoint.js';
import { normalizePath } from '../models/route-path.js';
import { resolveActiveFrameAfterRemoval } from '../models/ws-endpoint.js';

export function getAll(): WsEndpoint[] {
  return wsEndpointRepo.findAll();
}

export function getById(id: string): WsEndpoint | null {
  return wsEndpointRepo.findById(id);
}

export function create(data: { path: string; name?: string }): WsEndpoint {
  const id = uuid();
  const frameId = uuid();

  wsEndpointRepo.create({
    id,
    path: normalizePath(data.path),
    name: data.name ?? '',
    isEnabled: true,
    activeFrameId: frameId,
    createdAt: '',
    updatedAt: '',
  });

  wsEndpointRepo.createFrame({
    id: frameId,
    wsEndpointId: id,
    trigger: 'message',
    label: 'Response',
    messageBody: '{ "message": "Hello from Mocka WS!" }',
    delay: null,
    intervalMin: null,
    intervalMax: null,
    memo: '',
    sortOrder: 0,
    matchRules: null,
  });

  const full = wsEndpointRepo.findById(id)!;
  wsRegistry.add(full);
  emit('ws-endpoint:created', full);
  return full;
}

export function update(id: string, data: Partial<WsEndpoint>): WsEndpoint | null {
  const ep = wsEndpointRepo.update(id, data);
  if (ep) {
    wsRegistry.update(ep);
    emit('ws-endpoint:updated', ep);
  }
  return ep;
}

export function remove(id: string): boolean {
  const ep = wsEndpointRepo.findById(id);
  const ok = wsEndpointRepo.remove(id);
  if (ok) {
    if (ep) wsRegistry.remove(ep.path);
    emit('ws-endpoint:deleted', { id });
  }
  return ok;
}

export function toggleEnabled(id: string): WsEndpoint | null {
  const ep = wsEndpointRepo.toggleEnabled(id);
  if (ep) {
    wsRegistry.update(ep);
    emit('ws-endpoint:updated', ep);
  }
  return ep;
}

export function setActiveFrame(id: string, frameId: string | null): WsEndpoint | null {
  const ep = wsEndpointRepo.setActiveFrame(id, frameId);
  if (ep) {
    emit('ws-endpoint:updated', ep);
  }
  return ep;
}

export function addFrame(
  wsEndpointId: string,
  data?: Partial<{ label: string; messageBody: string }>,
): WsEndpoint | null {
  const ep = wsEndpointRepo.findById(wsEndpointId);
  if (!ep) return null;

  const existing = wsEndpointRepo.findFramesByEndpointId(wsEndpointId);
  wsEndpointRepo.createFrame({
    id: uuid(),
    wsEndpointId,
    trigger: 'message',
    label: data?.label ?? 'Response',
    messageBody: data?.messageBody ?? '',
    delay: null,
    intervalMin: null,
    intervalMax: null,
    memo: '',
    sortOrder: existing.length,
    matchRules: null,
  });

  const updated = wsEndpointRepo.findById(wsEndpointId)!;
  emit('ws-endpoint:updated', updated);
  return updated;
}

export function updateFrame(frameId: string, data: Partial<WsResponseFrame>): WsResponseFrame | null {
  const result = wsEndpointRepo.updateFrame(frameId, data);
  if (result) {
    emit('ws-frame:updated', result);
    const ep = wsEndpointRepo.findById(result.wsEndpointId);
    if (ep) {
      wsRegistry.update(ep);
      emit('ws-endpoint:updated', ep);
    }
  }
  return result;
}

export function removeFrame(frameId: string): boolean {
  const frame = wsEndpointRepo.findFrameById(frameId);
  if (!frame) return false;

  const result = wsEndpointRepo.removeFrame(frameId);
  if (result) {
    const ep = wsEndpointRepo.findById(frame.wsEndpointId);
    if (ep) {
      if (ep.activeFrameId === frameId) {
        const remaining = wsEndpointRepo.findFramesByEndpointId(frame.wsEndpointId);
        const newActiveId = resolveActiveFrameAfterRemoval(ep.activeFrameId, frameId, remaining);
        wsEndpointRepo.setActiveFrame(frame.wsEndpointId, newActiveId);
      }
    }
    emit('ws-frame:deleted', { id: frameId });
    const updatedEp = wsEndpointRepo.findById(frame.wsEndpointId);
    if (updatedEp) {
      wsRegistry.update(updatedEp);
      emit('ws-endpoint:updated', updatedEp);
    }
  }
  return result;
}
