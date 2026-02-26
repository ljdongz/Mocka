import { create } from 'zustand';
import { settingsApi } from '../api/settings';
import type { Settings, ServerStatus, Language } from '../types';

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
  settings: { port: 8080, responseDelay: 0, autoSaveEndpoints: true, historyToast: true, theme: (localStorage.getItem('mocka-theme') as 'dark' | 'light') || 'dark', language: (localStorage.getItem('mocka-language') as Language) || 'en' },
  serverStatus: { running: false, port: 8080, localIp: 'localhost' },

  fetch: async () => {
    const settings = await settingsApi.getAll();
    document.documentElement.setAttribute('data-theme', settings.theme);
    localStorage.setItem('mocka-theme', settings.theme);
    localStorage.setItem('mocka-language', settings.language);
    set({ settings });
  },

  update: async (data) => {
    const settings = await settingsApi.update(data);
    document.documentElement.setAttribute('data-theme', settings.theme);
    localStorage.setItem('mocka-theme', settings.theme);
    localStorage.setItem('mocka-language', settings.language);
    set({ settings });
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
