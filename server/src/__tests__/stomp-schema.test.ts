import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, getDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as recordRepo from '../repositories/record.repo.js';
import { normalizeStompPath } from '../models/stomp.js';

beforeEach(() => { initDb(':memory:'); initSchema(); });

describe('stomp schema', () => {
  it('creates the four stomp tables', () => {
    const names = (getDb().prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name);
    expect(names).toEqual(expect.arrayContaining(['stomp_connections', 'stomp_destinations', 'stomp_message_variants', 'stomp_presets']));
  });

  it('adds protocol/direction/session_id to request_records and is idempotent', () => {
    initSchema();
    const cols = (getDb().prepare('PRAGMA table_info(request_records)').all() as { name: string }[]).map(c => c.name);
    expect(cols).toEqual(expect.arrayContaining(['protocol', 'direction', 'session_id']));
  });

  it('migrates a legacy request_records table without the new columns', () => {
    const db = getDb();
    db.exec('DROP TABLE request_records');
    db.exec(`CREATE TABLE request_records (
      id TEXT PRIMARY KEY, method TEXT NOT NULL, path TEXT NOT NULL, status_code INTEGER NOT NULL DEFAULT 0,
      body_or_params TEXT NOT NULL DEFAULT '', request_headers TEXT NOT NULL DEFAULT '{}',
      response_body TEXT NOT NULL DEFAULT '', timestamp TEXT NOT NULL DEFAULT (datetime('now')))`);
    initSchema();
    const cols = (db.prepare('PRAGMA table_info(request_records)').all() as { name: string }[]).map(c => c.name);
    expect(cols).toEqual(expect.arrayContaining(['protocol', 'direction', 'session_id']));
  });

  it('records and filters stomp frames by protocol', () => {
    recordRepo.create({ id: 'a', method: 'GET', path: '/x', statusCode: 200, bodyOrParams: '{}', requestHeaders: '{}', responseBody: '', timestamp: '', protocol: 'http', direction: null, sessionId: null });
    recordRepo.create({ id: 'b', method: 'SEND', path: '/app/x', statusCode: 0, bodyOrParams: '{}', requestHeaders: '{}', responseBody: '', timestamp: '', protocol: 'stomp', direction: 'in', sessionId: 's1' });
    expect(recordRepo.findAll({ protocol: 'stomp' }).map(r => r.id)).toEqual(['b']);
    expect(recordRepo.findAll({ protocol: 'http' }).map(r => r.id)).toEqual(['a']);
    expect(recordRepo.findAll().length).toBe(2);
    const stomp = recordRepo.findAll({ protocol: 'stomp' })[0];
    expect(stomp.sessionId).toBe('s1');
    expect(stomp.direction).toBe('in');
    expect(recordRepo.findAll({ protocol: 'http' })[0].protocol).toBe('http');
  });

  it('normalizes paths', () => {
    expect(normalizeStompPath('api/app/ws/chat/')).toBe('/api/app/ws/chat');
    expect(normalizeStompPath('//ws//stomp')).toBe('/ws/stomp');
    expect(normalizeStompPath('')).toBe('/');
    expect(normalizeStompPath('/')).toBe('/');
  });
});
