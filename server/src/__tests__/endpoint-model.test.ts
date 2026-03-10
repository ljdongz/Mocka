import { describe, it, expect } from 'vitest';
import { resolveActiveVariantAfterRemoval } from '../models/endpoint.js';

describe('resolveActiveVariantAfterRemoval', () => {
  it('returns first remaining variant when active variant is removed', () => {
    const result = resolveActiveVariantAfterRemoval(
      'variant-1',
      'variant-1',
      [{ id: 'variant-2' }, { id: 'variant-3' }],
    );
    expect(result).toBe('variant-2');
  });

  it('returns null when active variant is removed and no variants remain', () => {
    const result = resolveActiveVariantAfterRemoval(
      'variant-1',
      'variant-1',
      [],
    );
    expect(result).toBeNull();
  });

  it('returns current active variant when a non-active variant is removed', () => {
    const result = resolveActiveVariantAfterRemoval(
      'variant-1',
      'variant-2',
      [{ id: 'variant-1' }, { id: 'variant-3' }],
    );
    expect(result).toBe('variant-1');
  });

  it('returns null when currentActiveVariantId is null and any variant is removed', () => {
    const result = resolveActiveVariantAfterRemoval(
      null,
      'variant-1',
      [{ id: 'variant-2' }],
    );
    expect(result).toBeNull();
  });

  it('returns first remaining variant when active is removed with single remaining', () => {
    const result = resolveActiveVariantAfterRemoval(
      'variant-1',
      'variant-1',
      [{ id: 'variant-2' }],
    );
    expect(result).toBe('variant-2');
  });
});
