import type { StompConnection } from '../models/stomp.js';
import { normalizeStompPath } from '../models/stomp.js';

/**
 * In-memory snapshot of every STOMP connection with its destinations, variants
 * and presets. The frame handler reads rules from here on every frame; the
 * config service reloads it after each mutation (same idea as route-registry).
 * Disabled connections stay in the map — the mock server checks isEnabled.
 */
const byPath = new Map<string, StompConnection>();
const byId = new Map<string, StompConnection>();

export function reload(connections: StompConnection[]): void {
  byPath.clear();
  byId.clear();
  for (const c of connections) {
    byPath.set(normalizeStompPath(c.path), c);
    byId.set(c.id, c);
  }
}

export function getByPath(path: string): StompConnection | undefined {
  return byPath.get(normalizeStompPath(path));
}

export function getById(id: string): StompConnection | undefined {
  return byId.get(id);
}

export function all(): StompConnection[] {
  return [...byId.values()];
}
