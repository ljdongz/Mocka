import { getDb } from '../db/connection.js';
import type { SequencePreset } from '../models/sequence-preset.js';

function rowToPreset(row: any): SequencePreset {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    name: row.name,
    mode: row.mode,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export function findByEndpointId(endpointId: string): SequencePreset[] {
  const db = getDb();
  return db.prepare('SELECT * FROM sequence_presets WHERE endpoint_id = ? ORDER BY sort_order').all(endpointId).map(rowToPreset);
}

export function findById(id: string): SequencePreset | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sequence_presets WHERE id = ?').get(id) as any;
  return row ? rowToPreset(row) : null;
}

export function create(p: SequencePreset): SequencePreset {
  const db = getDb();
  db.prepare(
    'INSERT INTO sequence_presets (id, endpoint_id, name, mode, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).run(p.id, p.endpointId, p.name, p.mode, p.sortOrder);
  return findById(p.id)!;
}

export function update(id: string, data: Partial<SequencePreset>): SequencePreset | null {
  const db = getDb();
  const existing = findById(id);
  if (!existing) return null;
  db.prepare(
    'UPDATE sequence_presets SET name=?, mode=?, sort_order=? WHERE id=?'
  ).run(
    data.name ?? existing.name,
    data.mode ?? existing.mode,
    data.sortOrder ?? existing.sortOrder,
    id,
  );
  return findById(id);
}

export function remove(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM sequence_presets WHERE id = ?').run(id);
  return result.changes > 0;
}
