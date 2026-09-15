import { getDb } from '../db/connection.js';
import type { StompDestination } from '../models/stomp.js';
import { findByDestinationId as findVariants, findPresetsByDestinationId as findPresets } from './stomp-variant.repo.js';

export function rowToDestination(row: any): StompDestination {
  return {
    id: row.id,
    connectionId: row.connection_id,
    name: row.name ?? '',
    pattern: row.pattern,
    trigger: row.trigger_type,
    isEnabled: !!row.is_enabled,
    activeVariantId: row.active_variant_id ?? null,
    activePresetId: row.active_preset_id ?? null,
    sequenceMode: row.sequence_mode ?? 'off',
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hydrate(d: StompDestination): StompDestination {
  d.variants = findVariants(d.id);
  d.presets = findPresets(d.id);
  return d;
}

export function findByConnectionId(connectionId: string): StompDestination[] {
  return getDb().prepare('SELECT * FROM stomp_destinations WHERE connection_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(connectionId).map(rowToDestination).map(hydrate);
}

export function findById(id: string): StompDestination | null {
  const row = getDb().prepare('SELECT * FROM stomp_destinations WHERE id = ?').get(id) as any;
  return row ? hydrate(rowToDestination(row)) : null;
}

export type NewStompDestination = Omit<StompDestination, 'createdAt' | 'updatedAt' | 'variants' | 'presets'>;

export function create(d: NewStompDestination): StompDestination {
  getDb().prepare(`
    INSERT INTO stomp_destinations (id, connection_id, name, pattern, trigger_type, is_enabled, active_variant_id, active_preset_id, sequence_mode, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(d.id, d.connectionId, d.name ?? '', d.pattern, d.trigger, d.isEnabled ? 1 : 0, d.activeVariantId, d.activePresetId, d.sequenceMode ?? 'off', d.sortOrder);
  return findById(d.id)!;
}

export function update(id: string, data: Partial<StompDestination>): StompDestination | null {
  const existing = findById(id);
  if (!existing) return null;
  getDb().prepare(`
    UPDATE stomp_destinations SET name=?, pattern=?, trigger_type=?, is_enabled=?, active_variant_id=?, active_preset_id=?, sequence_mode=?, sort_order=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    data.name ?? existing.name,
    data.pattern ?? existing.pattern,
    data.trigger ?? existing.trigger,
    (data.isEnabled ?? existing.isEnabled) ? 1 : 0,
    data.activeVariantId !== undefined ? data.activeVariantId : existing.activeVariantId,
    data.activePresetId !== undefined ? data.activePresetId : existing.activePresetId,
    data.sequenceMode ?? existing.sequenceMode,
    data.sortOrder ?? existing.sortOrder,
    id,
  );
  return findById(id);
}

export function remove(id: string): boolean {
  return getDb().prepare('DELETE FROM stomp_destinations WHERE id = ?').run(id).changes > 0;
}

export function toggleEnabled(id: string): StompDestination | null {
  getDb().prepare("UPDATE stomp_destinations SET is_enabled = NOT is_enabled, updated_at = datetime('now') WHERE id = ?").run(id);
  return findById(id);
}

export function setActiveVariant(id: string, variantId: string | null): StompDestination | null {
  getDb().prepare("UPDATE stomp_destinations SET active_variant_id = ?, updated_at = datetime('now') WHERE id = ?").run(variantId, id);
  return findById(id);
}

export function setActivePreset(id: string, presetId: string | null): StompDestination | null {
  getDb().prepare("UPDATE stomp_destinations SET active_preset_id = ?, updated_at = datetime('now') WHERE id = ?").run(presetId, id);
  return findById(id);
}

export function reorder(orderedIds: string[]): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE stomp_destinations SET sort_order = ? WHERE id = ?');
  db.transaction(() => { orderedIds.forEach((id, i) => stmt.run(i, id)); })();
}
