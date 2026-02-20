import * as settingsRepo from '../repositories/settings.repo.js';
import type { Settings } from '../models/settings.js';

export function getAll(): Settings {
  return settingsRepo.getAll();
}

export function update(settings: Partial<Settings>): Settings {
  return settingsRepo.setAll(settings);
}
