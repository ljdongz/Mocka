export interface SequencePreset {
  id: string;
  endpointId: string;
  name: string;
  mode: 'sequential' | 'loop';
  sortOrder: number;
  createdAt: string;
}

export function resolveActivePresetAfterRemoval(
  currentActivePresetId: string | null,
  removedPresetId: string,
  remainingPresets: ReadonlyArray<{ id: string }>,
): string | null {
  if (currentActivePresetId === removedPresetId) {
    return remainingPresets[0]?.id ?? null;
  }
  return currentActivePresetId;
}
