import { api } from './client';
import type { RequestRecord } from '../types';

export const historyApi = {
  getAll: (params?: { method?: string; search?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.method) qs.set('method', params.method);
    if (params?.search) qs.set('search', params.search);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return api.get<RequestRecord[]>(`/api/history${query ? '?' + query : ''}`);
  },
  clearAll: () => api.delete('/api/history'),
};
