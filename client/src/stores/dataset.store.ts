import { create } from 'zustand';
import { datasetsApi } from '../api/datasets';
import type { Dataset } from '../types';

interface DatasetStore {
  datasets: Dataset[];
  fetch: () => Promise<void>;
  create: (name: string, keyField: string) => Promise<void>;
  update: (id: string, data: Partial<Dataset>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useDatasetStore = create<DatasetStore>((set) => ({
  datasets: [],

  fetch: async () => {
    set({ datasets: await datasetsApi.getAll() });
  },

  create: async (name, keyField) => {
    await datasetsApi.create(name, keyField);
    set({ datasets: await datasetsApi.getAll() });
  },

  update: async (id, data) => {
    await datasetsApi.update(id, data);
    set({ datasets: await datasetsApi.getAll() });
  },

  remove: async (id) => {
    await datasetsApi.remove(id);
    set({ datasets: await datasetsApi.getAll() });
  },
}));
