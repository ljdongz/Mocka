import { api } from './client';
import type { Dataset } from '../types';

export const datasetsApi = {
  getAll: () => api.get<Dataset[]>('/api/datasets'),
  create: (name: string, keyField: string) =>
    api.post<Dataset>('/api/datasets', { name, keyField, records: [] }),
  update: (id: string, data: Partial<Dataset>) =>
    api.put<Dataset>(`/api/datasets/${id}`, data),
  remove: (id: string) => api.delete<{ success: boolean }>(`/api/datasets/${id}`),
};
