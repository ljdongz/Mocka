import * as settingsRepo from '../repositories/settings.repo.js';
import type { Settings } from '../models/settings.js';

export function getAll(): Settings {
  return settingsRepo.getAll();
}

/**
 * Update settings. Port fields are validated to be integers within 1–65535;
 * invalid values are dropped (the existing value is kept) rather than persisted,
 * and a negative/non-finite response delay is clamped to 0. Valid input is unaffected.
 */
export function update(settings: Partial<Settings>): Settings {
  const sanitized: Partial<Settings> = { ...settings };

  for (const key of ['adminPort', 'port'] as const) {
    if (sanitized[key] !== undefined) {
      const n = Number(sanitized[key]);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        delete sanitized[key];
      }
    }
  }

  if (sanitized.responseDelay !== undefined) {
    const n = Number(sanitized.responseDelay);
    sanitized.responseDelay = Number.isFinite(n) && n >= 0 ? n : 0;
  }

  return settingsRepo.setAll(sanitized);
}
