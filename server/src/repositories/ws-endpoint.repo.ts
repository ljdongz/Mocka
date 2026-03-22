import { getDb } from '../db/connection.js';
import type { WsEndpoint, WsResponseFrame } from '../models/ws-endpoint.js';
import type { MatchRules } from '../models/response-variant.js';

function rowToFrame(row: any): WsResponseFrame {
  return {
    id: row.id,
    wsEndpointId: row.ws_endpoint_id,
    trigger: row.trigger ?? 'message',
    label: row.label,
    messageBody: row.message_body,
    delay: row.delay,
    intervalMin: row.interval_min ?? null,
    intervalMax: row.interval_max ?? null,
    memo: row.memo,
    sortOrder: row.sort_order,
    matchRules: row.match_rules ? (JSON.parse(row.match_rules) as MatchRules) : null,
  };
}

function rowToWsEndpoint(row: any): WsEndpoint {
  return {
    id: row.id,
    path: row.path,
    name: row.name ?? '',
    isEnabled: !!row.is_enabled,
    activeFrameId: row.active_frame_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function findAll(): WsEndpoint[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM ws_endpoints ORDER BY created_at ASC').all();
  return rows.map((row: any) => {
    const ep = rowToWsEndpoint(row);
    ep.responseFrames = db
      .prepare('SELECT * FROM ws_response_frames WHERE ws_endpoint_id = ? ORDER BY sort_order')
      .all(ep.id)
      .map(rowToFrame);
    return ep;
  });
}

export function findById(id: string): WsEndpoint | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM ws_endpoints WHERE id = ?').get(id) as any;
  if (!row) return null;
  const ep = rowToWsEndpoint(row);
  ep.responseFrames = db
    .prepare('SELECT * FROM ws_response_frames WHERE ws_endpoint_id = ? ORDER BY sort_order')
    .all(id)
    .map(rowToFrame);
  return ep;
}

export function findByPath(path: string): WsEndpoint | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM ws_endpoints WHERE path = ?').get(path) as any;
  if (!row) return null;
  const ep = rowToWsEndpoint(row);
  ep.responseFrames = db
    .prepare('SELECT * FROM ws_response_frames WHERE ws_endpoint_id = ? ORDER BY sort_order')
    .all(ep.id)
    .map(rowToFrame);
  return ep;
}

export function create(ep: WsEndpoint): WsEndpoint {
  const db = getDb();
  db.prepare(`
    INSERT INTO ws_endpoints (id, path, name, is_enabled, active_frame_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(ep.id, ep.path, ep.name ?? '', ep.isEnabled ? 1 : 0, ep.activeFrameId ?? null);
  return findById(ep.id)!;
}

export function update(id: string, data: Partial<WsEndpoint>): WsEndpoint | null {
  const db = getDb();
  const existing = findById(id);
  if (!existing) return null;

  const path = data.path ?? existing.path;
  const name = data.name !== undefined ? data.name : existing.name;
  const isEnabled = data.isEnabled !== undefined ? data.isEnabled : existing.isEnabled;
  const activeFrameId = data.activeFrameId !== undefined ? data.activeFrameId : existing.activeFrameId;

  db.prepare(`
    UPDATE ws_endpoints SET path=?, name=?, is_enabled=?, active_frame_id=?, updated_at=datetime('now')
    WHERE id=?
  `).run(path, name, isEnabled ? 1 : 0, activeFrameId ?? null, id);

  return findById(id);
}

export function remove(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM ws_endpoints WHERE id = ?').run(id);
  return result.changes > 0;
}

export function toggleEnabled(id: string): WsEndpoint | null {
  const db = getDb();
  db.prepare("UPDATE ws_endpoints SET is_enabled = NOT is_enabled, updated_at = datetime('now') WHERE id = ?").run(id);
  return findById(id);
}

export function setActiveFrame(id: string, frameId: string | null): WsEndpoint | null {
  const db = getDb();
  db.prepare("UPDATE ws_endpoints SET active_frame_id = ?, updated_at = datetime('now') WHERE id = ?").run(frameId, id);
  return findById(id);
}

// ── Frame CRUD ────────────────────────────────────────────────────────────────

export function findFrameById(id: string): WsResponseFrame | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM ws_response_frames WHERE id = ?').get(id) as any;
  return row ? rowToFrame(row) : null;
}

export function findFramesByEndpointId(wsEndpointId: string): WsResponseFrame[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM ws_response_frames WHERE ws_endpoint_id = ? ORDER BY sort_order')
    .all(wsEndpointId)
    .map(rowToFrame);
}

export function createFrame(frame: WsResponseFrame): WsResponseFrame {
  const db = getDb();
  db.prepare(`
    INSERT INTO ws_response_frames (id, ws_endpoint_id, trigger, label, message_body, delay, interval_min, interval_max, memo, sort_order, match_rules)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    frame.id,
    frame.wsEndpointId,
    frame.trigger ?? 'message',
    frame.label,
    frame.messageBody,
    frame.delay ?? null,
    frame.intervalMin ?? null,
    frame.intervalMax ?? null,
    frame.memo,
    frame.sortOrder,
    frame.matchRules ? JSON.stringify(frame.matchRules) : null,
  );
  return findFrameById(frame.id)!;
}

export function updateFrame(id: string, data: Partial<WsResponseFrame>): WsResponseFrame | null {
  const db = getDb();
  const existing = findFrameById(id);
  if (!existing) return null;

  const matchRules = data.matchRules !== undefined
    ? (data.matchRules ? JSON.stringify(data.matchRules) : null)
    : (existing.matchRules ? JSON.stringify(existing.matchRules) : null);

  db.prepare(`
    UPDATE ws_response_frames
    SET trigger=?, label=?, message_body=?, delay=?, interval_min=?, interval_max=?, memo=?, sort_order=?, match_rules=?
    WHERE id=?
  `).run(
    data.trigger ?? existing.trigger,
    data.label ?? existing.label,
    data.messageBody ?? existing.messageBody,
    data.delay !== undefined ? data.delay : existing.delay,
    data.intervalMin !== undefined ? data.intervalMin : existing.intervalMin,
    data.intervalMax !== undefined ? data.intervalMax : existing.intervalMax,
    data.memo ?? existing.memo,
    data.sortOrder ?? existing.sortOrder,
    matchRules,
    id,
  );
  return findFrameById(id);
}

export function removeFrame(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM ws_response_frames WHERE id = ?').run(id);
  return result.changes > 0;
}
