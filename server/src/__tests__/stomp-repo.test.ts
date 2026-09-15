import { describe, it, expect, beforeEach } from 'vitest';
import { initDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as connectionRepo from '../repositories/stomp-connection.repo.js';
import * as destinationRepo from '../repositories/stomp-destination.repo.js';
import * as variantRepo from '../repositories/stomp-variant.repo.js';
import type { StompMessageVariant } from '../models/stomp.js';

beforeEach(() => { initDb(':memory:'); initSchema(); });

function makeConnection(id = 'c1', path = '/api/app/ws/chat') {
  return connectionRepo.create({
    id, name: 'chat', path, isEnabled: true, connectPolicy: 'accept', requiredHeaders: [],
    rejectMessage: 'Connection rejected', heartbeatOutgoing: 10000, heartbeatIncoming: 10000,
    stompVersion: '1.2', defaultDelay: null, replayBufferSize: 0, sortOrder: 0,
  });
}

function makeDestination(id = 'd1', connectionId = 'c1') {
  return destinationRepo.create({
    id, connectionId, name: '', pattern: '/app/rooms/*/message', trigger: 'send', isEnabled: true,
    activeVariantId: null, activePresetId: null, sequenceMode: 'off', sortOrder: 0,
  });
}

function makeVariant(over: Partial<StompMessageVariant> = {}): StompMessageVariant {
  return {
    id: 'v1', destinationId: 'd1', description: 'Message', kind: 'message', targetDestination: '', scope: 'broadcast',
    body: '{}', headers: '{}', delay: null, repeatIntervalMs: null, repeatCount: null, matchRules: null, datasetBinding: null,
    variantGroup: 'standard', presetId: null, memo: '', sortOrder: 0, ...over,
  };
}

describe('stomp repositories', () => {
  it('creates a connection and rejects a duplicate path', () => {
    const c = makeConnection();
    expect(c.path).toBe('/api/app/ws/chat');
    expect(c.requiredHeaders).toEqual([]);
    expect(() => makeConnection('c2')).toThrow(/UNIQUE/);
  });

  it('nests destinations, variants and presets in findAll/findById/findByPath', () => {
    makeConnection();
    makeDestination();
    variantRepo.create(makeVariant());
    const preset = variantRepo.createPreset({ id: 'p1', destinationId: 'd1', name: 'Default', mode: 'loop', sortOrder: 0 });
    variantRepo.create(makeVariant({ id: 'v2', variantGroup: 'sequence', presetId: preset.id, sortOrder: 1 }));

    const all = connectionRepo.findAll();
    expect(all).toHaveLength(1);
    const d = all[0].destinations![0];
    expect(d.variants).toHaveLength(2);
    expect(d.presets).toHaveLength(1);
    expect(d.presets![0].mode).toBe('loop');
    expect(connectionRepo.findById('c1')!.destinations![0].variants![1].presetId).toBe('p1');
    expect(connectionRepo.findByPath('/api/app/ws/chat')!.id).toBe('c1');
    expect(connectionRepo.findByPath('/nope')).toBeNull();
  });

  it('round-trips arrays and JSON columns through update', () => {
    makeConnection();
    const upd = connectionRepo.update('c1', { requiredHeaders: ['Authorization', 'x-device-id'], connectPolicy: 'validate', defaultDelay: 250 });
    expect(upd!.requiredHeaders).toEqual(['Authorization', 'x-device-id']);
    expect(upd!.connectPolicy).toBe('validate');
    expect(upd!.defaultDelay).toBe(250);

    makeDestination();
    variantRepo.create(makeVariant());
    const rules = { bodyRules: [], headerRules: [{ field: 'x-client-type', operator: 'equals' as const, value: 'APP' }], queryParamRules: [], pathParamRules: [], combineWith: 'AND' as const };
    const v = variantRepo.update('v1', { matchRules: rules, datasetBinding: { datasetId: 'ds', mode: 'list' }, repeatIntervalMs: 1000, repeatCount: 3 });
    expect(v!.matchRules).toEqual(rules);
    expect(v!.datasetBinding).toEqual({ datasetId: 'ds', mode: 'list' });
    expect(v!.repeatIntervalMs).toBe(1000);
    expect(v!.repeatCount).toBe(3);
    // clearing keeps null, untouched fields keep their value
    const v2 = variantRepo.update('v1', { matchRules: null });
    expect(v2!.matchRules).toBeNull();
    expect(v2!.repeatCount).toBe(3);
  });

  it('cascades deletes from connection to destinations, variants and presets', () => {
    makeConnection();
    makeDestination();
    variantRepo.create(makeVariant());
    variantRepo.createPreset({ id: 'p1', destinationId: 'd1', name: 'Default', mode: 'sequential', sortOrder: 0 });
    expect(connectionRepo.remove('c1')).toBe(true);
    expect(destinationRepo.findById('d1')).toBeNull();
    expect(variantRepo.findById('v1')).toBeNull();
    expect(variantRepo.findPresetById('p1')).toBeNull();
    expect(connectionRepo.remove('c1')).toBe(false);
  });

  it('deleting a preset cascades to its variants only', () => {
    makeConnection();
    makeDestination();
    variantRepo.create(makeVariant());
    variantRepo.createPreset({ id: 'p1', destinationId: 'd1', name: 'Default', mode: 'sequential', sortOrder: 0 });
    variantRepo.create(makeVariant({ id: 'v2', variantGroup: 'sequence', presetId: 'p1' }));
    expect(variantRepo.removePreset('p1')).toBe(true);
    expect(variantRepo.findById('v2')).toBeNull();
    expect(variantRepo.findById('v1')).not.toBeNull();
  });

  it('reorders by index and toggles enabled', () => {
    makeConnection();
    makeDestination('d1');
    makeDestination('d2');
    destinationRepo.reorder(['d2', 'd1']);
    const ds = destinationRepo.findByConnectionId('c1');
    expect(ds.map(d => d.id)).toEqual(['d2', 'd1']);
    expect(ds[0].sortOrder).toBe(0);

    variantRepo.create(makeVariant({ id: 'v1', sortOrder: 0 }));
    variantRepo.create(makeVariant({ id: 'v2', sortOrder: 1 }));
    variantRepo.reorder(['v2', 'v1']);
    expect(variantRepo.findByDestinationId('d1').map(v => v.id)).toEqual(['v2', 'v1']);

    expect(connectionRepo.toggleEnabled('c1')!.isEnabled).toBe(false);
    expect(destinationRepo.toggleEnabled('d1')!.isEnabled).toBe(false);
    makeConnection('c2', '/other');
    connectionRepo.reorder(['c2', 'c1']);
    expect(connectionRepo.findAll().map(c => c.id)).toEqual(['c2', 'c1']);
  });

  it('sets active variant and preset on a destination', () => {
    makeConnection();
    makeDestination();
    variantRepo.create(makeVariant());
    expect(destinationRepo.setActiveVariant('d1', 'v1')!.activeVariantId).toBe('v1');
    variantRepo.createPreset({ id: 'p1', destinationId: 'd1', name: 'Default', mode: 'sequential', sortOrder: 0 });
    expect(destinationRepo.setActivePreset('d1', 'p1')!.activePresetId).toBe('p1');
    expect(destinationRepo.update('d1', { sequenceMode: 'on', pattern: '/x/*' })!.sequenceMode).toBe('on');
    expect(variantRepo.findByDestinationId('d1', 'standard')).toHaveLength(1);
    expect(variantRepo.findByPresetId('p1')).toHaveLength(0);
  });
});
