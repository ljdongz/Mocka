import { getDb } from '../db/connection.js';
import type { StompMessageVariant, StompPreset } from '../models/stomp.js';

export function rowToVariant(row: any): StompMessageVariant {
  return {
    id: row.id,
    destinationId: row.destination_id,
    description: row.description ?? '',
    kind: row.kind ?? 'message',
    targetDestination: row.target_destination ?? '',
    scope: row.scope ?? 'broadcast',
    body: row.body ?? '',
    headers: row.headers ?? '{}',
    delay: row.delay ?? null,
    repeatIntervalMs: row.repeat_interval_ms ?? null,
    repeatCount: row.repeat_count ?? null,
    matchRules: row.match_rules ? JSON.parse(row.match_rules) : null,
    datasetBinding: row.dataset_binding ? JSON.parse(row.dataset_binding) : null,
    variantGroup: row.variant_group ?? 'standard',
    presetId: row.preset_id ?? null,
    memo: row.memo ?? '',
    sortOrder: row.sort_order ?? 0,
  };
}

export function rowToPreset(row: any): StompPreset {
  return {
    id: row.id,
    destinationId: row.destination_id,
    name: row.name,
    mode: row.mode,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
  };
}

// ── variants ──

export function findByDestinationId(destinationId: string, group?: 'standard' | 'sequence'): StompMessageVariant[] {
  const db = getDb();
  if (group) {
    return db.prepare('SELECT * FROM stomp_message_variants WHERE destination_id = ? AND variant_group = ? ORDER BY sort_order')
      .all(destinationId, group).map(rowToVariant);
  }
  return db.prepare('SELECT * FROM stomp_message_variants WHERE destination_id = ? ORDER BY sort_order').all(destinationId).map(rowToVariant);
}

export function findByPresetId(presetId: string): StompMessageVariant[] {
  return getDb().prepare('SELECT * FROM stomp_message_variants WHERE preset_id = ? ORDER BY sort_order').all(presetId).map(rowToVariant);
}

export function findById(id: string): StompMessageVariant | null {
  const row = getDb().prepare('SELECT * FROM stomp_message_variants WHERE id = ?').get(id) as any;
  return row ? rowToVariant(row) : null;
}

export function create(v: StompMessageVariant): StompMessageVariant {
  getDb().prepare(`
    INSERT INTO stomp_message_variants (id, destination_id, description, kind, target_destination, scope, body, headers, delay,
      repeat_interval_ms, repeat_count, match_rules, dataset_binding, variant_group, preset_id, memo, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(v.id, v.destinationId, v.description, v.kind, v.targetDestination ?? '', v.scope, v.body, v.headers, v.delay,
    v.repeatIntervalMs, v.repeatCount,
    v.matchRules ? JSON.stringify(v.matchRules) : null,
    v.datasetBinding ? JSON.stringify(v.datasetBinding) : null,
    v.variantGroup ?? 'standard', v.presetId ?? null, v.memo ?? '', v.sortOrder);
  return findById(v.id)!;
}

export function update(id: string, data: Partial<StompMessageVariant>): StompMessageVariant | null {
  const existing = findById(id);
  if (!existing) return null;

  const matchRules = data.matchRules !== undefined ? data.matchRules : existing.matchRules;
  const datasetBinding = data.datasetBinding !== undefined ? data.datasetBinding : existing.datasetBinding;

  getDb().prepare(`
    UPDATE stomp_message_variants SET description=?, kind=?, target_destination=?, scope=?, body=?, headers=?, delay=?,
      repeat_interval_ms=?, repeat_count=?, match_rules=?, dataset_binding=?, variant_group=?, preset_id=?, memo=?, sort_order=?
    WHERE id=?
  `).run(
    data.description ?? existing.description,
    data.kind ?? existing.kind,
    data.targetDestination ?? existing.targetDestination,
    data.scope ?? existing.scope,
    data.body ?? existing.body,
    data.headers ?? existing.headers,
    data.delay !== undefined ? data.delay : existing.delay,
    data.repeatIntervalMs !== undefined ? data.repeatIntervalMs : existing.repeatIntervalMs,
    data.repeatCount !== undefined ? data.repeatCount : existing.repeatCount,
    matchRules ? JSON.stringify(matchRules) : null,
    datasetBinding ? JSON.stringify(datasetBinding) : null,
    data.variantGroup ?? existing.variantGroup,
    data.presetId !== undefined ? data.presetId : existing.presetId,
    data.memo ?? existing.memo,
    data.sortOrder ?? existing.sortOrder,
    id,
  );
  return findById(id);
}

export function remove(id: string): boolean {
  return getDb().prepare('DELETE FROM stomp_message_variants WHERE id = ?').run(id).changes > 0;
}

export function reorder(orderedIds: string[]): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE stomp_message_variants SET sort_order = ? WHERE id = ?');
  db.transaction(() => { orderedIds.forEach((id, i) => stmt.run(i, id)); })();
}

// ── presets ──

export function findPresetsByDestinationId(destinationId: string): StompPreset[] {
  return getDb().prepare('SELECT * FROM stomp_presets WHERE destination_id = ? ORDER BY sort_order').all(destinationId).map(rowToPreset);
}

export function findPresetById(id: string): StompPreset | null {
  const row = getDb().prepare('SELECT * FROM stomp_presets WHERE id = ?').get(id) as any;
  return row ? rowToPreset(row) : null;
}

export function createPreset(p: Omit<StompPreset, 'createdAt'>): StompPreset {
  getDb().prepare('INSERT INTO stomp_presets (id, destination_id, name, mode, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(p.id, p.destinationId, p.name, p.mode, p.sortOrder);
  return findPresetById(p.id)!;
}

export function updatePreset(id: string, data: Partial<StompPreset>): StompPreset | null {
  const existing = findPresetById(id);
  if (!existing) return null;
  getDb().prepare('UPDATE stomp_presets SET name=?, mode=?, sort_order=? WHERE id=?')
    .run(data.name ?? existing.name, data.mode ?? existing.mode, data.sortOrder ?? existing.sortOrder, id);
  return findPresetById(id);
}

export function removePreset(id: string): boolean {
  return getDb().prepare('DELETE FROM stomp_presets WHERE id = ?').run(id).changes > 0;
}
