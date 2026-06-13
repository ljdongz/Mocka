import { create } from 'zustand';

interface UIStore {
  showHistory: boolean;
  showSettings: boolean;
  showNewEndpoint: boolean;
  showNewCollection: boolean;
  showImportExport: boolean;
  showEnvironments: boolean;
  showOnboarding: boolean;
  newEndpointCollectionId: string;

  sidebarWidth: number;
  historyDetailWidth: number;
  detailTab: 'params' | 'headers' | 'body' | 'response';
  setShowHistory: (v: boolean) => void;
  setShowSettings: (v: boolean) => void;
  setShowNewEndpoint: (v: boolean, collectionId?: string) => void;
  setShowNewCollection: (v: boolean) => void;
  setShowImportExport: (v: boolean) => void;
  setShowEnvironments: (v: boolean) => void;
  setShowOnboarding: (v: boolean) => void;
  setSidebarWidth: (w: number) => void;
  setHistoryDetailWidth: (w: number) => void;
  setDetailTab: (tab: 'params' | 'headers' | 'body' | 'response') => void;
}

export const useUIStore = create<UIStore>((set) => ({
  showHistory: false,
  showSettings: false,
  showNewEndpoint: false,
  showNewCollection: false,
  showImportExport: false,
  showEnvironments: false,
  showOnboarding: false,
  newEndpointCollectionId: '',
  sidebarWidth: 280,
  historyDetailWidth: 400,
  detailTab: 'params',

  setShowHistory: (v) => set({ showHistory: v }),
  setShowSettings: (v) => set({ showSettings: v }),
  setShowNewEndpoint: (v, collectionId) => set({ showNewEndpoint: v, newEndpointCollectionId: v ? (collectionId ?? '') : '' }),
  setShowNewCollection: (v) => set({ showNewCollection: v }),
  setShowImportExport: (v) => set({ showImportExport: v }),
  setShowEnvironments: (v) => set({ showEnvironments: v }),
  setShowOnboarding: (v) => set({ showOnboarding: v }),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setHistoryDetailWidth: (w) => set({ historyDetailWidth: w }),
  setDetailTab: (tab) => set({ detailTab: tab }),
}));
