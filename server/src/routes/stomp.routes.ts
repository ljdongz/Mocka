import type { FastifyInstance, FastifyReply } from 'fastify';
import * as stompService from '../services/stomp.service.js';
import {
  STOMP_CONNECT_POLICIES, STOMP_TRIGGERS, STOMP_SCOPES, STOMP_FIRE_KINDS,
  type StompConnection, type StompDestination, type StompMessageVariant,
} from '../models/stomp.js';

function notFound(reply: FastifyReply) {
  reply.code(404);
  return { error: 'Not found' };
}

function badRequest(reply: FastifyReply, error: string) {
  reply.code(400);
  return { error };
}

/** Returns an error string when any enum-typed field carries a value outside its union. */
function validateConnection(data: Partial<StompConnection>): string | null {
  if (data.connectPolicy !== undefined && !STOMP_CONNECT_POLICIES.includes(data.connectPolicy)) return `Invalid connectPolicy: ${data.connectPolicy}`;
  if (data.requiredHeaders !== undefined && !Array.isArray(data.requiredHeaders)) return 'requiredHeaders must be an array';
  for (const k of ['heartbeatOutgoing', 'heartbeatIncoming', 'replayBufferSize'] as const) {
    const v = data[k];
    if (v !== undefined && (!Number.isInteger(v) || (v as number) < 0)) return `${k} must be a non-negative integer`;
  }
  if (data.defaultDelay !== undefined && data.defaultDelay !== null && (typeof data.defaultDelay !== 'number' || data.defaultDelay < 0)) return 'defaultDelay must be a non-negative number or null';
  return null;
}

function validateDestination(data: Partial<StompDestination>): string | null {
  if (data.trigger !== undefined && !STOMP_TRIGGERS.includes(data.trigger)) return `Invalid trigger: ${data.trigger}`;
  if (data.sequenceMode !== undefined && data.sequenceMode !== 'on' && data.sequenceMode !== 'off') return `Invalid sequenceMode: ${data.sequenceMode}`;
  if (data.pattern !== undefined && !String(data.pattern).trim()) return 'pattern is required';
  return null;
}

function validateVariant(data: Partial<StompMessageVariant>): string | null {
  if (data.kind !== undefined && !STOMP_FIRE_KINDS.includes(data.kind)) return `Invalid kind: ${data.kind}`;
  if (data.scope !== undefined && !STOMP_SCOPES.includes(data.scope)) return `Invalid scope: ${data.scope}`;
  for (const k of ['delay', 'repeatIntervalMs', 'repeatCount'] as const) {
    const v = data[k];
    if (v !== undefined && v !== null && (typeof v !== 'number' || v < 0)) return `${k} must be a non-negative number or null`;
  }
  if (data.headers !== undefined) {
    try { JSON.parse(data.headers); } catch { return 'headers must be a JSON object string'; }
  }
  return null;
}

export async function stompRoutes(app: FastifyInstance): Promise<void> {
  // ── connections ──

  app.get('/api/stomp/connections', async () => stompService.getAll());

  app.get('/api/stomp/connections/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return stompService.getById(id) ?? notFound(reply);
  });

  app.post('/api/stomp/connections', async (req, reply) => {
    const body = (req.body ?? {}) as Partial<StompConnection> & { path?: string };
    if (!body.path || !String(body.path).trim()) return badRequest(reply, 'path is required');
    const invalid = validateConnection(body);
    if (invalid) return badRequest(reply, invalid);
    try {
      reply.code(201);
      return stompService.createConnection({ ...body, path: body.path });
    } catch (e: any) {
      return badRequest(reply, e.message ?? 'Failed to create connection');
    }
  });

  app.put('/api/stomp/connections/reorder', async (req, reply) => {
    const { orderedIds } = (req.body ?? {}) as { orderedIds?: string[] };
    if (!Array.isArray(orderedIds)) return badRequest(reply, 'orderedIds must be an array');
    stompService.reorderConnections(orderedIds);
    return { success: true };
  });

  app.put('/api/stomp/connections/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = (req.body ?? {}) as Partial<StompConnection>;
    const invalid = validateConnection(data);
    if (invalid) return badRequest(reply, invalid);
    try {
      return stompService.updateConnection(id, data) ?? notFound(reply);
    } catch (e: any) {
      return badRequest(reply, e.message);
    }
  });

  app.delete('/api/stomp/connections/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return stompService.removeConnection(id) ? { success: true } : notFound(reply);
  });

  app.patch('/api/stomp/connections/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string };
    return stompService.toggleConnection(id) ?? notFound(reply);
  });

  // ── destinations ──

  app.post('/api/stomp/connections/:id/destinations', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { name?: string; pattern?: string; trigger?: StompDestination['trigger'] };
    if (!body.pattern || !body.pattern.trim()) return badRequest(reply, 'pattern is required');
    if (!body.trigger || !STOMP_TRIGGERS.includes(body.trigger)) return badRequest(reply, `Invalid trigger: ${body.trigger}`);
    const conn = stompService.createDestination(id, { name: body.name, pattern: body.pattern, trigger: body.trigger });
    if (!conn) return notFound(reply);
    reply.code(201);
    return conn;
  });

  app.put('/api/stomp/connections/:id/destinations/reorder', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { orderedIds } = (req.body ?? {}) as { orderedIds?: string[] };
    if (!Array.isArray(orderedIds)) return badRequest(reply, 'orderedIds must be an array');
    return stompService.reorderDestinations(id, orderedIds) ?? notFound(reply);
  });

  app.put('/api/stomp/destinations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = (req.body ?? {}) as Partial<StompDestination>;
    const invalid = validateDestination(data);
    if (invalid) return badRequest(reply, invalid);
    return stompService.updateDestination(id, data) ?? notFound(reply);
  });

  app.delete('/api/stomp/destinations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return stompService.removeDestination(id) ? { success: true } : notFound(reply);
  });

  app.patch('/api/stomp/destinations/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string };
    return stompService.toggleDestination(id) ?? notFound(reply);
  });

  app.patch('/api/stomp/destinations/:id/active-variant', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { variantId } = (req.body ?? {}) as { variantId: string | null };
    return stompService.setActiveVariant(id, variantId ?? null) ?? notFound(reply);
  });

  app.patch('/api/stomp/destinations/:id/active-preset', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { presetId } = (req.body ?? {}) as { presetId: string | null };
    return stompService.setActivePreset(id, presetId ?? null) ?? notFound(reply);
  });

  // ── variants ──

  app.post('/api/stomp/destinations/:id/variants', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = (req.body ?? {}) as Partial<StompMessageVariant>;
    const invalid = validateVariant(data);
    if (invalid) return badRequest(reply, invalid);
    const dest = stompService.addVariant(id, data);
    if (!dest) return notFound(reply);
    reply.code(201);
    return dest;
  });

  app.put('/api/stomp/destinations/:id/variants/reorder', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { orderedIds } = (req.body ?? {}) as { orderedIds?: string[] };
    if (!Array.isArray(orderedIds)) return badRequest(reply, 'orderedIds must be an array');
    return stompService.reorderVariants(id, orderedIds) ?? notFound(reply);
  });

  app.put('/api/stomp/variants/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = (req.body ?? {}) as Partial<StompMessageVariant>;
    const invalid = validateVariant(data);
    if (invalid) return badRequest(reply, invalid);
    return stompService.updateVariant(id, data) ?? notFound(reply);
  });

  app.delete('/api/stomp/variants/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return stompService.removeVariant(id) ? { success: true } : notFound(reply);
  });

  // ── presets ──

  app.post('/api/stomp/destinations/:id/presets', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = (req.body ?? {}) as { name?: string; mode?: 'sequential' | 'loop' };
    if (data.mode !== undefined && data.mode !== 'sequential' && data.mode !== 'loop') return badRequest(reply, `Invalid mode: ${data.mode}`);
    const preset = stompService.createPreset(id, data);
    if (!preset) return notFound(reply);
    reply.code(201);
    return preset;
  });

  app.put('/api/stomp/presets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = (req.body ?? {}) as { name?: string; mode?: 'sequential' | 'loop' };
    if (data.mode !== undefined && data.mode !== 'sequential' && data.mode !== 'loop') return badRequest(reply, `Invalid mode: ${data.mode}`);
    return stompService.updatePreset(id, data) ?? notFound(reply);
  });

  app.delete('/api/stomp/presets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return stompService.removePreset(id) ? { success: true } : notFound(reply);
  });

  app.post('/api/stomp/presets/:id/variants', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = (req.body ?? {}) as Partial<StompMessageVariant>;
    const invalid = validateVariant(data);
    if (invalid) return badRequest(reply, invalid);
    const dest = stompService.addPresetVariant(id, data);
    if (!dest) return notFound(reply);
    reply.code(201);
    return dest;
  });

  app.post('/api/stomp/destinations/:id/sequence/reset', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { presetId } = (req.body as { presetId?: string } | undefined) ?? {};
    return stompService.resetSequence(id, presetId) ? { success: true } : notFound(reply);
  });
}
