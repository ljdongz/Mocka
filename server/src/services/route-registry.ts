import type { Endpoint } from '../models/endpoint.js';
import * as endpointRepo from '../repositories/endpoint.repo.js';

// Exact match registry: key = "METHOD /path"
const registry = new Map<string, Endpoint>();

// Pattern match registry: routes with :param or {param}
interface PatternRoute {
  key: string;
  method: string;
  regex: RegExp;
  paramNames: string[];
  literalCount: number; // for specificity ordering
  endpoint: Endpoint;
}
const patternRoutes: PatternRoute[] = [];

export interface MatchResult {
  endpoint: Endpoint;
  pathParams: Record<string, string>;
}

/** Strip trailing slashes (keep root "/") */
function normalizePath(p: string): string {
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

/** Check if a path contains parameter segments (:param or {param}) */
function hasParams(path: string): boolean {
  return /(?::[a-zA-Z_]\w*|\{[a-zA-Z_]\w*\})/.test(path);
}

/** Convert a path pattern to a regex and extract param names */
function compilePattern(path: string): { regex: RegExp; paramNames: string[]; literalCount: number } {
  const paramNames: string[] = [];
  let literalCount = 0;
  const segments = normalizePath(path).split('/');

  const regexStr = segments
    .map(segment => {
      // Match :paramName
      const colonMatch = segment.match(/^:([a-zA-Z_]\w*)$/);
      if (colonMatch) {
        paramNames.push(colonMatch[1]);
        return '([^/]+)';
      }
      // Match {paramName}
      const braceMatch = segment.match(/^\{([a-zA-Z_]\w*)\}$/);
      if (braceMatch) {
        paramNames.push(braceMatch[1]);
        return '([^/]+)';
      }
      // Literal segment — escape regex special chars
      literalCount++;
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');

  return { regex: new RegExp(`^${regexStr}$`), paramNames, literalCount };
}

export function buildKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}

export function reload(): void {
  registry.clear();
  patternRoutes.length = 0;
  const endpoints = endpointRepo.findAll();
  for (const ep of endpoints) {
    if (ep.isEnabled) {
      addInternal(ep);
    }
  }
}

function addInternal(ep: Endpoint): void {
  const key = buildKey(ep.method, ep.path);
  if (hasParams(ep.path)) {
    // Remove existing pattern route with the same key
    const idx = patternRoutes.findIndex(r => r.key === key);
    if (idx !== -1) patternRoutes.splice(idx, 1);

    const { regex, paramNames, literalCount } = compilePattern(ep.path);
    patternRoutes.push({ key, method: ep.method.toUpperCase(), regex, paramNames, literalCount, endpoint: ep });
    // Sort by specificity: more literal segments = higher priority
    patternRoutes.sort((a, b) => b.literalCount - a.literalCount);
  } else {
    registry.set(key, ep);
  }
}

export function match(method: string, path: string): MatchResult | undefined {
  const normalizedPath = normalizePath(path);

  // 1. Try exact match first (highest priority)
  const exact = registry.get(buildKey(method, normalizedPath));
  if (exact) {
    return { endpoint: exact, pathParams: {} };
  }

  // 2. Try pattern matching (sorted by specificity)
  const upperMethod = method.toUpperCase();
  for (const route of patternRoutes) {
    if (route.method !== upperMethod) continue;
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

export function add(ep: Endpoint): void {
  if (ep.isEnabled) {
    addInternal(ep);
  }
}

export function remove(method: string, path: string): void {
  const key = buildKey(method, path);
  if (hasParams(path)) {
    const idx = patternRoutes.findIndex(r => r.key === key);
    if (idx !== -1) patternRoutes.splice(idx, 1);
  } else {
    registry.delete(key);
  }
}

export function update(ep: Endpoint): void {
  const key = buildKey(ep.method, ep.path);
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
