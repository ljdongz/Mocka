import { describe, it, expect } from 'vitest';
import { normalizePath, hasParams, compilePattern, buildKey } from '../models/route-path.js';

describe('normalizePath', () => {
  it('removes trailing slash', () => {
    expect(normalizePath('/api/users/')).toBe('/api/users');
  });

  it('preserves root "/"', () => {
    expect(normalizePath('/')).toBe('/');
  });

  it('leaves already normalized path unchanged', () => {
    expect(normalizePath('/api/users')).toBe('/api/users');
  });

  it('removes multiple trailing slashes', () => {
    expect(normalizePath('/api/users///')).toBe('/api/users');
  });
});

describe('hasParams', () => {
  it('detects :param style', () => {
    expect(hasParams('/api/users/:id')).toBe(true);
  });

  it('detects {param} style', () => {
    expect(hasParams('/api/users/{userId}')).toBe(true);
  });

  it('returns false for no params', () => {
    expect(hasParams('/api/users')).toBe(false);
  });

  it('returns false for root path', () => {
    expect(hasParams('/')).toBe(false);
  });
});

describe('compilePattern', () => {
  it('generates regex that matches path with :param', () => {
    const { regex, paramNames } = compilePattern('/api/users/:id');
    expect(regex.test('/api/users/42')).toBe(true);
    expect(regex.test('/api/users/')).toBe(false);
    expect(paramNames).toEqual(['id']);
  });

  it('generates regex that matches path with {param}', () => {
    const { regex, paramNames } = compilePattern('/api/users/{userId}');
    expect(regex.test('/api/users/99')).toBe(true);
    expect(paramNames).toEqual(['userId']);
  });

  it('extracts multiple param names in order', () => {
    const { paramNames } = compilePattern('/api/users/:userId/posts/:postId');
    expect(paramNames).toEqual(['userId', 'postId']);
  });

  it('counts literal segments correctly', () => {
    const { literalCount } = compilePattern('/api/users/:id');
    // segments: "", "api", "users", ":id" → literals: "", "api", "users" = 3
    expect(literalCount).toBe(3);
  });

  it('strips trailing slash before compiling', () => {
    const { regex } = compilePattern('/api/users/:id/');
    expect(regex.test('/api/users/42')).toBe(true);
  });
});

describe('buildKey', () => {
  it('uppercases method', () => {
    expect(buildKey('get', '/api/users')).toBe('GET /api/users');
  });

  it('normalizes trailing slash in path', () => {
    expect(buildKey('GET', '/api/users/')).toBe('GET /api/users');
  });

  it('preserves root path', () => {
    expect(buildKey('POST', '/')).toBe('POST /');
  });

  it('handles method already uppercase', () => {
    expect(buildKey('DELETE', '/api/items')).toBe('DELETE /api/items');
  });
});
