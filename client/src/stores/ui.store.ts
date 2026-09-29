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
  showMedia: boolean;
  showOnboarding: boolean;
  newEndpointCollectionId: string;
  /** Parent for the collection the New Collection modal creates; null = top level. */
  newCollectionParentId: string | null;

  /** Sidebar multi-select delete mode. */
  editMode: boolean;
  selectedCollectionIds: string[];
  selectedEndpointIds: string[];

  sidebarWidth: number;
  historyDetailWidth: number;
  detailTab: 'params' | 'headers' | 'body' | 'response';
  setShowHistory: (v: boolean) => void;
  setShowStomp: (v: boolean) => void;
  setShowSettings: (v: boolean) => void;
  setShowNewEndpoint: (v: boolean, collectionId?: string) => void;
  setShowNewCollection: (v: boolean, parentId?: string | null) => void;
  setShowNewStompConnection: (v: boolean) => void;
  setShowNewStompDestination: (v: boolean, connectionId?: string) => void;
  setShowImportExport: (v: boolean) => void;
  setShowEnvironments: (v: boolean) => void;
  setShowDatasets: (v: boolean) => void;
  setShowMedia: (v: boolean) => void;
  setShowOnboarding: (v: boolean) => void;
  setEditMode: (v: boolean) => void;
  /** ids = the collection and its nested collections, all ticked or unticked together. */
  toggleCollectionSelection: (ids: string[], endpointIds: string[]) => void;
  /** collectionIds = the endpoint's collection and its ancestors, unticked when the endpoint is. */
  toggleEndpointSelection: (id: string, collectionIds: string[]) => void;
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
  showMedia: false,
  showOnboarding: false,
  newEndpointCollectionId: '',
  newCollectionParentId: null,
  editMode: false,
  selectedCollectionIds: [],
  selectedEndpointIds: [],
  sidebarWidth: 280,
  historyDetailWidth: 400,
  detailTab: 'params',

  setShowHistory: (v) => set({ showHistory: v }),
  setShowStomp: (v) => set({ showStomp: v }),
  setShowSettings: (v) => set({ showSettings: v }),
  setShowNewEndpoint: (v, collectionId) => set({ showNewEndpoint: v, newEndpointCollectionId: v ? (collectionId ?? '') : '' }),
  setShowNewCollection: (v, parentId) => set({ showNewCollection: v, newCollectionParentId: v ? (parentId ?? null) : null }),
  setShowNewStompConnection: (v) => set({ showNewStompConnection: v }),
  setShowNewStompDestination: (v, connectionId) => set({ showNewStompDestination: v, newStompDestinationConnectionId: v ? (connectionId ?? '') : '' }),
  setShowImportExport: (v) => set({ showImportExport: v }),
  setShowEnvironments: (v) => set({ showEnvironments: v }),
  setShowDatasets: (v) => set({ showDatasets: v }),
  setShowMedia: (v) => set({ showMedia: v }),
  setShowOnboarding: (v) => set({ showOnboarding: v }),
  setEditMode: (v) => set({ editMode: v, selectedCollectionIds: [], selectedEndpointIds: [] }),
  // Checking a collection pulls its nested collections and endpoints in with it,
  // because deleting a collection deletes them too.
  toggleCollectionSelection: (ids, endpointIds) => set(s => {
    if (!s.selectedCollectionIds.includes(ids[0])) {
      return {
        selectedCollectionIds: [...new Set([...s.selectedCollectionIds, ...ids])],
        selectedEndpointIds: [...new Set([...s.selectedEndpointIds, ...endpointIds])],
      };
    }
    const droppedCollections = new Set(ids);
    const dropped = new Set(endpointIds);
    return {
      selectedCollectionIds: s.selectedCollectionIds.filter(x => !droppedCollections.has(x)),
      selectedEndpointIds: s.selectedEndpointIds.filter(x => !dropped.has(x)),
    };
  }),
  toggleEndpointSelection: (id, collectionIds) => set(s => {
    // Checking endpoints never promotes the parent: a collection is only ever
    // deleted when it was ticked explicitly.
    if (!s.selectedEndpointIds.includes(id)) {
      return { selectedEndpointIds: [...s.selectedEndpointIds, id] };
    }
    // Unchecking any child means its collection and their ancestors are no longer wholly selected.
    return {
      selectedEndpointIds: s.selectedEndpointIds.filter(x => x !== id),
      selectedCollectionIds: s.selectedCollectionIds.filter(x => !collectionIds.includes(x)),
    };
  }),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setHistoryDetailWidth: (w) => set({ historyDetailWidth: w }),
  setDetailTab: (tab) => set({ detailTab: tab }),
}));
