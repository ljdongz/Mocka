import { create } from 'zustand';
import { stompApi } from '../api/stomp';
import type {
  StompConnection, StompDestination, StompMessageVariant, StompPreset, StompSessionInfo, StompStats,
  StompPushOptions, StompFireOutcome, StompInjectPayload, StompTrigger,
} from '../types';

interface StompStore {
  connections: StompConnection[];
  sessions: StompSessionInfo[];
  stats: Record<string, StompStats>;
  selectedConnectionId: string | null;
  selectedDestinationId: string | null;
  loading: boolean;

  selectedConnection: () => StompConnection | undefined;
  selectedDestination: () => StompDestination | undefined;

  fetch: () => Promise<void>;
  fetchSessions: () => Promise<void>;
  fetchStats: (connectionId: string) => Promise<void>;
  select: (connectionId: string | null, destinationId?: string | null) => void;

  createConnection: (data: { path: string; name?: string }) => Promise<StompConnection>;
  updateConnection: (id: string, data: Partial<StompConnection>) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  toggleConnection: (id: string) => Promise<void>;

  createDestination: (connectionId: string, data: { pattern: string; trigger: StompTrigger; name?: string }) => Promise<StompDestination | undefined>;
  updateDestination: (id: string, data: Partial<StompDestination>) => Promise<void>;
  deleteDestination: (id: string) => Promise<void>;
  toggleDestination: (id: string) => Promise<void>;
  setActiveVariant: (destinationId: string, variantId: string | null) => Promise<void>;
  setActivePreset: (destinationId: string, presetId: string | null) => Promise<void>;

  addVariant: (destinationId: string, data?: Partial<StompMessageVariant>) => Promise<StompDestination>;
  updateVariant: (id: string, data: Partial<StompMessageVariant>) => Promise<void>;
  deleteVariant: (id: string) => Promise<void>;
  reorderVariants: (destinationId: string, orderedIds: string[]) => Promise<void>;

  createPreset: (destinationId: string, data?: { name?: string; mode?: 'sequential' | 'loop' }) => Promise<StompPreset>;
  updatePreset: (id: string, data: Partial<StompPreset>) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
  addPresetVariant: (presetId: string) => Promise<StompDestination>;
  resetSequence: (destinationId: string) => Promise<void>;

  push: (connectionId: string, opts: StompPushOptions) => Promise<StompFireOutcome>;
  fireDestination: (destinationId: string, sessionId?: string | null) => Promise<StompFireOutcome>;
  injectSession: (sessionId: string, payload: StompInjectPayload) => Promise<void>;
  disconnectSession: (sessionId: string) => Promise<void>;
  stopRepeats: (connectionId: string) => Promise<void>;

  exportConnection: (id: string) => Promise<unknown>;
  importConnection: (data: unknown, policy: 'skip' | 'overwrite') => Promise<void>;

  upsertSession: (info: StompSessionInfo) => void;
  removeSession: (id: string) => void;
}

export const useStompStore = create<StompStore>((set, get) => {
  /** Refetch everything after a mutation — the STOMP config is small and the admin WS also nudges us. */
  const refresh = async () => { await get().fetch(); };

  return {
    connections: [],
    sessions: [],
    stats: {},
    selectedConnectionId: null,
    selectedDestinationId: null,
    loading: false,

    selectedConnection: () => get().connections.find(c => c.id === get().selectedConnectionId),
    selectedDestination: () => {
      const { selectedDestinationId, connections } = get();
      if (!selectedDestinationId) return undefined;
      for (const c of connections) {
        const d = c.destinations?.find(x => x.id === selectedDestinationId);
        if (d) return d;
      }
      return undefined;
    },

    fetch: async () => {
      set({ loading: true });
      try {
        const connections = await stompApi.getConnections();
        set(s => ({
          connections,
          loading: false,
          selectedConnectionId: s.selectedConnectionId && connections.some(c => c.id === s.selectedConnectionId) ? s.selectedConnectionId : null,
          selectedDestinationId: s.selectedDestinationId && connections.some(c => c.destinations?.some(d => d.id === s.selectedDestinationId)) ? s.selectedDestinationId : null,
        }));
      } catch {
        set({ loading: false });
      }
    },

    fetchSessions: async () => {
      try { set({ sessions: await stompApi.getSessions() }); } catch { /* admin unreachable */ }
    },

    fetchStats: async (connectionId) => {
      try {
        const stats = await stompApi.getStats(connectionId);
        set(s => ({ stats: { ...s.stats, [connectionId]: stats } }));
      } catch { /* connection may have been deleted */ }
    },

    select: (connectionId, destinationId = null) => {
      set({ selectedConnectionId: connectionId, selectedDestinationId: destinationId });
      if (connectionId) get().fetchStats(connectionId);
    },

    createConnection: async (data) => {
      const c = await stompApi.createConnection(data);
      await refresh();
      set({ selectedConnectionId: c.id, selectedDestinationId: null });
      return c;
    },
    updateConnection: async (id, data) => { await stompApi.updateConnection(id, data); await refresh(); },
    deleteConnection: async (id) => {
      await stompApi.deleteConnection(id);
      set(s => ({
        selectedConnectionId: s.selectedConnectionId === id ? null : s.selectedConnectionId,
        selectedDestinationId: s.connections.find(c => c.id === id)?.destinations?.some(d => d.id === s.selectedDestinationId) ? null : s.selectedDestinationId,
      }));
      await refresh();
    },
    toggleConnection: async (id) => { await stompApi.toggleConnection(id); await refresh(); },

    createDestination: async (connectionId, data) => {
      const conn = await stompApi.createDestination(connectionId, data);
      await refresh();
      const created = conn.destinations?.[conn.destinations.length - 1];
      if (created) set({ selectedConnectionId: connectionId, selectedDestinationId: created.id });
      return created;
    },
    updateDestination: async (id, data) => { await stompApi.updateDestination(id, data); await refresh(); },
    deleteDestination: async (id) => {
      await stompApi.deleteDestination(id);
      set(s => ({ selectedDestinationId: s.selectedDestinationId === id ? null : s.selectedDestinationId }));
      await refresh();
    },
    toggleDestination: async (id) => { await stompApi.toggleDestination(id); await refresh(); },
    setActiveVariant: async (destinationId, variantId) => { await stompApi.setActiveVariant(destinationId, variantId); await refresh(); },
    setActivePreset: async (destinationId, presetId) => { await stompApi.setActivePreset(destinationId, presetId); await refresh(); },

    addVariant: async (destinationId, data) => {
      const dest = await stompApi.addVariant(destinationId, data);
      await refresh();
      return dest;
    },
    updateVariant: async (id, data) => { await stompApi.updateVariant(id, data); await refresh(); },
    deleteVariant: async (id) => { await stompApi.deleteVariant(id); await refresh(); },
    reorderVariants: async (destinationId, orderedIds) => {
      // optimistic: reorder the selected group in place, then confirm from the server
      set(s => ({
        connections: s.connections.map(c => ({
          ...c,
          destinations: c.destinations?.map(d => {
            if (d.id !== destinationId) return d;
            const moved = orderedIds.map(id => d.variants.find(v => v.id === id)).filter(Boolean) as StompMessageVariant[];
            let next = 0;
            return { ...d, variants: d.variants.map(v => orderedIds.includes(v.id) ? moved[next++] : v) };
          }),
        })),
      }));
      await stompApi.reorderVariants(destinationId, orderedIds);
      await refresh();
    },

    createPreset: async (destinationId, data) => {
      const preset = await stompApi.createPreset(destinationId, data);
      await stompApi.setActivePreset(destinationId, preset.id);
      await refresh();
      return preset;
    },
    updatePreset: async (id, data) => { await stompApi.updatePreset(id, data); await refresh(); },
    deletePreset: async (id) => { await stompApi.deletePreset(id); await refresh(); },
    addPresetVariant: async (presetId) => {
      const dest = await stompApi.addPresetVariant(presetId);
      await refresh();
      return dest;
    },
    resetSequence: async (destinationId) => { await stompApi.resetSequence(destinationId); },

    push: async (connectionId, opts) => stompApi.push(connectionId, opts),
    fireDestination: async (destinationId, sessionId) => stompApi.fireDestination(destinationId, sessionId),
    injectSession: async (sessionId, payload) => { await stompApi.injectSession(sessionId, payload); await get().fetchSessions(); },
    disconnectSession: async (sessionId) => { await stompApi.disconnectSession(sessionId); await get().fetchSessions(); },
    stopRepeats: async (connectionId) => { await stompApi.stopRepeats(connectionId); },

    exportConnection: async (id) => stompApi.exportConnection(id),
    importConnection: async (data, policy) => {
      const result = await stompApi.importConnection(data, policy);
      if (result.errors.length) throw new Error(result.errors.join('; '));
      await refresh();
    },

    upsertSession: (info) => set(s => ({
      sessions: s.sessions.some(x => x.id === info.id) ? s.sessions.map(x => x.id === info.id ? info : x) : [...s.sessions, info],
    })),
    removeSession: (id) => set(s => ({ sessions: s.sessions.filter(x => x.id !== id) })),
  };
});
