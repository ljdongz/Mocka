import { v4 as uuid } from 'uuid';
import * as recordRepo from '../repositories/record.repo.js';
import type { RecordQuery } from '../repositories/record.repo.js';
import { emit } from './domain-events.js';
import type { RequestRecord } from '../models/request-record.js';

export function getAll(opts?: RecordQuery): RequestRecord[] {
  return recordRepo.findAll(opts);
}

type RecordInput = Omit<RequestRecord, 'id' | 'timestamp' | 'protocol' | 'direction' | 'sessionId'>
  & Partial<Pick<RequestRecord, 'protocol' | 'direction' | 'sessionId'>>;

/** Record an HTTP request (default) or a STOMP frame made through the mock server. */
export function record(data: RecordInput): RequestRecord {
  const rec: RequestRecord = {
    id: uuid(),
    protocol: 'http',
    direction: null,
    sessionId: null,
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
