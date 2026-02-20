import { create } from 'zustand';

interface UIStore {
  showHistory: boolean;
  showSettings: boolean;
  showNewEndpoint: boolean;
  showNewCollection: boolean;
  newEndpointCollectionId: string;
  sidebarWidth: number;
  detailTab: 'params' | 'headers' | 'body' | 'response';
  setShowHistory: (v: boolean) => void;
  setShowSettings: (v: boolean) => void;
  setShowNewEndpoint: (v: boolean, collectionId?: string) => void;
  setShowNewCollection: (v: boolean) => void;
  setSidebarWidth: (w: number) => void;
  setDetailTab: (tab: 'params' | 'headers' | 'body' | 'response') => void;
}

export const useUIStore = create<UIStore>((set) => ({
  showHistory: false,
  showSettings: false,
  showNewEndpoint: false,
  showNewCollection: false,
  newEndpointCollectionId: '',
  sidebarWidth: 280,
  detailTab: 'params',

  setShowHistory: (v) => set({ showHistory: v }),
  setShowSettings: (v) => set({ showSettings: v }),
  setShowNewEndpoint: (v, collectionId) => set({ showNewEndpoint: v, newEndpointCollectionId: v ? (collectionId ?? '') : '' }),
  setShowNewCollection: (v) => set({ showNewCollection: v }),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setDetailTab: (tab) => set({ detailTab: tab }),
}));
