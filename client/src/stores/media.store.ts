import { create } from 'zustand';
import { mediaApi } from '../api/media';
import type { Media } from '../types';

interface MediaStore {
  media: Media[];
  fetch: () => Promise<void>;
  upload: (files: File[]) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useMediaStore = create<MediaStore>((set) => ({
  media: [],

  fetch: async () => {
    set({ media: await mediaApi.getAll() });
  },

  upload: async (files) => {
    await mediaApi.upload(files);
    set({ media: await mediaApi.getAll() });
  },

  rename: async (id, name) => {
    await mediaApi.rename(id, name);
    set({ media: await mediaApi.getAll() });
  },

  remove: async (id) => {
    await mediaApi.remove(id);
    set({ media: await mediaApi.getAll() });
  },
}));
