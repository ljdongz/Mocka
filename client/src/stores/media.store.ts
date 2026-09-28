import { create } from 'zustand';
import { mediaApi } from '../api/media';
import type { Media } from '../types';

interface MediaStore {
  media: Media[];
  fetch: () => Promise<void>;
  /** Returns the files that registered, so the caller can select one by id. */
  upload: (files: File[]) => Promise<Media[]>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useMediaStore = create<MediaStore>((set) => ({
  media: [],

  fetch: async () => {
    set({ media: await mediaApi.getAll() });
  },

  upload: async (files) => {
    // Refetch even when the upload throws: a batch can fail partway, and the
    // files that did register are otherwise invisible until the modal reopens
    // while their names are already taken.
    try {
      return await mediaApi.upload(files);
    } finally {
      set({ media: await mediaApi.getAll() });
    }
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
