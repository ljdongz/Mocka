import { create } from 'zustand';
import { environmentsApi } from '../api/environments';
import type { Environment } from '../types';

interface EnvironmentStore {
  environments: Environment[];
  fetch: () => Promise<void>;
  create: (name: string) => Promise<void>;
  update: (id: string, data: Partial<Environment>) => Promise<void>;
  setActive: (id: string | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useEnvironmentStore = create<EnvironmentStore>((set) => ({
  environments: [],

  fetch: async () => {
    const environments = await environmentsApi.getAll();
    set({ environments });
  },

  create: async (name) => {
    await environmentsApi.create(name);
    const environments = await environmentsApi.getAll();
    set({ environments });
  },

  update: async (id, data) => {
    await environmentsApi.update(id, data);
    const environments = await environmentsApi.getAll();
    set({ environments });
  },

  setActive: async (id) => {
    const environments = await environmentsApi.setActive(id);
    set({ environments });
  },

  remove: async (id) => {
    await environmentsApi.remove(id);
    const environments = await environmentsApi.getAll();
    set({ environments });
  },
}));
