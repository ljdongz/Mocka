import { randomUUID as uuid } from 'crypto';
import * as datasetRepo from '../repositories/dataset.repo.js';
import { emit } from './domain-events.js';
import type { Dataset } from '../models/dataset.js';

export function getAll(): Dataset[] {
  return datasetRepo.findAll();
}

export function getById(id: string): Dataset | null {
  return datasetRepo.findById(id);
}

export function create(input: { name: string; keyField: string; records?: any[] }): Dataset {
  const ds = datasetRepo.create({
    id: uuid(),
    name: input.name,
    keyField: input.keyField,
    records: input.records ?? [],
  });
  emit('dataset:created', ds);
  return ds;
}

export function update(
  id: string,
  data: Partial<Pick<Dataset, 'name' | 'keyField' | 'records'>>,
): Dataset | null {
  const ds = datasetRepo.update(id, data);
  if (ds) emit('dataset:updated', ds);
  return ds;
}

export function remove(id: string): boolean {
  const ok = datasetRepo.remove(id);
  if (ok) emit('dataset:deleted', { id });
  return ok;
}
