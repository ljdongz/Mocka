import { describe, it, expect, beforeEach } from 'vitest';
import * as wsRegistry from '../services/ws-registry.js';
import type { WsEndpoint } from '../models/ws-endpoint.js';

function makeWsEndpoint(overrides: Partial<WsEndpoint> & { id: string; path: string }): WsEndpoint {
  return {
    name: '',
    isEnabled: true,
    activeFrameId: null,
    createdAt: '',
    updatedAt: '',
    responseFrames: [],
    ...overrides,
  };
}

beforeEach(() => {
  wsRegistry.reload([]);
});

describe('ws-registry: exact path matching', () => {
  it('matches an exact path', () => {
    const ep = makeWsEndpoint({ id: 'e1', path: '/chat' });
    wsRegistry.add(ep);
    const result = wsRegistry.match('/chat');
    expect(result).toBeDefined();
    expect(result!.endpoint.id).toBe('e1');
    expect(result!.pathParams).toEqual({});
  });

  it('returns undefined for unknown path', () => {
    expect(wsRegistry.match('/unknown')).toBeUndefined();
  });

  it('normalizes trailing slashes on match', () => {
    const ep = makeWsEndpoint({ id: 'e1', path: '/chat' });
    wsRegistry.add(ep);
    expect(wsRegistry.match('/chat/')).toBeDefined();
  });
});

describe('ws-registry: parameterized path matching', () => {
  it('matches :param paths and extracts params', () => {
    const ep = makeWsEndpoint({ id: 'e2', path: '/rooms/:roomId' });
    wsRegistry.add(ep);
    const result = wsRegistry.match('/rooms/42');
    expect(result).toBeDefined();
    expect(result!.endpoint.id).toBe('e2');
    expect(result!.pathParams).toEqual({ roomId: '42' });
  });

  it('extracts multiple path params', () => {
    const ep = makeWsEndpoint({ id: 'e3', path: '/rooms/:roomId/users/:userId' });
    wsRegistry.add(ep);
    const result = wsRegistry.match('/rooms/5/users/9');
    expect(result).toBeDefined();
    expect(result!.pathParams).toEqual({ roomId: '5', userId: '9' });
  });

  it('prefers exact match over param match', () => {
    const exact = makeWsEndpoint({ id: 'exact', path: '/rooms/special' });
    const param = makeWsEndpoint({ id: 'param', path: '/rooms/:id' });
    wsRegistry.add(exact);
    wsRegistry.add(param);
    const result = wsRegistry.match('/rooms/special');
    expect(result!.endpoint.id).toBe('exact');
  });
});

describe('ws-registry: disabled endpoints', () => {
  it('does not add disabled endpoints', () => {
    const ep = makeWsEndpoint({ id: 'e4', path: '/chat', isEnabled: false });
    wsRegistry.add(ep);
    expect(wsRegistry.match('/chat')).toBeUndefined();
  });

  it('removes from registry when updated to disabled', () => {
    const ep = makeWsEndpoint({ id: 'e5', path: '/live' });
    wsRegistry.add(ep);
    expect(wsRegistry.match('/live')).toBeDefined();
    wsRegistry.update({ ...ep, isEnabled: false });
    expect(wsRegistry.match('/live')).toBeUndefined();
  });

  it('adds back when updated to enabled', () => {
    const ep = makeWsEndpoint({ id: 'e6', path: '/live', isEnabled: false });
    wsRegistry.add(ep);
    expect(wsRegistry.match('/live')).toBeUndefined();
    wsRegistry.update({ ...ep, isEnabled: true });
    expect(wsRegistry.match('/live')).toBeDefined();
  });
});

describe('ws-registry: reload', () => {
  it('clears and rebuilds registry', () => {
    const ep1 = makeWsEndpoint({ id: 'e7', path: '/old' });
    wsRegistry.add(ep1);
    expect(wsRegistry.match('/old')).toBeDefined();

    const ep2 = makeWsEndpoint({ id: 'e8', path: '/new' });
    wsRegistry.reload([ep2]);
    expect(wsRegistry.match('/old')).toBeUndefined();
    expect(wsRegistry.match('/new')).toBeDefined();
  });

  it('skips disabled endpoints during reload', () => {
    const ep = makeWsEndpoint({ id: 'e9', path: '/disabled', isEnabled: false });
    wsRegistry.reload([ep]);
    expect(wsRegistry.match('/disabled')).toBeUndefined();
  });
});

describe('ws-registry: remove', () => {
  it('removes an exact path endpoint', () => {
    const ep = makeWsEndpoint({ id: 'e10', path: '/temp' });
    wsRegistry.add(ep);
    wsRegistry.remove('/temp');
    expect(wsRegistry.match('/temp')).toBeUndefined();
  });

  it('removes a parameterized path endpoint', () => {
    const ep = makeWsEndpoint({ id: 'e11', path: '/items/:id' });
    wsRegistry.add(ep);
    wsRegistry.remove('/items/:id');
    expect(wsRegistry.match('/items/1')).toBeUndefined();
  });
});
