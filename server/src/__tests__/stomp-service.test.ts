import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as stompService from '../services/stomp.service.js';
import * as stompRegistry from '../services/stomp-registry.js';

beforeEach(() => { initDb(':memory:'); initSchema(); stompRegistry.reload([]); });

describe('stomp.service', () => {
  it('creates a connection with defaults, normalizes the path and registers it', () => {
    const c = stompService.createConnection({ name: 'chat', path: 'api/app/ws/chat/' });
    expect(c.path).toBe('/api/app/ws/chat');
    expect(c.connectPolicy).toBe('accept');
    expect(c.heartbeatOutgoing).toBe(10000);
    expect(c.stompVersion).toBe('1.2');
    expect(stompRegistry.getByPath('/api/app/ws/chat/')?.id).toBe(c.id);
    expect(stompRegistry.getById(c.id)?.name).toBe('chat');
  });

  it('rejects a duplicate path', () => {
    stompService.createConnection({ path: '/ws' });
    expect(() => stompService.createConnection({ path: '/ws/' })).toThrow(/already exists/);
  });

  it('creates a destination with a default active variant', () => {
    const c = stompService.createConnection({ path: '/ws' });
    const updated = stompService.createDestination(c.id, { pattern: '/app/rooms/*/message', trigger: 'send' })!;
    const d = updated.destinations![0];
    expect(d.variants).toHaveLength(1);
    expect(d.activeVariantId).toBe(d.variants![0].id);
    expect(d.variants![0].kind).toBe('message');
    expect(d.variants![0].scope).toBe('broadcast');
    // registry sees the destination too
    expect(stompRegistry.getById(c.id)!.destinations![0].pattern).toBe('/app/rooms/*/message');
  });

  it('re-points the active variant when it is removed', () => {
    const c = stompService.createConnection({ path: '/ws' });
    const d = stompService.createDestination(c.id, { pattern: '/x', trigger: 'manual' })!.destinations![0];
    const withTwo = stompService.addVariant(d.id, { description: 'Second' })!;
    const [first, second] = withTwo.variants!;
    expect(withTwo.activeVariantId).toBe(first.id);
    expect(stompService.removeVariant(first.id)).toBe(true);
    expect(stompService.getById(c.id)!.destinations![0].activeVariantId).toBe(second.id);
  });

  it('auto-activates the first preset and turns sequence mode off when the last one goes', () => {
    const c = stompService.createConnection({ path: '/ws' });
    const d = stompService.createDestination(c.id, { pattern: '/x', trigger: 'manual' })!.destinations![0];
    const p = stompService.createPreset(d.id, { name: 'Flow', mode: 'loop' })!;
    let dest = stompService.getById(c.id)!.destinations![0];
    expect(dest.activePresetId).toBe(p.id);
    expect(dest.variants!.filter(v => v.presetId === p.id)).toHaveLength(1);
    stompService.updateDestination(d.id, { sequenceMode: 'on' });
    expect(stompService.removePreset(p.id)).toBe(true);
    dest = stompService.getById(c.id)!.destinations![0];
    expect(dest.activePresetId).toBeNull();
    expect(dest.sequenceMode).toBe('off');
  });

  it('addVariant with presetId files it under the sequence group', () => {
    const c = stompService.createConnection({ path: '/ws' });
    const d = stompService.createDestination(c.id, { pattern: '/x', trigger: 'manual' })!.destinations![0];
    const p = stompService.createPreset(d.id)!;
    const dest = stompService.addPresetVariant(p.id, { body: '2' })!;
    const seq = dest.variants!.filter(v => v.presetId === p.id);
    expect(seq).toHaveLength(2);
    expect(seq.every(v => v.variantGroup === 'sequence')).toBe(true);
    expect(seq[1].sortOrder).toBe(1);
  });

  it('removing or disabling a connection empties the registry entry and calls the disabled hook', () => {
    const hook = vi.fn();
    stompService.setConnectionDisabledHook(hook);
    const c = stompService.createConnection({ path: '/ws' });
    stompService.toggleConnection(c.id);
    expect(hook).toHaveBeenCalledWith(c.id);
    expect(stompRegistry.getByPath('/ws')?.isEnabled).toBe(false);
    stompService.toggleConnection(c.id);
    stompService.updateConnection(c.id, { isEnabled: false });
    expect(hook).toHaveBeenCalledTimes(2);
    stompService.removeConnection(c.id);
    expect(hook).toHaveBeenCalledTimes(3);
    expect(stompRegistry.getByPath('/ws')).toBeUndefined();
    stompService.setConnectionDisabledHook(() => {});
  });

  it('reorders destinations and variants', () => {
    const c = stompService.createConnection({ path: '/ws' });
    stompService.createDestination(c.id, { pattern: '/a', trigger: 'manual' });
    const d2 = stompService.createDestination(c.id, { pattern: '/b', trigger: 'manual' })!.destinations![1];
    const reordered = stompService.reorderDestinations(c.id, [d2.id, stompService.getById(c.id)!.destinations![0].id])!;
    expect(reordered.destinations![0].id).toBe(d2.id);
    const withTwo = stompService.addVariant(d2.id)!;
    const ids = withTwo.variants!.map(v => v.id).reverse();
    expect(stompService.reorderVariants(d2.id, ids)!.variants!.map(v => v.id)).toEqual(ids);
    expect(stompService.reorderVariants(d2.id, ['nope'])).toBeNull();
  });
});
