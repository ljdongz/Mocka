import { create } from 'zustand';
import { collectionsApi } from '../api/collections';
import type { Collection } from '../types';

interface CollectionStore {
  collections: Collection[];
  fetch: () => Promise<void>;
  create: (name: string) => Promise<Collection>;
  update: (id: string, data: { name?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  toggleExpanded: (id: string) => Promise<void>;
  moveEndpoint: (endpointId: string, from: string | null, to: string, sortOrder: number) => Promise<void>;
  removeEndpointFromCollection: (collectionId: string, endpointId: string) => Promise<void>;
  reorderCollections: (orderedIds: string[]) => Promise<void>;
  reorderEndpoints: (collectionId: string, orderedEndpointIds: string[]) => Promise<void>;
  replaceCollection: (c: Collection) => void;
  removeCollection: (id: string) => void;
}

export const useCollectionStore = create<CollectionStore>((set) => ({
  collections: [],

  fetch: async () => {
    const collections = await collectionsApi.getAll();
    set({ collections });
  },

  create: async (name) => {
    const c = await collectionsApi.create(name);
    set(s => {
      const exists = s.collections.some(x => x.id === c.id);
      if (exists) return { collections: s.collections.map(x => x.id === c.id ? c : x) };
      return { collections: [...s.collections, c] };
    });
    return c;
  },

  update: async (id, data) => {
    const c = await collectionsApi.update(id, data);
    set(s => ({ collections: s.collections.map(x => x.id === id ? c : x) }));
  },

  remove: async (id) => {
    await collectionsApi.delete(id);
    set(s => ({ collections: s.collections.filter(x => x.id !== id) }));
  },

  toggleExpanded: async (id) => {
    const c = await collectionsApi.toggleExpanded(id);
    set(s => ({ collections: s.collections.map(x => x.id === id ? c : x) }));
  },

  moveEndpoint: async (endpointId, from, to, sortOrder) => {
    await collectionsApi.moveEndpoint({ endpointId, fromCollectionId: from, toCollectionId: to, sortOrder });
    const collections = await collectionsApi.getAll();
    set({ collections });
  },

  removeEndpointFromCollection: async (collectionId, endpointId) => {
    await collectionsApi.removeEndpointFromCollection(collectionId, endpointId);
    const collections = await collectionsApi.getAll();
    set({ collections });
  },

  reorderCollections: async (orderedIds) => {
    set(s => {
      const map = new Map(s.collections.map(c => [c.id, c]));
      return { collections: orderedIds.map(id => map.get(id)!).filter(Boolean) };
    });
    await collectionsApi.reorderCollections(orderedIds);
  },

  reorderEndpoints: async (collectionId, orderedEndpointIds) => {
    set(s => ({
      collections: s.collections.map(c =>
        c.id === collectionId ? { ...c, endpointIds: orderedEndpointIds } : c
      ),
    }));
    await collectionsApi.reorderEndpoints(collectionId, orderedEndpointIds);
  },

  replaceCollection: (c) => {
    set(s => {
      const exists = s.collections.some(x => x.id === c.id);
      if (exists) return { collections: s.collections.map(x => x.id === c.id ? c : x) };
      return { collections: [...s.collections, c] };
    });
  },

  removeCollection: (id) => {
    set(s => ({ collections: s.collections.filter(x => x.id !== id) }));
  },
}));
