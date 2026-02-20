import type { Endpoint } from '../models/endpoint.js';
import * as endpointRepo from '../repositories/endpoint.repo.js';

// key = "METHOD /path"
const registry = new Map<string, Endpoint>();

export function buildKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

export function reload(): void {
  registry.clear();
  const endpoints = endpointRepo.findAll();
  for (const ep of endpoints) {
    if (ep.isEnabled) {
      registry.set(buildKey(ep.method, ep.path), ep);
    }
  }
}

export function match(method: string, path: string): Endpoint | undefined {
  return registry.get(buildKey(method, path));
}

export function add(ep: Endpoint): void {
  if (ep.isEnabled) {
    registry.set(buildKey(ep.method, ep.path), ep);
  }
}

export function remove(method: string, path: string): void {
  registry.delete(buildKey(method, path));
}

export function update(ep: Endpoint): void {
  const key = buildKey(ep.method, ep.path);
  if (ep.isEnabled) {
    registry.set(key, ep);
  } else {
    registry.delete(key);
  }
}
