import { api } from './client';
import type {
  StompConnection, StompDestination, StompMessageVariant, StompPreset, StompSessionInfo,
  StompPushOptions, StompFireOutcome, StompInjectPayload, StompStats, StompTrigger,
} from '../types';

export interface StompImportResult {
  created: boolean;
  overwritten: boolean;
  skipped: boolean;
  destinations: number;
  errors: string[];
}

export const stompApi = {
  // connections
  getConnections: () => api.get<StompConnection[]>('/api/stomp/connections'),
  getConnection: (id: string) => api.get<StompConnection>(`/api/stomp/connections/${id}`),
  createConnection: (data: { path: string; name?: string } & Partial<StompConnection>) => api.post<StompConnection>('/api/stomp/connections', data),
  updateConnection: (id: string, data: Partial<StompConnection>) => api.put<StompConnection>(`/api/stomp/connections/${id}`, data),
  deleteConnection: (id: string) => api.delete(`/api/stomp/connections/${id}`),
  toggleConnection: (id: string) => api.patch<StompConnection>(`/api/stomp/connections/${id}/toggle`, {}),
  reorderConnections: (orderedIds: string[]) => api.put('/api/stomp/connections/reorder', { orderedIds }),

  // destinations
  createDestination: (connectionId: string, data: { pattern: string; trigger: StompTrigger; name?: string }) =>
    api.post<StompConnection>(`/api/stomp/connections/${connectionId}/destinations`, data),
  updateDestination: (id: string, data: Partial<StompDestination>) => api.put<StompDestination>(`/api/stomp/destinations/${id}`, data),
  deleteDestination: (id: string) => api.delete(`/api/stomp/destinations/${id}`),
  toggleDestination: (id: string) => api.patch<StompDestination>(`/api/stomp/destinations/${id}/toggle`, {}),
  setActiveVariant: (destinationId: string, variantId: string | null) =>
    api.patch<StompDestination>(`/api/stomp/destinations/${destinationId}/active-variant`, { variantId }),
  setActivePreset: (destinationId: string, presetId: string | null) =>
    api.patch<StompDestination>(`/api/stomp/destinations/${destinationId}/active-preset`, { presetId }),
  reorderDestinations: (connectionId: string, orderedIds: string[]) =>
    api.put<StompConnection>(`/api/stomp/connections/${connectionId}/destinations/reorder`, { orderedIds }),

  // variants
  addVariant: (destinationId: string, data?: Partial<StompMessageVariant>) =>
    api.post<StompDestination>(`/api/stomp/destinations/${destinationId}/variants`, data ?? {}),
  updateVariant: (id: string, data: Partial<StompMessageVariant>) => api.put<StompMessageVariant>(`/api/stomp/variants/${id}`, data),
  deleteVariant: (id: string) => api.delete(`/api/stomp/variants/${id}`),
  reorderVariants: (destinationId: string, orderedIds: string[]) =>
    api.put<StompDestination>(`/api/stomp/destinations/${destinationId}/variants/reorder`, { orderedIds }),

  // presets
  createPreset: (destinationId: string, data?: { name?: string; mode?: 'sequential' | 'loop' }) =>
    api.post<StompPreset>(`/api/stomp/destinations/${destinationId}/presets`, data ?? {}),
  updatePreset: (id: string, data: Partial<StompPreset>) => api.put<StompPreset>(`/api/stomp/presets/${id}`, data),
  deletePreset: (id: string) => api.delete(`/api/stomp/presets/${id}`),
  addPresetVariant: (presetId: string, data?: Partial<StompMessageVariant>) =>
    api.post<StompDestination>(`/api/stomp/presets/${presetId}/variants`, data ?? {}),
  resetSequence: (destinationId: string) => api.post(`/api/stomp/destinations/${destinationId}/sequence/reset`, {}),

  // import / export
  exportConnection: (id: string) => api.post<unknown>(`/api/stomp/connections/${id}/export`, {}),
  importConnection: (data: unknown, conflictPolicy: 'skip' | 'overwrite') =>
    api.post<StompImportResult>('/api/stomp/import', { data, conflictPolicy }),

  // runtime
  getSessions: (connectionId?: string) =>
    api.get<StompSessionInfo[]>(`/api/stomp/sessions${connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : ''}`),
  disconnectSession: (id: string, code?: number, reason?: string) =>
    api.delete(`/api/stomp/sessions/${id}`, { code, reason }),
  injectSession: (id: string, payload: StompInjectPayload) => api.post(`/api/stomp/sessions/${id}/inject`, payload),
  push: (connectionId: string, opts: StompPushOptions) => api.post<StompFireOutcome>(`/api/stomp/connections/${connectionId}/push`, opts),
  fireDestination: (destinationId: string, sessionId?: string | null) =>
    api.post<StompFireOutcome>(`/api/stomp/destinations/${destinationId}/fire`, { sessionId: sessionId ?? null }),
  stopRepeats: (connectionId: string) => api.delete(`/api/stomp/connections/${connectionId}/repeats`),
  getStats: (connectionId: string) => api.get<StompStats>(`/api/stomp/connections/${connectionId}/stats`),
};
