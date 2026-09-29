import { api } from './client';
import type { Collection } from '../types';

export const collectionsApi = {
  getAll: () => api.get<Collection[]>('/api/collections'),
  create: (name: string, parentId: string | null = null) => api.post<Collection>('/api/collections', { name, parentId }),
  move: (id: string, parentId: string | null, index?: number) => api.put<Collection>(`/api/collections/${id}/move`, { parentId, index }),
  update: (id: string, data: { name?: string }) => api.put<Collection>(`/api/collections/${id}`, data),
  delete: (id: string) => api.delete(`/api/collections/${id}`),
  toggleExpanded: (id: string) => api.patch<Collection>(`/api/collections/${id}/toggle`, {}),
  moveEndpoint: (data: { endpointId: string; fromCollectionId: string | null; toCollectionId: string; sortOrder: number }) =>
    api.put('/api/collections/move-endpoint', data),
  place: (data: { type: 'collection' | 'endpoint'; id: string; fromCollectionId: string | null; parentId: string | null; index: number }) =>
    api.put('/api/collections/place', data),
  removeEndpointFromCollection: (collectionId: string, endpointId: string) =>
    api.delete(`/api/collections/${collectionId}/endpoints/${endpointId}`),
  reorderCollections: (orderedIds: string[]) =>
    api.put('/api/collections/reorder', { orderedIds }),
  reorderEndpoints: (collectionId: string, orderedEndpointIds: string[]) =>
    api.put(`/api/collections/${collectionId}/reorder-endpoints`, { orderedEndpointIds }),
};
