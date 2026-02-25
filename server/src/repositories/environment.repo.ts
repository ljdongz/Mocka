import { getDb } from '../db/connection.js';
import type { Environment } from '../models/environment.js';

function rowToEnv(row: any): Environment {
  return {
    id: row.id,
    name: row.name,
    variables: JSON.parse(row.variables || '{}'),
    isActive: !!row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export function findAll(): Environment[] {
  const db = getDb();
  return db.prepare('SELECT * FROM environments ORDER BY sort_order').all().map(rowToEnv);
}

export function findById(id: string): Environment | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM environments WHERE id = ?').get(id) as any;
  return row ? rowToEnv(row) : null;
}

export function findActive(): Environment | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM environments WHERE is_active = 1').get() as any;
  return row ? rowToEnv(row) : null;
}

export function create(env: Environment): Environment {
  const db = getDb();
  db.prepare(`
    INSERT INTO environments (id, name, variables, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(env.id, env.name, JSON.stringify(env.variables), env.isActive ? 1 : 0, env.sortOrder);
  return findById(env.id)!;
}

export function update(id: string, data: Partial<Environment>): Environment | null {
  const db = getDb();
  const existing = findById(id);
  if (!existing) return null;

  db.prepare(`
    UPDATE environments SET name=?, variables=?, is_active=?, sort_order=?
    WHERE id=?
  `).run(
    data.name ?? existing.name,
    data.variables !== undefined ? JSON.stringify(data.variables) : JSON.stringify(existing.variables),
    data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
    data.sortOrder ?? existing.sortOrder,
    id,
  );
  return findById(id);
}

export function setActive(id: string | null): void {
  const db = getDb();
  db.prepare('UPDATE environments SET is_active = 0').run();
  if (id) {
    db.prepare('UPDATE environments SET is_active = 1 WHERE id = ?').run(id);
  }
}

export function remove(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM environments WHERE id = ?').run(id);
  return result.changes > 0;
}
