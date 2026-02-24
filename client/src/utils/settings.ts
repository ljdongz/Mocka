import type { Settings, SettingsDTO } from '../types';

export function parseSettings(dto: SettingsDTO): Settings {
  return {
    port: parseInt(dto.port, 10) || 8080,
    responseDelay: parseInt(dto.responseDelay, 10) || 0,
    autoSaveEndpoints: dto.autoSaveEndpoints === 'true',
    historyToast: dto.historyToast === 'true',
  };
}

export function toSettingsDTO(settings: Partial<Settings>): Partial<SettingsDTO> {
  const dto: Partial<SettingsDTO> = {};
  if (settings.port !== undefined) dto.port = String(settings.port);
  if (settings.responseDelay !== undefined) dto.responseDelay = String(settings.responseDelay);
  if (settings.autoSaveEndpoints !== undefined) dto.autoSaveEndpoints = settings.autoSaveEndpoints ? 'true' : 'false';
  if (settings.historyToast !== undefined) dto.historyToast = settings.historyToast ? 'true' : 'false';
  return dto;
}
