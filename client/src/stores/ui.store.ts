import { create } from 'zustand';

interface UIStore {
  showHistory: boolean;
  /** STOMP mode: sidebar shows connections, main pane the STOMP editors */
  showStomp: boolean;
  showSettings: boolean;
  showNewEndpoint: boolean;
  showNewCollection: boolean;
  showNewStompConnection: boolean;
  showNewStompDestination: boolean;
  newStompDestinationConnectionId: string;
  showImportExport: boolean;
  showEnvironments: boolean;
  showDatasets: boolean;
  showOnboarding: boolean;
  newEndpointCollectionId: string;

  sidebarWidth: number;
  historyDetailWidth: number;
  detailTab: 'params' | 'headers' | 'body' | 'response';
  setShowHistory: (v: boolean) => void;
  setShowStomp: (v: boolean) => void;
  setShowSettings: (v: boolean) => void;
  setShowNewEndpoint: (v: boolean, collectionId?: string) => void;
  setShowNewCollection: (v: boolean) => void;
  setShowNewStompConnection: (v: boolean) => void;
  setShowNewStompDestination: (v: boolean, connectionId?: string) => void;
  setShowImportExport: (v: boolean) => void;
  setShowEnvironments: (v: boolean) => void;
  setShowDatasets: (v: boolean) => void;
  setShowOnboarding: (v: boolean) => void;
  setSidebarWidth: (w: number) => void;
  setHistoryDetailWidth: (w: number) => void;
  setDetailTab: (tab: 'params' | 'headers' | 'body' | 'response') => void;
}

export const useUIStore = create<UIStore>((set) => ({
  showHistory: false,
  showStomp: false,
  showSettings: false,
  showNewEndpoint: false,
  showNewCollection: false,
  showNewStompConnection: false,
  showNewStompDestination: false,
  newStompDestinationConnectionId: '',
  showImportExport: false,
  showEnvironments: false,
  showDatasets: false,
  showOnboarding: false,
  newEndpointCollectionId: '',
  sidebarWidth: 280,
  historyDetailWidth: 400,
  detailTab: 'params',

  setShowHistory: (v) => set({ showHistory: v }),
  setShowStomp: (v) => set({ showStomp: v }),
  setShowSettings: (v) => set({ showSettings: v }),
  setShowNewEndpoint: (v, collectionId) => set({ showNewEndpoint: v, newEndpointCollectionId: v ? (collectionId ?? '') : '' }),
  setShowNewCollection: (v) => set({ showNewCollection: v }),
  setShowNewStompConnection: (v) => set({ showNewStompConnection: v }),
  setShowNewStompDestination: (v, connectionId) => set({ showNewStompDestination: v, newStompDestinationConnectionId: v ? (connectionId ?? '') : '' }),
  setShowImportExport: (v) => set({ showImportExport: v }),
  setShowEnvironments: (v) => set({ showEnvironments: v }),
  setShowDatasets: (v) => set({ showDatasets: v }),
  setShowOnboarding: (v) => set({ showOnboarding: v }),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setHistoryDetailWidth: (w) => set({ historyDetailWidth: w }),
  setDetailTab: (tab) => set({ detailTab: tab }),
}));
