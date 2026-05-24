import { api } from './client';
import type { Endpoint, HttpMethod, ResponseVariant, SequencePreset } from '../types';

export const endpointsApi = {
  getAll: () => api.get<Endpoint[]>('/api/endpoints'),
  getById: (id: string) => api.get<Endpoint>(`/api/endpoints/${id}`),
  create: (data: { method: HttpMethod; path: string; name?: string; collectionId?: string }) => api.post<Endpoint>('/api/endpoints', data),
  update: (id: string, data: Partial<Endpoint>) => api.put<Endpoint>(`/api/endpoints/${id}`, data),
  delete: (id: string) => api.delete(`/api/endpoints/${id}`),
  toggle: (id: string) => api.patch<Endpoint>(`/api/endpoints/${id}/toggle`),
  setActiveVariant: (id: string, variantId: string | null) => api.patch<Endpoint>(`/api/endpoints/${id}/active-variant`, { variantId }),
  addVariant: (id: string, data?: Partial<ResponseVariant>) => api.post<Endpoint>(`/api/endpoints/${id}/variants`, data),
  updateVariant: (id: string, data: Partial<ResponseVariant>) => api.put<ResponseVariant>(`/api/variants/${id}`, data),
  deleteVariant: (id: string) => api.delete(`/api/variants/${id}`),
  resetSequence: (id: string) => api.post(`/api/endpoints/${id}/sequence/reset`),
  createPreset: (endpointId: string, data?: { name?: string; mode?: string }) => api.post<SequencePreset>(`/api/endpoints/${endpointId}/presets`, data),
  updatePreset: (presetId: string, data: Partial<SequencePreset>) => api.put<SequencePreset>(`/api/presets/${presetId}`, data),
  deletePreset: (presetId: string) => api.delete(`/api/presets/${presetId}`),
  setActivePreset: (endpointId: string, presetId: string | null) => api.patch<Endpoint>(`/api/endpoints/${endpointId}/active-preset`, { presetId }),
  addPresetVariant: (presetId: string, data?: { statusCode?: number; description?: string }) => api.post<Endpoint>(`/api/presets/${presetId}/variants`, data),
};
