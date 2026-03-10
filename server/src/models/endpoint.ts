import type { HttpMethod } from './http-method.js';
import type { ResponseVariant } from './response-variant.js';

/**
 * Determine the next active variant ID after a variant is removed.
 * - If the removed variant was active: return the first remaining variant's ID (or null if none)
 * - If the removed variant was not active: return the current active variant ID unchanged
 */
export function resolveActiveVariantAfterRemoval(
  currentActiveVariantId: string | null,
  removedVariantId: string,
  remainingVariants: ReadonlyArray<{ id: string }>,
): string | null {
  if (currentActiveVariantId === removedVariantId) {
    return remainingVariants[0]?.id ?? null;
  }
  return currentActiveVariantId;
}

export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  name: string;
  activeVariantId: string | null;
  isEnabled: boolean;
  requestBodyContentType: string;
  requestBodyRaw: string;
  createdAt: string;
  updatedAt: string;
  queryParams?: QueryParam[];
  requestHeaders?: RequestHeader[];
  responseVariants?: ResponseVariant[];
}

export interface QueryParam {
  id: string;
  endpointId: string;
  key: string;
  value: string;
  isEnabled: boolean;
  sortOrder: number;
}

export interface RequestHeader {
  id: string;
  endpointId: string;
  key: string;
  value: string;
  isEnabled: boolean;
  sortOrder: number;
}
