import { getDb } from '../db/connection.js';
import type { StompConnection } from '../models/stomp.js';
import { findByConnectionId as findDestinations } from './stomp-destination.repo.js';

export function rowToConnection(row: any): StompConnection {
  let requiredHeaders: string[] = [];
  try { requiredHeaders = row.required_headers ? JSON.parse(row.required_headers) : []; } catch { requiredHeaders = []; }
  return {
    id: row.id,
    name: row.name ?? '',
    path: row.path,
    isEnabled: !!row.is_enabled,
    connectPolicy: row.connect_policy ?? 'accept',
    requiredHeaders,
    rejectMessage: row.reject_message ?? '',
    heartbeatOutgoing: row.heartbeat_outgoing ?? 0,
    heartbeatIncoming: row.heartbeat_incoming ?? 0,
    stompVersion: row.stomp_version ?? '1.2',
    defaultDelay: row.default_delay ?? null,
    replayBufferSize: row.replay_buffer_size ?? 0,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hydrate(c: StompConnection): StompConnection {
  c.destinations = findDestinations(c.id);
  return c;
}

export function findAll(): StompConnection[] {
  const db = getDb();
  return db.prepare('SELECT * FROM stomp_connections ORDER BY sort_order ASC, created_at ASC').all()
    .map(rowToConnection).map(hydrate);
}

export function findById(id: string): StompConnection | null {
  const row = getDb().prepare('SELECT * FROM stomp_connections WHERE id = ?').get(id) as any;
  return row ? hydrate(rowToConnection(row)) : null;
}

export function findByPath(path: string): StompConnection | null {
  const row = getDb().prepare('SELECT * FROM stomp_connections WHERE path = ?').get(path) as any;
  return row ? hydrate(rowToConnection(row)) : null;
}

export type NewStompConnection = Omit<StompConnection, 'createdAt' | 'updatedAt' | 'destinations'>;

export function create(c: NewStompConnection): StompConnection {
  getDb().prepare(`
    INSERT INTO stomp_connections (id, name, path, is_enabled, connect_policy, required_headers, reject_message,
      heartbeat_outgoing, heartbeat_incoming, stomp_version, default_delay, replay_buffer_size, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(c.id, c.name ?? '', c.path, c.isEnabled ? 1 : 0, c.connectPolicy, JSON.stringify(c.requiredHeaders ?? []),
    c.rejectMessage, c.heartbeatOutgoing, c.heartbeatIncoming, c.stompVersion, c.defaultDelay, c.replayBufferSize, c.sortOrder);
  return findById(c.id)!;
}

export function update(id: string, data: Partial<StompConnection>): StompConnection | null {
  const db = getDb();
  const existing = findById(id);
  if (!existing) return null;
  db.prepare(`
    UPDATE stomp_connections SET name=?, path=?, is_enabled=?, connect_policy=?, required_headers=?, reject_message=?,
      heartbeat_outgoing=?, heartbeat_incoming=?, stomp_version=?, default_delay=?, replay_buffer_size=?, sort_order=?,
      updated_at=datetime('now')
    WHERE id=?
  `).run(
    data.name ?? existing.name,
    data.path ?? existing.path,
    (data.isEnabled ?? existing.isEnabled) ? 1 : 0,
    data.connectPolicy ?? existing.connectPolicy,
    JSON.stringify(data.requiredHeaders ?? existing.requiredHeaders),
    data.rejectMessage ?? existing.rejectMessage,
    data.heartbeatOutgoing ?? existing.heartbeatOutgoing,
    data.heartbeatIncoming ?? existing.heartbeatIncoming,
    data.stompVersion ?? existing.stompVersion,
    data.defaultDelay !== undefined ? data.defaultDelay : existing.defaultDelay,
    data.replayBufferSize ?? existing.replayBufferSize,
    data.sortOrder ?? existing.sortOrder,
    id,
  );
  return findById(id);
}

export function remove(id: string): boolean {
  return getDb().prepare('DELETE FROM stomp_connections WHERE id = ?').run(id).changes > 0;
}

export function toggleEnabled(id: string): StompConnection | null {
  getDb().prepare("UPDATE stomp_connections SET is_enabled = NOT is_enabled, updated_at = datetime('now') WHERE id = ?").run(id);
  return findById(id);
}

export function reorder(orderedIds: string[]): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE stomp_connections SET sort_order = ? WHERE id = ?');
  db.transaction(() => { orderedIds.forEach((id, i) => stmt.run(i, id)); })();
}
