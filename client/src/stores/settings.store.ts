import { create } from 'zustand';
import { settingsApi } from '../api/settings';
import { parseSettings, toSettingsDTO } from '../utils/settings';
import type { Settings, ServerStatus } from '../types';

interface SettingsStore {
  settings: Settings;
  serverStatus: ServerStatus;
  fetch: () => Promise<void>;
  update: (data: Partial<Settings>) => Promise<void>;
  fetchServerStatus: () => Promise<void>;
  restartServer: () => Promise<void>;
  setServerStatus: (status: ServerStatus) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: { port: 8080, responseDelay: 0, autoSaveEndpoints: true, historyToast: true },
  serverStatus: { running: false, port: '8080', localIp: 'localhost' },

  fetch: async () => {
    const dto = await settingsApi.getAll();
    set({ settings: parseSettings(dto) });
  },

  update: async (data) => {
    const dto = await settingsApi.update(toSettingsDTO(data));
    set({ settings: parseSettings(dto) });
  },

  fetchServerStatus: async () => {
    const serverStatus = await settingsApi.getServerStatus();
    set({ serverStatus });
  },

  restartServer: async () => {
    await settingsApi.restartServer();
    const serverStatus = await settingsApi.getServerStatus();
    set({ serverStatus });
  },

  setServerStatus: (status) => set({ serverStatus: status }),
}));
