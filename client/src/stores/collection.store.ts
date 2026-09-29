import { create } from 'zustand';
import { collectionsApi } from '../api/collections';
import { useEndpointStore } from './endpoint.store';
import type { Collection } from '../types';
import { subtreeIds } from '../utils/collection-tree';

interface CollectionStore {
  collections: Collection[];
  fetch: () => Promise<void>;
  create: (name: string, parentId?: string | null) => Promise<Collection>;
  move: (id: string, parentId: string | null, index?: number) => Promise<void>;
  update: (id: string, data: { name?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  toggleExpanded: (id: string) => Promise<void>;
  moveEndpoint: (endpointId: string, from: string | null, to: string, sortOrder: number) => Promise<void>;
  removeEndpointFromCollection: (collectionId: string, endpointId: string) => Promise<void>;
  /** Put a collection or endpoint at `index` among `parentId`'s children (collections and endpoints share one order). */
  place: (type: 'collection' | 'endpoint', id: string, from: string | null, parentId: string | null, index: number) => Promise<void>;
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

  create: async (name, parentId = null) => {
    const c = await collectionsApi.create(name, parentId);
    set(s => {
      const exists = s.collections.some(x => x.id === c.id);
      if (exists) return { collections: s.collections.map(x => x.id === c.id ? c : x) };
      return { collections: [...s.collections, c] };
    });
    return c;
  },

  move: async (id, parentId, index) => {
    await collectionsApi.move(id, parentId, index);
    set({ collections: await collectionsApi.getAll() });
  },

  update: async (id, data) => {
    const c = await collectionsApi.update(id, data);
    set(s => ({ collections: s.collections.map(x => x.id === id ? c : x) }));
  },

  remove: async (id) => {
    await collectionsApi.delete(id);
    // Nested collections go with it.
    set(s => {
      const gone = new Set(subtreeIds(s.collections, id));
      return { collections: s.collections.filter(x => !gone.has(x.id)) };
    });
    // The server deletes the collection's endpoints with it — but spares any it
    // shares with another collection, so which ones went is the server's answer
    // to give. Re-read rather than guess, and don't wait on the websocket echo.
    await useEndpointStore.getState().fetch();
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

  // orderedIds are one parent's children; the tree reads order from sortOrder.
  // Orders live on collections, memberships and (top level) endpoints, so both lists are re-read.
  place: async (type, id, from, parentId, index) => {
    await collectionsApi.place({ type, id, fromCollectionId: from, parentId, index });
    const [collections] = await Promise.all([collectionsApi.getAll(), useEndpointStore.getState().fetch()]);
    set({ collections });
  },

  reorderCollections: async (orderedIds) => {
    set(s => ({
      collections: s.collections.map(c => {
        const i = orderedIds.indexOf(c.id);
        return i === -1 ? c : { ...c, sortOrder: i };
      }),
    }));
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
