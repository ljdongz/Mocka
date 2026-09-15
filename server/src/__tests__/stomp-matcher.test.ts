import { describe, it, expect } from 'vitest';
import { splitSegments, matchDestination, hasWildcard } from '../stomp/destination-matcher.js';

describe('splitSegments', () => {
  it('splits on / and . and drops empties', () => {
    expect(splitSegments('/topic/rooms/88')).toEqual(['topic', 'rooms', '88']);
    expect(splitSegments('/topic/rooms.88')).toEqual(['topic', 'rooms', '88']);
    expect(splitSegments('topic//rooms/')).toEqual(['topic', 'rooms']);
    expect(splitSegments('')).toEqual([]);
  });
});

describe('matchDestination', () => {
  it('literal exact', () => {
    expect(matchDestination('/user/queue/inbox', '/user/queue/inbox')).toEqual({ captures: [] });
    expect(matchDestination('/user/queue/inbox', '/user/queue/inbox2')).toBeNull();
    expect(matchDestination('/user/queue/inbox', '/user/queue')).toBeNull();
    expect(matchDestination('/topic/rooms/88', '/topic/rooms.88')).toEqual({ captures: [] });
  });
  it('* matches one segment and captures it', () => {
    expect(matchDestination('/topic/rooms/*', '/topic/rooms/88')).toEqual({ captures: ['88'] });
    expect(matchDestination('/topic/rooms/*', '/topic/rooms/88/read')).toBeNull();
    expect(matchDestination('/topic/rooms/*', '/topic/rooms')).toBeNull();
    expect(matchDestination('/app/rooms/*/message', '/app/rooms/88/message')).toEqual({ captures: ['88'] });
    expect(matchDestination('/app/*/*/message', '/app/rooms/88/message')).toEqual({ captures: ['rooms', '88'] });
  });
  it('** matches the rest', () => {
    expect(matchDestination('/topic/**', '/topic/rooms/88/read')).toEqual({ captures: ['rooms/88/read'] });
    expect(matchDestination('/topic/**', '/topic')).toEqual({ captures: [''] });
    expect(matchDestination('/topic/**/read', '/topic/rooms/88/read')).toEqual({ captures: ['rooms/88'] });
    expect(matchDestination('/topic/**/read', '/topic/rooms/88/write')).toBeNull();
    expect(matchDestination('/**', '/anything/at/all')).toEqual({ captures: ['anything/at/all'] });
  });
  it('is not fooled by a trailing separator', () => {
    expect(matchDestination('/topic/rooms/*', '/topic/rooms/88/')).toEqual({ captures: ['88'] });
  });
  it('hasWildcard', () => {
    expect(hasWildcard('/topic/*')).toBe(true);
    expect(hasWildcard('/a/**')).toBe(true);
    expect(hasWildcard('/a/b')).toBe(false);
  });
});
