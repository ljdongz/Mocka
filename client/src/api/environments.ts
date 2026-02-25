import { api } from './client';
import type { Environment } from '../types';

export const environmentsApi = {
  getAll: () => api.get<Environment[]>('/api/environments'),
  create: (name: string) => api.post<Environment>('/api/environments', { name }),
  update: (id: string, data: Partial<Environment>) => api.put<Environment>(`/api/environments/${id}`, data),
  setActive: (id: string | null) => api.patch<Environment[]>('/api/environments/active', { id }),
  remove: (id: string) => api.delete<{ success: boolean }>(`/api/environments/${id}`),
};
