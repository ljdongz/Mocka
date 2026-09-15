import { describe, it, expect } from 'vitest';
import { parseHeartbeat, negotiateHeartbeat } from '../stomp/heartbeat.js';

describe('parseHeartbeat', () => {
  it('parses "cx,cy"', () => expect(parseHeartbeat('10000,10000')).toEqual([10000, 10000]));
  it('tolerates spaces', () => expect(parseHeartbeat(' 5000 , 0 ')).toEqual([5000, 0]));
  it('defaults to 0,0 on missing or junk', () => {
    expect(parseHeartbeat(undefined)).toEqual([0, 0]);
    expect(parseHeartbeat('')).toEqual([0, 0]);
    expect(parseHeartbeat('abc')).toEqual([0, 0]);
    expect(parseHeartbeat('-1,5')).toEqual([0, 0]);
    expect(parseHeartbeat('5000')).toEqual([0, 0]);
  });
});

describe('negotiateHeartbeat', () => {
  it.each([
    [[10000, 10000], [10000, 10000], { sendEvery: 10000, expectEvery: 10000 }],
    [[10000, 10000], [0, 0],         { sendEvery: 0,     expectEvery: 0 }],
    [[0, 0],         [10000, 10000], { sendEvery: 0,     expectEvery: 0 }],
    [[5000, 20000],  [10000, 10000], { sendEvery: 20000, expectEvery: 10000 }],
    [[20000, 5000],  [10000, 10000], { sendEvery: 10000, expectEvery: 20000 }],
    [[10000, 0],     [10000, 10000], { sendEvery: 0,     expectEvery: 10000 }],
    [[0, 10000],     [10000, 10000], { sendEvery: 10000, expectEvery: 0 }],
    [[10000, 10000], [0, 10000],     { sendEvery: 0,     expectEvery: 10000 }],
    [[10000, 10000], [10000, 0],     { sendEvery: 10000, expectEvery: 0 }],
  ])('client %j × server %j', (c, s, expected) => {
    expect(negotiateHeartbeat(c as [number, number], s as [number, number])).toEqual(expected);
  });
});
