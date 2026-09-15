import { describe, it, expect, beforeEach } from 'vitest';
import * as broker from '../stomp/broker.js';

const sub = (sessionId: string, subscriptionId: string, destination: string, connectionId = 'c1') =>
  ({ connectionId, sessionId, subscriptionId, destination });

beforeEach(() => broker.resetAll());

describe('broker subscriptions', () => {
  it('matches literal and pattern subscriptions', () => {
    broker.subscribe(sub('s1', 'a', '/topic/rooms/88'));
    broker.subscribe(sub('s2', 'b', '/topic/rooms/*'));
    broker.subscribe(sub('s3', 'c', '/topic/other'));
    const hits = broker.matchSubscribers('c1', '/topic/rooms/88');
    expect(hits.map(h => h.sessionId).sort()).toEqual(['s1', 's2']);
    expect(broker.matchSubscribers('c2', '/topic/rooms/88')).toEqual([]);
  });

  it('isolates connections', () => {
    broker.subscribe(sub('s1', 'a', '/topic/x', 'c1'));
    broker.subscribe(sub('s9', 'a', '/topic/x', 'c2'));
    expect(broker.matchSubscribers('c1', '/topic/x').map(s => s.sessionId)).toEqual(['s1']);
  });

  it('keeps /user queues out of broadcast unless addressed as /user', () => {
    broker.subscribe(sub('s1', 'a', '/user/queue/inbox'));
    broker.subscribe(sub('s1', 'b', '/queue/inbox'));
    expect(broker.matchSubscribers('c1', '/queue/inbox').map(s => s.subscriptionId)).toEqual(['b']);
    expect(broker.matchSubscribers('c1', '/user/queue/inbox').map(s => s.subscriptionId)).toEqual(['a']);
  });

  it('matchUserSubscribers rewrites /queue/inbox to the session\'s /user/queue/inbox', () => {
    broker.subscribe(sub('s1', 'a', '/user/queue/inbox'));
    broker.subscribe(sub('s2', 'a', '/user/queue/inbox'));
    broker.subscribe(sub('s1', 'b', '/queue/inbox'));
    const hits = broker.matchUserSubscribers('c1', 's1', '/queue/inbox');
    expect(hits).toHaveLength(1);
    expect(hits[0].subscriptionId).toBe('a');
    expect(hits[0].destination).toBe('/user/queue/inbox');
    expect(broker.matchUserSubscribers('c1', 's1', '/user/queue/inbox')).toHaveLength(1);
    expect(broker.matchUserSubscribers('c1', 's1', '/queue/other')).toHaveLength(0);
  });

  it('re-subscribing with the same id replaces, unsubscribe removes', () => {
    broker.subscribe(sub('s1', 'a', '/topic/one'));
    broker.subscribe(sub('s1', 'a', '/topic/two'));
    expect(broker.listSubscriptions('c1')).toHaveLength(1);
    expect(broker.matchSubscribers('c1', '/topic/two')).toHaveLength(1);
    expect(broker.unsubscribe('c1', 's1', 'a')).toBe(true);
    expect(broker.unsubscribe('c1', 's1', 'a')).toBe(false);
    expect(broker.listSubscriptions('c1')).toHaveLength(0);
  });

  it('unsubscribeSession and clearConnection', () => {
    broker.subscribe(sub('s1', 'a', '/topic/one'));
    broker.subscribe(sub('s1', 'b', '/topic/two'));
    broker.subscribe(sub('s2', 'a', '/topic/one'));
    broker.unsubscribeSession('c1', 's1');
    expect(broker.listSubscriptions('c1').map(s => s.sessionId)).toEqual(['s2']);
    broker.clearConnection('c1');
    expect(broker.listSubscriptions('c1')).toEqual([]);
  });

  it('countSubscribers counts overlap in both directions', () => {
    broker.subscribe(sub('s1', 'a', '/topic/rooms/88'));
    broker.subscribe(sub('s2', 'b', '/topic/rooms/*'));
    broker.subscribe(sub('s3', 'c', '/topic/other'));
    expect(broker.countSubscribers('c1', '/topic/rooms/88')).toBe(2);
    expect(broker.countSubscribers('c1', '/topic/rooms/*')).toBe(2);
    expect(broker.countSubscribers('c1', '/topic/**')).toBe(3);
    expect(broker.countSubscribers('c1', '/app/x')).toBe(0);
  });
});

describe('broker replay buffer', () => {
  it('stores per literal destination, trims to size, replays to matching patterns', () => {
    broker.pushReplay('c1', { destination: '/topic/rooms/88', body: '1', headers: {} }, 2);
    broker.pushReplay('c1', { destination: '/topic/rooms/88', body: '2', headers: {} }, 2);
    broker.pushReplay('c1', { destination: '/topic/rooms/88', body: '3', headers: {} }, 2);
    broker.pushReplay('c1', { destination: '/topic/other', body: 'x', headers: {} }, 2);
    expect(broker.takeReplay('c1', '/topic/rooms/*').map(e => e.body)).toEqual(['2', '3']);
    expect(broker.takeReplay('c1', '/topic/rooms/88').map(e => e.body)).toEqual(['2', '3']);
    expect(broker.takeReplay('c1', '/topic/**').map(e => e.body)).toEqual(['2', '3', 'x']);
    expect(broker.takeReplay('c1', '/app/x')).toEqual([]);
    expect(broker.takeReplay('c2', '/topic/rooms/88')).toEqual([]);
    // size 0 never stores
    broker.pushReplay('c1', { destination: '/topic/zero', body: 'z', headers: {} }, 0);
    expect(broker.takeReplay('c1', '/topic/zero')).toEqual([]);
  });
});
