import { create } from 'zustand';
import { endpointsApi } from '../api/endpoints';
import type { Endpoint, HttpMethod, ResponseVariant, QueryParam, RequestHeader } from '../types';

interface EndpointStore {
  endpoints: Endpoint[];
  selectedId: string | null;
  loading: boolean;
  selected: () => Endpoint | undefined;
  fetch: () => Promise<void>;
  select: (id: string | null) => void;
  createEndpoint: (method: HttpMethod, path: string, name?: string, collectionId?: string) => Promise<Endpoint>;
  updateEndpoint: (id: string, data: Partial<Endpoint>) => Promise<void>;
  deleteEndpoint: (id: string) => Promise<void>;
  toggleEnabled: (id: string) => Promise<void>;
  setActiveVariant: (id: string, variantId: string | null) => Promise<void>;
  addVariant: (endpointId: string) => Promise<void>;
  updateVariant: (variantId: string, data: Partial<ResponseVariant>) => Promise<void>;
  deleteVariant: (variantId: string) => Promise<void>;
  replaceEndpoint: (ep: Endpoint) => void;
  removeEndpointFromList: (id: string) => void;
}

export const useEndpointStore = create<EndpointStore>((set, get) => ({
  endpoints: [],
  selectedId: null,
  loading: false,

  selected: () => get().endpoints.find(e => e.id === get().selectedId),

  fetch: async () => {
    set({ loading: true });
    const endpoints = await endpointsApi.getAll();
    set({ endpoints, loading: false });
  },

  select: (id) => set({ selectedId: id }),

  createEndpoint: async (method, path, name, collectionId) => {
    const ep = await endpointsApi.create({ method, path, name: name || undefined, collectionId });
    set(s => {
      const exists = s.endpoints.some(e => e.id === ep.id);
      return {
        endpoints: exists
          ? s.endpoints.map(e => e.id === ep.id ? ep : e)
          : [...s.endpoints, ep],
        selectedId: ep.id,
      };
    });
    return ep;
  },

  updateEndpoint: async (id, data) => {
    const ep = await endpointsApi.update(id, data);
    set(s => ({ endpoints: s.endpoints.map(e => e.id === id ? ep : e) }));
  },

  deleteEndpoint: async (id) => {
    await endpointsApi.delete(id);
    set(s => ({
      endpoints: s.endpoints.filter(e => e.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },

  toggleEnabled: async (id) => {
    const ep = await endpointsApi.toggle(id);
    set(s => ({ endpoints: s.endpoints.map(e => e.id === id ? ep : e) }));
  },

  setActiveVariant: async (id, variantId) => {
    const ep = await endpointsApi.setActiveVariant(id, variantId);
    set(s => ({ endpoints: s.endpoints.map(e => e.id === id ? ep : e) }));
  },

  addVariant: async (endpointId) => {
    const ep = await endpointsApi.addVariant(endpointId);
    set(s => ({ endpoints: s.endpoints.map(e => e.id === endpointId ? ep : e) }));
  },

  updateVariant: async (variantId, data) => {
    await endpointsApi.updateVariant(variantId, data);
    // Refetch the parent endpoint
    const ep = get().endpoints.find(e => e.responseVariants?.some(v => v.id === variantId));
    if (ep) {
      const updated = await endpointsApi.getById(ep.id);
      set(s => ({ endpoints: s.endpoints.map(e => e.id === ep.id ? updated : e) }));
    }
  },

  deleteVariant: async (variantId) => {
    const ep = get().endpoints.find(e => e.responseVariants?.some(v => v.id === variantId));
    await endpointsApi.deleteVariant(variantId);
    if (ep) {
      const updated = await endpointsApi.getById(ep.id);
      set(s => ({ endpoints: s.endpoints.map(e => e.id === ep.id ? updated : e) }));
    }
  },

  replaceEndpoint: (ep) => {
    set(s => {
      const exists = s.endpoints.some(e => e.id === ep.id);
      if (exists) return { endpoints: s.endpoints.map(e => e.id === ep.id ? ep : e) };
      return { endpoints: [...s.endpoints, ep] };
    });
  },

  removeEndpointFromList: (id) => {
    set(s => ({
      endpoints: s.endpoints.filter(e => e.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },
}));
