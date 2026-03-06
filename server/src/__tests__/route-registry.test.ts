import { describe, it, expect, beforeEach } from 'vitest';

// Import internal functions directly — route-registry uses module-level state
// so we test via the public API: add, match, remove, reload
import { add, match, remove, reload, buildKey } from '../services/route-registry.js';
import type { Endpoint } from '../models/endpoint.js';
import type { ResponseVariant } from '../models/response-variant.js';

function makeEndpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 'ep-1',
    method: 'GET',
    path: '/api/users',
    name: 'Test',
    activeVariantId: 'v-1',
    isEnabled: true,
    requestBodyContentType: 'application/json',
    requestBodyRaw: '',
    createdAt: '',
    updatedAt: '',
    responseVariants: [
      {
        id: 'v-1',
        endpointId: 'ep-1',
        statusCode: 200,
        description: 'Success',
        body: '{}',
        headers: '{}',
        delay: null,
        memo: '',
        sortOrder: 0,
        matchRules: null,
      } as ResponseVariant,
    ],
    ...overrides,
  };
}

describe('route-registry', () => {
  beforeEach(() => {
    // Reset registry with empty endpoints
    reload([]);
  });

  describe('exact match', () => {
    it('matches an exact route', () => {
      const ep = makeEndpoint({ method: 'GET', path: '/api/users' });
      add(ep);

      const result = match('GET', '/api/users');
      expect(result).toBeDefined();
      expect(result!.endpoint.id).toBe('ep-1');
      expect(result!.pathParams).toEqual({});
    });

    it('returns undefined for unregistered route', () => {
      expect(match('GET', '/api/unknown')).toBeUndefined();
    });

    it('method must match', () => {
      add(makeEndpoint({ method: 'POST', path: '/api/users' }));
      expect(match('GET', '/api/users')).toBeUndefined();
      expect(match('POST', '/api/users')).toBeDefined();
    });

    it('strips trailing slash', () => {
      add(makeEndpoint({ path: '/api/users' }));
      expect(match('GET', '/api/users/')).toBeDefined();
    });
  });

  describe('pattern match', () => {
    it('matches :param style path parameters', () => {
      add(makeEndpoint({ id: 'ep-param', path: '/api/users/:id' }));

      const result = match('GET', '/api/users/42');
      expect(result).toBeDefined();
      expect(result!.endpoint.id).toBe('ep-param');
      expect(result!.pathParams).toEqual({ id: '42' });
    });

    it('matches {param} style path parameters', () => {
      add(makeEndpoint({ id: 'ep-brace', path: '/api/users/{userId}' }));

      const result = match('GET', '/api/users/99');
      expect(result).toBeDefined();
      expect(result!.pathParams).toEqual({ userId: '99' });
    });

    it('matches multiple params', () => {
      add(makeEndpoint({ id: 'ep-multi', path: '/api/users/:userId/posts/:postId' }));

      const result = match('GET', '/api/users/1/posts/2');
      expect(result).toBeDefined();
      expect(result!.pathParams).toEqual({ userId: '1', postId: '2' });
    });
  });

  describe('specificity', () => {
    it('exact match takes priority over pattern match', () => {
      add(makeEndpoint({ id: 'ep-exact', path: '/api/users/me' }));
      add(makeEndpoint({ id: 'ep-pattern', path: '/api/users/:id' }));

      const result = match('GET', '/api/users/me');
      expect(result!.endpoint.id).toBe('ep-exact');
    });

    it('more literal segments win among patterns', () => {
      add(makeEndpoint({ id: 'ep-general', path: '/api/:resource/:id' }));
      add(makeEndpoint({ id: 'ep-specific', path: '/api/users/:id' }));

      const result = match('GET', '/api/users/42');
      expect(result!.endpoint.id).toBe('ep-specific');
    });
  });

  describe('remove', () => {
    it('removes exact route', () => {
      add(makeEndpoint());
      expect(match('GET', '/api/users')).toBeDefined();

      remove('GET', '/api/users');
      expect(match('GET', '/api/users')).toBeUndefined();
    });

    it('removes pattern route', () => {
      add(makeEndpoint({ path: '/api/users/:id' }));
      expect(match('GET', '/api/users/1')).toBeDefined();

      remove('GET', '/api/users/:id');
      expect(match('GET', '/api/users/1')).toBeUndefined();
    });
  });

  describe('disabled endpoints', () => {
    it('does not register disabled endpoints', () => {
      add(makeEndpoint({ isEnabled: false }));
      expect(match('GET', '/api/users')).toBeUndefined();
    });
  });

  describe('buildKey', () => {
    it('normalizes method and path', () => {
      expect(buildKey('get', '/api/users/')).toBe('GET /api/users');
      expect(buildKey('POST', '/')).toBe('POST /');
    });
  });
});
