import { describe, it, expect, beforeEach } from 'vitest';
import { initDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as stompService from '../services/stomp.service.js';
import * as stompRegistry from '../services/stomp-registry.js';
import { exportConnection, importConnection, STOMP_EXPORT_VERSION } from '../services/stomp-import-export.service.js';

beforeEach(() => { initDb(':memory:'); initSchema(); stompRegistry.reload([]); });

function seed() {
  const c = stompService.createConnection({ name: 'chat', path: '/api/app/ws/chat', connectPolicy: 'validate', requiredHeaders: ['Authorization'], replayBufferSize: 5 });
  const send = stompService.createDestination(c.id, { name: 'room msg', pattern: '/app/rooms/*/message', trigger: 'send' })!.destinations![0];
  stompService.updateVariant(send.variants![0].id, { targetDestination: '/topic/rooms/{{$destCapture 1}}', body: '{"echo":true}', scope: 'broadcast' });
  const second = stompService.addVariant(send.id, { description: 'Hospital', matchRules: { bodyRules: [], headerRules: [{ field: 'x-client-type', operator: 'equals', value: 'HOSPITAL_APP' }], queryParamRules: [], pathParamRules: [], combineWith: 'AND' } })!;
  stompService.setActiveVariant(send.id, second.variants![1].id);

  const manual = stompService.createDestination(c.id, { pattern: '/topic/rooms/88', trigger: 'manual' })!.destinations![1];
  const preset = stompService.createPreset(manual.id, { name: 'Flow', mode: 'loop' })!;
  stompService.addPresetVariant(preset.id, { body: '2' });
  stompService.updateDestination(manual.id, { sequenceMode: 'on' });
  return stompService.getById(c.id)!;
}

describe('stomp import/export', () => {
  it('round-trips a connection through export → wipe → import', () => {
    const original = seed();
    const data = exportConnection(original.id)!;
    expect(data.kind).toBe('mocka-stomp-connection');
    expect(data.version).toBe(STOMP_EXPORT_VERSION);
    expect(data.connection.destinations).toHaveLength(2);
    expect(data.connection.destinations[0].activeVariantIndex).toBe(1);
    expect(data.connection.destinations[1].presets[0].variants).toHaveLength(2);
    expect(data.connection.destinations[1].activePresetIndex).toBe(0);

    initDb(':memory:'); initSchema(); stompRegistry.reload([]);
    const result = importConnection(JSON.parse(JSON.stringify(data)), 'skip');
    expect(result.created).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.destinations).toBe(2);

    const [imported] = stompService.getAll();
    expect(imported.path).toBe('/api/app/ws/chat');
    expect(imported.requiredHeaders).toEqual(['Authorization']);
    expect(imported.replayBufferSize).toBe(5);
    const [send, manual] = imported.destinations!;
    expect(send.variants!.filter(v => v.variantGroup === 'standard')).toHaveLength(2);
    expect(send.activeVariantId).toBe(send.variants![1].id);
    expect(send.variants![0].targetDestination).toBe('/topic/rooms/{{$destCapture 1}}');
    expect(send.variants![1].matchRules?.headerRules[0].value).toBe('HOSPITAL_APP');
    expect(manual.sequenceMode).toBe('on');
    expect(manual.presets).toHaveLength(1);
    expect(manual.activePresetId).toBe(manual.presets![0].id);
    expect(manual.variants!.filter(v => v.presetId === manual.presets![0].id)).toHaveLength(2);
    expect(stompRegistry.getByPath('/api/app/ws/chat')?.id).toBe(imported.id);
  });

  it('skip keeps the existing connection, overwrite replaces it', () => {
    const original = seed();
    const data = exportConnection(original.id)!;
    const skipped = importConnection(data, 'skip');
    expect(skipped.skipped).toBe(true);
    expect(stompService.getAll()).toHaveLength(1);
    expect(stompService.getAll()[0].id).toBe(original.id);

    const over = importConnection({ ...data, connection: { ...data.connection, name: 'renamed' } }, 'overwrite');
    expect(over.overwritten).toBe(true);
    const all = stompService.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).not.toBe(original.id);
    expect(all[0].name).toBe('renamed');
  });

  it('returns null for an unknown connection', () => {
    expect(exportConnection('nope')).toBeNull();
  });
});
