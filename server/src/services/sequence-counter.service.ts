const counters = new Map<string, number>();

export function getNextIndex(
  endpointId: string,
  variantCount: number,
  mode: 'sequential' | 'loop',
): number {
  if (variantCount === 0) return 0;

  const current = counters.get(endpointId) ?? 0;

  if (mode === 'loop') {
    const index = current % variantCount;
    counters.set(endpointId, current + 1);
    return index;
  }

  // sequential — stop at last
  const index = Math.min(current, variantCount - 1);
  if (current < variantCount) {
    counters.set(endpointId, current + 1);
  }
  return index;
}

export function peek(endpointId: string): number {
  return counters.get(endpointId) ?? 0;
}

export function reset(endpointId: string): void {
  counters.delete(endpointId);
}

export function resetAll(): void {
  counters.clear();
}

export function cleanup(endpointId: string): void {
  counters.delete(endpointId);
}
