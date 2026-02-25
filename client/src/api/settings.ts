import { api } from './client';
import type { Settings, ServerStatus } from '../types';

export const settingsApi = {
  getAll: () => api.get<Settings>('/api/settings'),
  update: (data: Partial<Settings>) => api.put<Settings>('/api/settings', data),
  getServerStatus: () => api.get<ServerStatus>('/api/server/status'),
  restartServer: () => api.post<{ success: boolean; port?: number }>('/api/server/restart'),
};
