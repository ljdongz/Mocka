import { create } from 'zustand';
import { wsEndpointsApi } from '../api/ws-endpoints';
import type { WsEndpoint, WsResponseFrame } from '../types';

interface WsEndpointStore {
  endpoints: WsEndpoint[];
  selectedId: string | null;
  loading: boolean;
  selected: () => WsEndpoint | undefined;
  fetch: () => Promise<void>;
  select: (id: string | null) => void;
  createEndpoint: (path: string, name?: string) => Promise<WsEndpoint>;
  updateEndpoint: (id: string, data: Partial<WsEndpoint>) => Promise<void>;
  deleteEndpoint: (id: string) => Promise<void>;
  toggleEnabled: (id: string) => Promise<void>;
  setActiveFrame: (id: string, frameId: string | null) => Promise<void>;
  addFrame: (endpointId: string) => Promise<WsEndpoint>;
  updateFrame: (frameId: string, data: Partial<WsResponseFrame>) => Promise<void>;
  deleteFrame: (frameId: string) => Promise<void>;
  replaceEndpoint: (ep: WsEndpoint) => void;
  removeEndpointFromList: (id: string) => void;
}

export const useWsEndpointStore = create<WsEndpointStore>((set, get) => ({
  endpoints: [],
  selectedId: null,
  loading: false,

  selected: () => get().endpoints.find(e => e.id === get().selectedId),

  fetch: async () => {
    set({ loading: true });
    const endpoints = await wsEndpointsApi.getAll();
    set({ endpoints, loading: false });
  },

  select: (id) => set({ selectedId: id }),

  createEndpoint: async (path, name) => {
    const ep = await wsEndpointsApi.create({ path, name });
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
    const ep = await wsEndpointsApi.update(id, data);
    set(s => ({ endpoints: s.endpoints.map(e => e.id === id ? ep : e) }));
  },

  deleteEndpoint: async (id) => {
    await wsEndpointsApi.delete(id);
    set(s => ({
      endpoints: s.endpoints.filter(e => e.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },

  toggleEnabled: async (id) => {
    const ep = await wsEndpointsApi.toggle(id);
    set(s => ({ endpoints: s.endpoints.map(e => e.id === id ? ep : e) }));
  },

  setActiveFrame: async (id, frameId) => {
    const ep = await wsEndpointsApi.setActiveFrame(id, frameId);
    set(s => ({ endpoints: s.endpoints.map(e => e.id === id ? ep : e) }));
  },

  addFrame: async (endpointId) => {
    const ep = await wsEndpointsApi.addFrame(endpointId);
    set(s => ({ endpoints: s.endpoints.map(e => e.id === endpointId ? ep : e) }));
    return ep;
  },

  updateFrame: async (frameId, data) => {
    await wsEndpointsApi.updateFrame(frameId, data);
    const ep = get().endpoints.find(e => e.responseFrames?.some(f => f.id === frameId));
    if (ep) {
      const updated = await wsEndpointsApi.getById(ep.id);
      set(s => ({ endpoints: s.endpoints.map(e => e.id === ep.id ? updated : e) }));
    }
  },

  deleteFrame: async (frameId) => {
    const ep = get().endpoints.find(e => e.responseFrames?.some(f => f.id === frameId));
    await wsEndpointsApi.deleteFrame(frameId);
    if (ep) {
      const updated = await wsEndpointsApi.getById(ep.id);
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
