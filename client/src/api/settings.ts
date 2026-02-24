import { api } from './client';
import type { SettingsDTO, ServerStatus } from '../types';

export const settingsApi = {
  getAll: () => api.get<SettingsDTO>('/api/settings'),
  update: (data: Partial<SettingsDTO>) => api.put<SettingsDTO>('/api/settings', data),
  getServerStatus: () => api.get<ServerStatus>('/api/server/status'),
  restartServer: () => api.post<{ success: boolean; port?: number }>('/api/server/restart'),
};
