import { describe, it, expect, beforeEach } from 'vitest';

import { initDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as endpointService from '../services/endpoint.service.js';
import * as endpointRepo from '../repositories/endpoint.repo.js';
import * as stompService from '../services/stomp.service.js';
import * as stompRegistry from '../services/stomp-registry.js';
import { exportData, importData, EXPORT_VERSION } from '../services/import-export.service.js';

beforeEach(() => {
  initDb(':memory:');
  initSchema();
  stompRegistry.reload([]);
});

describe('import-export service (post WebSocket removal)', () => {
  describe('exportData', () => {
    it('uses EXPORT_VERSION 4 and carries NO wsEndpoints key', () => {
      // Create an endpoint (it ships with one standard "Success" variant).
      const created = endpointService.create({ method: 'GET', path: '/api/users', name: 'Users' });
      expect(created.responseVariants?.length).toBeGreaterThanOrEqual(1);

      const data = exportData();

      expect(EXPORT_VERSION).toBe(4);
      expect(data.version).toBe(4);

      // The endpoint is present in the export.
      expect(data.endpoints.length).toBe(1);
      const exported = data.endpoints[0];
      expect(exported.method).toBe('GET');
      expect(exported.path).toBe('/api/users');
      expect(exported.name).toBe('Users');
      // At least one response variant survived the export.
      expect(exported.responseVariants.length).toBeGreaterThanOrEqual(1);
      expect(exported.responseVariants[0].variantGroup).toBe('standard');

      // No WebSocket data must leak into the HTTP export.
      expect(data).not.toHaveProperty('wsEndpoints');
      expect(Object.prototype.hasOwnProperty.call(data, 'wsEndpoints')).toBe(false);
      // Be explicit: the exported shape only has the expected keys.
      expect(Object.keys(data).sort()).toEqual(
        ['collections', 'endpoints', 'exportedAt', 'stompConnections', 'version'].sort(),
      );
    });

    it('does not include wsEndpoints even with multiple endpoints and variants', () => {
      const ep = endpointService.create({ method: 'POST', path: '/api/login', name: 'Login' });
      // Add a second standard variant to make the export non-trivial.
      endpointService.addVariant(ep.id, { statusCode: 401, description: 'Unauthorized' });
      endpointService.create({ method: 'GET', path: '/api/health' });

      const data = exportData();

      expect(data.endpoints.length).toBe(2);
      expect(data).not.toHaveProperty('wsEndpoints');
      for (const e of data.endpoints) {
        expect(e).not.toHaveProperty('wsFrames');
        expect(e).not.toHaveProperty('wsEndpoint');
      }
    });
  });

  describe('round-trip export -> reset -> import', () => {
    it('imports the endpoint back into a fresh DB (skip policy)', () => {
      endpointService.create({ method: 'GET', path: '/api/users', name: 'Users' });
      const ep2 = endpointService.create({ method: 'POST', path: '/api/login', name: 'Login' });
      endpointService.addVariant(ep2.id, { statusCode: 401, description: 'Unauthorized' });

      const exported = exportData();
      expect(exported.endpoints.length).toBe(2);

      // Wipe the world: fresh in-memory DB.
      initDb(':memory:');
      initSchema();
      expect(endpointRepo.findAll().length).toBe(0);

      const result = importData(exported, 'skip');

      expect(result.created).toBeGreaterThanOrEqual(1);
      expect(result.created).toBe(2);
      expect(result.errors).toEqual([]);

      const after = endpointRepo.findAll();
      expect(after.length).toBe(2);

      const users = after.find(e => e.method === 'GET' && e.path === '/api/users');
      expect(users).toBeDefined();
      expect(users!.name).toBe('Users');
      expect(users!.responseVariants?.length).toBeGreaterThanOrEqual(1);

      const login = after.find(e => e.method === 'POST' && e.path === '/api/login');
      expect(login).toBeDefined();
      // Standard variant + the extra one we added.
      expect(login!.responseVariants?.length).toBe(2);
    });

    it('skip policy skips an already-existing endpoint on re-import', () => {
      endpointService.create({ method: 'GET', path: '/api/users', name: 'Users' });
      const exported = exportData();

      // Import into the SAME DB where the endpoint already exists.
      const result = importData(exported, 'skip');

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      // Still only one endpoint (no duplicate).
      expect(endpointRepo.findAll().length).toBe(1);
    });
  });

  describe('legacy v2 export with stray wsEndpoints array', () => {
    it('imports http endpoints fine and ignores the bogus wsEndpoints array', () => {
      // Minimal v2-shaped object literal that still carries a (now removed)
      // wsEndpoints array. The importer must ignore it and not throw.
      const legacyV2 = {
        version: 2,
        exportedAt: '2024-01-01T00:00:00.000Z',
        endpoints: [
          {
            method: 'GET',
            path: '/api/legacy',
            name: 'Legacy',
            isEnabled: true,
            requestBodyContentType: 'application/json',
            requestBodyRaw: '',
            queryParams: [],
            requestHeaders: [],
            responseVariants: [
              {
                statusCode: 200,
                description: 'OK',
                body: '{"ok":true}',
                headers: '{}',
                delay: null,
                memo: '',
                sortOrder: 0,
                matchRules: null,
                variantGroup: 'standard',
              },
            ],
            activeVariantIndex: 0,
          },
        ],
        collections: [
          {
            name: 'Legacy Collection',
            sortOrder: 0,
            endpointIndices: [0],
          },
        ],
        // Stray field from the removed WebSocket feature — must be ignored.
        wsEndpoints: [
          { id: 'ws-bogus', path: '/ws/old', frames: [{ data: 'nope' }] },
        ],
      };

      let result!: ReturnType<typeof importData>;
      expect(() => {
        // Cast through unknown: the public ExportData type no longer models v2's
        // wsEndpoints, but the legacy file shape is what we are exercising.
        result = importData(legacyV2 as unknown as Parameters<typeof importData>[0], 'skip');
      }).not.toThrow();

      // HTTP endpoint imported cleanly.
      expect(result.created).toBe(1);
      expect(result.errors).toEqual([]);
      expect(result.collectionsCreated).toBe(1);

      const after = endpointRepo.findAll();
      expect(after.length).toBe(1);
      const ep = after[0];
      expect(ep.method).toBe('GET');
      expect(ep.path).toBe('/api/legacy');
      expect(ep.name).toBe('Legacy');
      expect(ep.responseVariants?.length).toBe(1);
      expect(ep.responseVariants?.[0].body).toBe('{"ok":true}');
    });
  });

  describe('STOMP connections in the combined export', () => {
    function seedStomp() {
      const c = stompService.createConnection({ name: 'chat', path: '/api/app/ws/chat', connectPolicy: 'validate', requiredHeaders: ['Authorization'], replayBufferSize: 5 });
      const send = stompService.createDestination(c.id, { name: 'room msg', pattern: '/app/rooms/*/message', trigger: 'send' })!.destinations![0];
      stompService.updateVariant(send.variants![0].id, { targetDestination: '/topic/rooms/1', body: '{"echo":true}' });
      return c;
    }

    it('export-all carries STOMP connections alongside the HTTP endpoints', () => {
      endpointService.create({ method: 'GET', path: '/api/users', name: 'Users' });
      seedStomp();

      const data = exportData() as any;

      expect(data.endpoints).toHaveLength(1);
      expect(data.stompConnections).toHaveLength(1);
      expect(data.stompConnections[0].path).toBe('/api/app/ws/chat');
      expect(data.stompConnections[0].requiredHeaders).toEqual(['Authorization']);
      expect(data.stompConnections[0].destinations).toHaveLength(1);
      expect(data.stompConnections[0].destinations[0].variants[0].body).toBe('{"echo":true}');
    });

    it('round-trips STOMP through export -> wipe -> import', () => {
      endpointService.create({ method: 'GET', path: '/api/users', name: 'Users' });
      seedStomp();
      const data = JSON.parse(JSON.stringify(exportData()));

      initDb(':memory:'); initSchema(); stompRegistry.reload([]);
      const result = importData(data, 'skip');

      expect(result.errors).toEqual([]);
      expect(result.created).toBe(1);
      expect(result.stompCreated).toBe(1);
      expect(result.stompSkipped).toBe(0);

      const [imported] = stompService.getAll();
      expect(imported.path).toBe('/api/app/ws/chat');
      expect(imported.replayBufferSize).toBe(5);
      expect(imported.destinations![0].pattern).toBe('/app/rooms/*/message');
      // The runtime registry must know about the imported connection.
      expect(stompRegistry.getByPath('/api/app/ws/chat')?.id).toBe(imported.id);
    });

    it('skip keeps an existing connection, overwrite replaces it', () => {
      seedStomp();
      const data = JSON.parse(JSON.stringify(exportData()));
      const originalId = stompService.getAll()[0].id;

      const skipped = importData(data, 'skip');
      expect(skipped.stompSkipped).toBe(1);
      expect(skipped.stompCreated).toBe(0);
      expect(stompService.getAll()).toHaveLength(1);
      expect(stompService.getAll()[0].id).toBe(originalId);

      data.stompConnections[0].name = 'renamed';
      const over = importData(data, 'overwrite');
      expect(over.stompOverwritten).toBe(1);
      const all = stompService.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('renamed');
      expect(all[0].id).not.toBe(originalId);
    });

    it('merge falls back to skip for STOMP, since STOMP has no merge semantics', () => {
      seedStomp();
      const data = JSON.parse(JSON.stringify(exportData()));
      const originalId = stompService.getAll()[0].id;

      const result = importData(data, 'merge');

      expect(result.stompSkipped).toBe(1);
      expect(result.stompOverwritten).toBe(0);
      expect(stompService.getAll()[0].id).toBe(originalId);
    });

    it('a collection-filtered export carries no STOMP connections', () => {
      seedStomp();
      const data = exportData([]) as any;
      // No IDs given means "everything", so STOMP is present...
      expect(data.stompConnections).toHaveLength(1);

      const filtered = exportData(['does-not-exist']) as any;
      expect(filtered.stompConnections).toEqual([]);
    });

    it('creates several connections in one pass, each getting its own sortOrder slot', () => {
      stompService.createConnection({ name: 'chat', path: '/api/app/ws/chat' });
      stompService.createConnection({ name: 'alerts', path: '/api/app/ws/alerts' });
      stompService.createConnection({ name: 'presence', path: '/api/app/ws/presence' });
      const data = JSON.parse(JSON.stringify(exportData()));

      initDb(':memory:'); initSchema(); stompRegistry.reload([]);
      const result = importData(data, 'skip');

      expect(result.errors).toEqual([]);
      expect(result.stompCreated).toBe(3);

      const all = stompService.getAll();
      expect(all.map(c => c.path).sort()).toEqual(
        ['/api/app/ws/alerts', '/api/app/ws/chat', '/api/app/ws/presence'],
      );
      // Each create must see the previous one, so no two land in the same slot.
      expect(new Set(all.map(c => c.sortOrder)).size).toBe(3);
      for (const c of all) expect(stompRegistry.getByPath(c.path)?.id).toBe(c.id);
    });

    it('imports several connections in one pass, mixing skip and create', () => {
      stompService.createConnection({ name: 'chat', path: '/api/app/ws/chat' });
      stompService.createConnection({ name: 'alerts', path: '/api/app/ws/alerts' });
      const data = JSON.parse(JSON.stringify(exportData()));

      // Wipe, then re-seed only the first, so one clashes and one is new.
      initDb(':memory:'); initSchema(); stompRegistry.reload([]);
      const keptId = stompService.createConnection({ name: 'chat', path: '/api/app/ws/chat' }).id;

      const result = importData(data, 'skip');

      expect(result.errors).toEqual([]);
      expect(result.stompSkipped).toBe(1);
      expect(result.stompCreated).toBe(1);

      const all = stompService.getAll();
      expect(all.map(c => c.path).sort()).toEqual(['/api/app/ws/alerts', '/api/app/ws/chat']);
      expect(new Set(all.map(c => c.sortOrder)).size).toBe(2);
      // The registry has to hold both the untouched one and the freshly created one.
      expect(stompRegistry.getByPath('/api/app/ws/chat')?.id).toBe(keptId);
      expect(stompRegistry.getByPath('/api/app/ws/alerts')).toBeTruthy();
    });

    it('a v3 file without stompConnections still imports', () => {
      const legacyV3 = {
        version: 3,
        exportedAt: new Date().toISOString(),
        endpoints: [{
          method: 'GET', path: '/api/legacy', name: 'Legacy', isEnabled: true,
          requestBodyContentType: 'application/json', requestBodyRaw: '',
          queryParams: [], requestHeaders: [],
          responseVariants: [{ statusCode: 200, description: 'OK', body: '{}', headers: '{}', delay: null, memo: '', sortOrder: 0 }],
          activeVariantIndex: 0,
        }],
        collections: [],
      };

      const result = importData(legacyV3 as unknown as Parameters<typeof importData>[0], 'skip');

      expect(result.created).toBe(1);
      expect(result.stompCreated).toBe(0);
      expect(result.errors).toEqual([]);
      expect(stompService.getAll()).toEqual([]);
    });
  });
});
