import { describe, it, expect, beforeEach } from 'vitest';

import { initDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as endpointService from '../services/endpoint.service.js';
import * as endpointRepo from '../repositories/endpoint.repo.js';
import { exportData, importData, EXPORT_VERSION } from '../services/import-export.service.js';

beforeEach(() => {
  initDb(':memory:');
  initSchema();
});

describe('import-export service (post WebSocket removal)', () => {
  describe('exportData', () => {
    it('uses EXPORT_VERSION 3 and carries NO wsEndpoints key', () => {
      // Create an endpoint (it ships with one standard "Success" variant).
      const created = endpointService.create({ method: 'GET', path: '/api/users', name: 'Users' });
      expect(created.responseVariants?.length).toBeGreaterThanOrEqual(1);

      const data = exportData();

      expect(EXPORT_VERSION).toBe(3);
      expect(data.version).toBe(3);

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
        ['collections', 'endpoints', 'exportedAt', 'version'].sort(),
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
});
