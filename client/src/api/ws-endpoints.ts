import { api } from './client';
import type { WsEndpoint, WsResponseFrame } from '../types';

export const wsEndpointsApi = {
  getAll: () => api.get<WsEndpoint[]>('/api/ws-endpoints'),
  getById: (id: string) => api.get<WsEndpoint>(`/api/ws-endpoints/${id}`),
  create: (data: { path: string; name?: string }) => api.post<WsEndpoint>('/api/ws-endpoints', data),
  update: (id: string, data: Partial<WsEndpoint>) => api.put<WsEndpoint>(`/api/ws-endpoints/${id}`, data),
  delete: (id: string) => api.delete(`/api/ws-endpoints/${id}`),
  toggle: (id: string) => api.patch<WsEndpoint>(`/api/ws-endpoints/${id}/toggle`),
  setActiveFrame: (id: string, frameId: string | null) => api.patch<WsEndpoint>(`/api/ws-endpoints/${id}/active-frame`, { frameId }),
  addFrame: (id: string, data?: Partial<WsResponseFrame>) => api.post<WsEndpoint>(`/api/ws-endpoints/${id}/frames`, data),
  updateFrame: (id: string, data: Partial<WsResponseFrame>) => api.put<WsResponseFrame>(`/api/ws-frames/${id}`, data),
  deleteFrame: (id: string) => api.delete(`/api/ws-frames/${id}`),
};
