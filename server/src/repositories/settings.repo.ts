import { getDb } from '../db/connection.js';
import type { Settings } from '../models/settings.js';

export function getAll(): Settings {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM settings').all() as any[];
  const settings: any = {};
  for (const row of rows) {
    const key = row.key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
    settings[key] = row.value;
  }
  return settings as Settings;
}

export function set(key: string, value: string): void {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function setAll(settings: Partial<Settings>): Settings {
  const db = getDb();
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const txn = db.transaction(() => {
    if (settings.port !== undefined) update.run('port', settings.port);
    if (settings.responseDelay !== undefined) update.run('response_delay', settings.responseDelay);
    if (settings.autoSaveEndpoints !== undefined) update.run('auto_save_endpoints', settings.autoSaveEndpoints);
    if (settings.historyToast !== undefined) update.run('history_toast', settings.historyToast);
  });
  txn();
  return getAll();
}
