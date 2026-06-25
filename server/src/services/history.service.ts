import { v4 as uuid } from 'uuid';
import * as recordRepo from '../repositories/record.repo.js';
import { emit } from './domain-events.js';
import type { RequestRecord, HttpRequestRecord } from '../models/request-record.js';

export function getAll(opts?: { method?: string; search?: string; limit?: number; offset?: number; protocol?: string }): RequestRecord[] {
  return recordRepo.findAll(opts);
}

/**
 * Record an HTTP request. Backward-compatible: callers that omit `protocol`
 * are treated as HTTP automatically.
 */
export function record(data: Omit<HttpRequestRecord, 'id' | 'timestamp' | 'protocol'>): RequestRecord {
  const rec: HttpRequestRecord = {
    protocol: 'http',
    id: uuid(),
    ...data,
    timestamp: new Date().toISOString(),
  };
  const created = recordRepo.create(rec);
  emit('history:new', created);
  return created;
}

export function clearAll(): void {
  recordRepo.clearAll();
  emit('history:cleared', null);
}
