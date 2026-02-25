import { randomUUID as uuid } from 'crypto';
import * as envRepo from '../repositories/environment.repo.js';
import { emit } from './domain-events.js';
import type { Environment } from '../models/environment.js';

export function getAll(): Environment[] {
  return envRepo.findAll();
}

export function getById(id: string): Environment | null {
  return envRepo.findById(id);
}

export function getActive(): Environment | null {
  return envRepo.findActive();
}

export function getActiveVariables(): Record<string, string> {
  const active = envRepo.findActive();
  return active?.variables ?? {};
}

export function create(data: { name: string }): Environment {
  const all = envRepo.findAll();
  const env = envRepo.create({
    id: uuid(),
    name: data.name,
    variables: {},
    isActive: all.length === 0,
    sortOrder: all.length,
    createdAt: '',
  });
  emit('environment:created', env);
  return env;
}

export function update(id: string, data: Partial<Environment>): Environment | null {
  const env = envRepo.update(id, data);
  if (env) emit('environment:updated', env);
  return env;
}

export function setActive(id: string | null): Environment[] {
  envRepo.setActive(id);
  const all = envRepo.findAll();
  emit('environment:active-changed', { activeId: id });
  return all;
}

export function remove(id: string): boolean {
  const ok = envRepo.remove(id);
  if (ok) emit('environment:deleted', { id });
  return ok;
}
