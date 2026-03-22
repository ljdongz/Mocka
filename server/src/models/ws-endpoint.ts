import type { MatchRules } from './response-variant.js';

export type WsFrameTrigger = 'message' | 'connect';

export interface WsResponseFrame {
  id: string;
  wsEndpointId: string;
  trigger: WsFrameTrigger;
  label: string;
  messageBody: string;
  delay: number | null;
  intervalMin: number | null;
  intervalMax: number | null;
  memo: string;
  sortOrder: number;
  matchRules: MatchRules | null;
}

export interface WsEndpoint {
  id: string;
  path: string;
  name: string;
  isEnabled: boolean;
  activeFrameId: string | null;
  createdAt: string;
  updatedAt: string;
  responseFrames?: WsResponseFrame[];
}

/**
 * Determine the next active frame ID after a frame is removed.
 * Mirrors resolveActiveVariantAfterRemoval from endpoint.ts.
 */
export function resolveActiveFrameAfterRemoval(
  currentActiveFrameId: string | null,
  removedFrameId: string,
  remainingFrames: ReadonlyArray<{ id: string }>,
): string | null {
  if (currentActiveFrameId === removedFrameId) {
    return remainingFrames[0]?.id ?? null;
  }
  return currentActiveFrameId;
}
