import { v4 as uuid } from 'uuid';
import * as recordRepo from '../repositories/record.repo.js';
import type { RequestRecord } from '../models/request-record.js';

export function getAll(opts?: { method?: string; search?: string; limit?: number; offset?: number }): RequestRecord[] {
  return recordRepo.findAll(opts);
}

export function record(data: Omit<RequestRecord, 'id' | 'timestamp'>): RequestRecord {
  const rec: RequestRecord = {
    id: uuid(),
    ...data,
    timestamp: new Date().toISOString(),
  };
  return recordRepo.create(rec);
}

export function clearAll(): void {
  recordRepo.clearAll();
}
