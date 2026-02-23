import { api } from './client';
import type { Collection } from '../types';

export const collectionsApi = {
  getAll: () => api.get<Collection[]>('/api/collections'),
  create: (name: string) => api.post<Collection>('/api/collections', { name }),
  update: (id: string, data: { name?: string }) => api.put<Collection>(`/api/collections/${id}`, data),
  delete: (id: string) => api.delete(`/api/collections/${id}`),
  toggleExpanded: (id: string) => api.patch<Collection>(`/api/collections/${id}/toggle`, {}),
  moveEndpoint: (data: { endpointId: string; fromCollectionId: string | null; toCollectionId: string; sortOrder: number }) =>
    api.put('/api/collections/move-endpoint', data),
  removeEndpointFromCollection: (collectionId: string, endpointId: string) =>
    api.delete(`/api/collections/${collectionId}/endpoints/${endpointId}`),
  reorderCollections: (orderedIds: string[]) =>
    api.put('/api/collections/reorder', { orderedIds }),
  reorderEndpoints: (collectionId: string, orderedEndpointIds: string[]) =>
    api.put(`/api/collections/${collectionId}/reorder-endpoints`, { orderedEndpointIds }),
};
