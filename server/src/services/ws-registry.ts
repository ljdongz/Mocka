import type { WsEndpoint } from '../models/ws-endpoint.js';
import { normalizePath, hasParams, compilePattern } from '../models/route-path.js';

// Exact match registry: key = normalized path
const registry = new Map<string, WsEndpoint>();

// Pattern match registry: paths with :param or {param}
interface PatternRoute {
  key: string;
  regex: RegExp;
  paramNames: string[];
  literalCount: number;
  endpoint: WsEndpoint;
}
const patternRoutes: PatternRoute[] = [];

export interface WsMatchResult {
  endpoint: WsEndpoint;
  pathParams: Record<string, string>;
}

export function reload(endpoints: WsEndpoint[]): void {
  registry.clear();
  patternRoutes.length = 0;
  for (const ep of endpoints) {
    if (ep.isEnabled) {
      addInternal(ep);
    }
  }
}

function addInternal(ep: WsEndpoint): void {
  const key = normalizePath(ep.path);
  if (hasParams(ep.path)) {
    const idx = patternRoutes.findIndex(r => r.key === key);
    if (idx !== -1) patternRoutes.splice(idx, 1);
    const { regex, paramNames, literalCount } = compilePattern(ep.path);
    patternRoutes.push({ key, regex, paramNames, literalCount, endpoint: ep });
    patternRoutes.sort((a, b) => b.literalCount - a.literalCount);
  } else {
    registry.set(key, ep);
  }
}

export function match(path: string): WsMatchResult | undefined {
  const normalizedPath = normalizePath(path);

  // 1. Exact match first
  const exact = registry.get(normalizedPath);
  if (exact) {
    return { endpoint: exact, pathParams: {} };
  }

  // 2. Pattern match (sorted by specificity)
  for (const route of patternRoutes) {
    const m = normalizedPath.match(route.regex);
    if (m) {
      const pathParams: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        pathParams[name] = m[i + 1];
      });
      return { endpoint: route.endpoint, pathParams };
    }
  }

  return undefined;
}

export function add(ep: WsEndpoint): void {
  if (ep.isEnabled) {
    addInternal(ep);
  }
}

export function remove(path: string): void {
  const key = normalizePath(path);
  if (hasParams(path)) {
    const idx = patternRoutes.findIndex(r => r.key === key);
    if (idx !== -1) patternRoutes.splice(idx, 1);
  } else {
    registry.delete(key);
  }
}

export function update(ep: WsEndpoint): void {
  const key = normalizePath(ep.path);
  if (ep.isEnabled) {
    addInternal(ep);
  } else {
    if (hasParams(ep.path)) {
      const idx = patternRoutes.findIndex(r => r.key === key);
      if (idx !== -1) patternRoutes.splice(idx, 1);
    } else {
      registry.delete(key);
    }
  }
}
