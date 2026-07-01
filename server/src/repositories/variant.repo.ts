import { getDb } from '../db/connection.js';
import type { ResponseVariant } from '../models/response-variant.js';

export function rowToVariant(row: any): ResponseVariant {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    statusCode: row.status_code,
    description: row.description,
    body: row.body,
    headers: row.headers,
    delay: row.delay,
    memo: row.memo,
    sortOrder: row.sort_order,
    matchRules: row.match_rules ? JSON.parse(row.match_rules) : null,
    variantGroup: row.variant_group ?? 'standard',
    presetId: row.preset_id ?? null,
    datasetBinding: row.dataset_binding ? JSON.parse(row.dataset_binding) : null,
  };
}

export function findByEndpointId(endpointId: string, group?: 'standard' | 'sequence'): ResponseVariant[] {
  const db = getDb();
  if (group) {
    return db.prepare('SELECT * FROM response_variants WHERE endpoint_id = ? AND variant_group = ? ORDER BY sort_order').all(endpointId, group).map(rowToVariant);
  }
  return db.prepare('SELECT * FROM response_variants WHERE endpoint_id = ? ORDER BY sort_order').all(endpointId).map(rowToVariant);
}

export function findByPresetId(presetId: string): ResponseVariant[] {
  const db = getDb();
  return db.prepare('SELECT * FROM response_variants WHERE preset_id = ? ORDER BY sort_order').all(presetId).map(rowToVariant);
}

export function findById(id: string): ResponseVariant | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM response_variants WHERE id = ?').get(id) as any;
  return row ? rowToVariant(row) : null;
}

export function create(v: ResponseVariant): ResponseVariant {
  const db = getDb();
  db.prepare(`
    INSERT INTO response_variants (id, endpoint_id, status_code, description, body, headers, delay, memo, sort_order, match_rules, variant_group, preset_id, dataset_binding)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(v.id, v.endpointId, v.statusCode, v.description, v.body, v.headers, v.delay, v.memo, v.sortOrder,
    v.matchRules ? JSON.stringify(v.matchRules) : null, v.variantGroup ?? 'standard', v.presetId ?? null,
    v.datasetBinding ? JSON.stringify(v.datasetBinding) : null);
  return findById(v.id)!;
}

export function update(id: string, data: Partial<ResponseVariant>): ResponseVariant | null {
  const db = getDb();
  const existing = findById(id);
  if (!existing) return null;

  const matchRules = data.matchRules !== undefined
    ? (data.matchRules ? JSON.stringify(data.matchRules) : null)
    : (existing.matchRules ? JSON.stringify(existing.matchRules) : null);

  const datasetBinding = data.datasetBinding !== undefined
    ? (data.datasetBinding ? JSON.stringify(data.datasetBinding) : null)
    : (existing.datasetBinding ? JSON.stringify(existing.datasetBinding) : null);

  db.prepare(`
    UPDATE response_variants SET status_code=?, description=?, body=?, headers=?, delay=?, memo=?, sort_order=?, match_rules=?, variant_group=?, preset_id=?, dataset_binding=?
    WHERE id=?
  `).run(
    data.statusCode ?? existing.statusCode,
    data.description ?? existing.description,
    data.body ?? existing.body,
    data.headers ?? existing.headers,
    data.delay !== undefined ? data.delay : existing.delay,
    data.memo ?? existing.memo,
    data.sortOrder ?? existing.sortOrder,
    matchRules,
    data.variantGroup ?? existing.variantGroup,
    data.presetId !== undefined ? data.presetId : existing.presetId,
    datasetBinding,
    id,
  );
  return findById(id);
}

export function remove(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM response_variants WHERE id = ?').run(id);
  return result.changes > 0;
}
