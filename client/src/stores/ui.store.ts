import { create } from 'zustand';

interface UIStore {
  showHistory: boolean;
  showSettings: boolean;
  showNewEndpoint: boolean;
  showNewCollection: boolean;
  showImportExport: boolean;
  showEnvironments: boolean;
  showDatasets: boolean;
  showMedia: boolean;
  showOnboarding: boolean;
  newEndpointCollectionId: string;

  /** Sidebar multi-select delete mode. */
  editMode: boolean;
  selectedCollectionIds: string[];
  selectedEndpointIds: string[];

  sidebarWidth: number;
  historyDetailWidth: number;
  detailTab: 'params' | 'headers' | 'body' | 'response';
  setShowHistory: (v: boolean) => void;
  setShowSettings: (v: boolean) => void;
  setShowNewEndpoint: (v: boolean, collectionId?: string) => void;
  setShowNewCollection: (v: boolean) => void;
  setShowImportExport: (v: boolean) => void;
  setShowEnvironments: (v: boolean) => void;
  setShowDatasets: (v: boolean) => void;
  setShowMedia: (v: boolean) => void;
  setShowOnboarding: (v: boolean) => void;
  setEditMode: (v: boolean) => void;
  toggleCollectionSelection: (id: string, endpointIds: string[]) => void;
  toggleEndpointSelection: (id: string, collectionId: string | null) => void;
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
  showDatasets: false,
  showMedia: false,
  showOnboarding: false,
  newEndpointCollectionId: '',
  editMode: false,
  selectedCollectionIds: [],
  selectedEndpointIds: [],
  sidebarWidth: 280,
  historyDetailWidth: 400,
  detailTab: 'params',

  setShowHistory: (v) => set({ showHistory: v }),
  setShowSettings: (v) => set({ showSettings: v }),
  setShowNewEndpoint: (v, collectionId) => set({ showNewEndpoint: v, newEndpointCollectionId: v ? (collectionId ?? '') : '' }),
  setShowNewCollection: (v) => set({ showNewCollection: v }),
  setShowImportExport: (v) => set({ showImportExport: v }),
  setShowEnvironments: (v) => set({ showEnvironments: v }),
  setShowDatasets: (v) => set({ showDatasets: v }),
  setShowMedia: (v) => set({ showMedia: v }),
  setShowOnboarding: (v) => set({ showOnboarding: v }),
  setEditMode: (v) => set({ editMode: v, selectedCollectionIds: [], selectedEndpointIds: [] }),
  // Checking a collection pulls its endpoints in with it, because deleting a
  // collection now deletes them too.
  toggleCollectionSelection: (id, endpointIds) => set(s => {
    if (!s.selectedCollectionIds.includes(id)) {
      return {
        selectedCollectionIds: [...s.selectedCollectionIds, id],
        selectedEndpointIds: [...new Set([...s.selectedEndpointIds, ...endpointIds])],
      };
    }
    const dropped = new Set(endpointIds);
    return {
      selectedCollectionIds: s.selectedCollectionIds.filter(x => x !== id),
      selectedEndpointIds: s.selectedEndpointIds.filter(x => !dropped.has(x)),
    };
  }),
  toggleEndpointSelection: (id, collectionId) => set(s => {
    // Checking endpoints never promotes the parent: a collection is only ever
    // deleted when it was ticked explicitly.
    if (!s.selectedEndpointIds.includes(id)) {
      return { selectedEndpointIds: [...s.selectedEndpointIds, id] };
    }
    // Unchecking any child means the collection is no longer wholly selected.
    return {
      selectedEndpointIds: s.selectedEndpointIds.filter(x => x !== id),
      selectedCollectionIds: collectionId
        ? s.selectedCollectionIds.filter(x => x !== collectionId)
        : s.selectedCollectionIds,
    };
  }),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setHistoryDetailWidth: (w) => set({ historyDetailWidth: w }),
  setDetailTab: (tab) => set({ detailTab: tab }),
}));
