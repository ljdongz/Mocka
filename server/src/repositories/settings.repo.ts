import { getDb } from '../db/connection.js';
import type { Settings } from '../models/settings.js';

export function getAll(): Settings {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM settings').all() as any[];
  const raw: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
    raw[key] = row.value;
  }
  return {
    port: parseInt(raw.port, 10) || 8080,
    responseDelay: parseInt(raw.responseDelay, 10) || 0,
    autoSaveEndpoints: raw.autoSaveEndpoints !== 'false',
    historyToast: raw.historyToast !== 'false',
    theme: (raw.theme === 'light' ? 'light' : 'dark') as 'dark' | 'light',
  };
}

export function set(key: string, value: string): void {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function setAll(settings: Partial<Settings>): Settings {
  const db = getDb();
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const txn = db.transaction(() => {
    if (settings.port !== undefined) update.run('port', String(settings.port));
    if (settings.responseDelay !== undefined) update.run('response_delay', String(settings.responseDelay));
    if (settings.autoSaveEndpoints !== undefined) update.run('auto_save_endpoints', String(settings.autoSaveEndpoints));
    if (settings.historyToast !== undefined) update.run('history_toast', String(settings.historyToast));
    if (settings.theme !== undefined) update.run('theme', settings.theme);
  });
  txn();
  return getAll();
}
