import { describe, it, expect, beforeEach } from 'vitest';
import { getNextIndex, peek, reset, resetAll, cleanup } from '../services/sequence-counter.service.js';

describe('sequence-counter', () => {
  beforeEach(() => {
    resetAll();
  });

  it('returns 0 on first call', () => {
    expect(getNextIndex('ep1', 3, 'sequential')).toBe(0);
  });

  it('sequential mode stops at last variant', () => {
    expect(getNextIndex('ep1', 2, 'sequential')).toBe(0);
    expect(getNextIndex('ep1', 2, 'sequential')).toBe(1);
    expect(getNextIndex('ep1', 2, 'sequential')).toBe(1);
    expect(getNextIndex('ep1', 2, 'sequential')).toBe(1);
  });

  it('loop mode wraps around', () => {
    expect(getNextIndex('ep1', 2, 'loop')).toBe(0);
    expect(getNextIndex('ep1', 2, 'loop')).toBe(1);
    expect(getNextIndex('ep1', 2, 'loop')).toBe(0);
    expect(getNextIndex('ep1', 2, 'loop')).toBe(1);
  });

  it('peek does not advance counter', () => {
    expect(peek('ep1')).toBe(0);
    getNextIndex('ep1', 3, 'sequential');
    expect(peek('ep1')).toBe(1);
    expect(peek('ep1')).toBe(1);
  });

  it('reset sets counter back to 0', () => {
    getNextIndex('ep1', 3, 'sequential');
    getNextIndex('ep1', 3, 'sequential');
    reset('ep1');
    expect(getNextIndex('ep1', 3, 'sequential')).toBe(0);
  });

  it('resetAll clears all counters', () => {
    getNextIndex('ep1', 3, 'sequential');
    getNextIndex('ep2', 3, 'sequential');
    resetAll();
    expect(peek('ep1')).toBe(0);
    expect(peek('ep2')).toBe(0);
  });

  it('cleanup removes specific endpoint counter', () => {
    getNextIndex('ep1', 3, 'sequential');
    getNextIndex('ep2', 3, 'sequential');
    cleanup('ep1');
    expect(peek('ep1')).toBe(0);
    expect(peek('ep2')).toBe(1);
  });

  it('handles zero variantCount', () => {
    expect(getNextIndex('ep1', 0, 'sequential')).toBe(0);
    expect(getNextIndex('ep1', 0, 'loop')).toBe(0);
  });

  it('endpoints have independent counters', () => {
    expect(getNextIndex('ep1', 3, 'sequential')).toBe(0);
    expect(getNextIndex('ep2', 3, 'sequential')).toBe(0);
    expect(getNextIndex('ep1', 3, 'sequential')).toBe(1);
    expect(getNextIndex('ep2', 3, 'sequential')).toBe(1);
  });
});
