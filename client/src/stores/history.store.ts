import { create } from 'zustand';
import { historyApi } from '../api/history';
import type { RequestRecord } from '../types';

/** '' = everything, 'stomp' = frame log only, otherwise an HTTP method */
export type HistoryFilter = '' | 'stomp' | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface HistoryStore {
  records: RequestRecord[];
  selectedRecord: RequestRecord | null;
  filter: HistoryFilter;
  search: string;
  fetch: () => Promise<void>;
  clearAll: () => Promise<void>;
  setFilter: (filter: HistoryFilter) => void;
  setSearch: (search: string) => void;
  selectRecord: (record: RequestRecord | null) => void;
  addRecord: (record: RequestRecord) => void;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  records: [],
  selectedRecord: null,
  filter: '',
  search: '',

  fetch: async () => {
    const { filter, search } = get();
    const records = await historyApi.getAll({
      method: filter && filter !== 'stomp' ? filter : undefined,
      protocol: filter === 'stomp' ? 'stomp' : filter ? 'http' : undefined,
      search: search || undefined,
    });
    set({ records });
  },

  clearAll: async () => {
    await historyApi.clearAll();
    set({ records: [], selectedRecord: null });
  },

  setFilter: (filter) => {
    set({ filter });
    get().fetch();
  },

  setSearch: (search) => {
    set({ search });
    get().fetch();
  },

  selectRecord: (record) => set({ selectedRecord: record }),

  addRecord: (record) => {
    const { filter } = get();
    if (filter === 'stomp' && record.protocol !== 'stomp') return;
    if (filter && filter !== 'stomp' && (record.protocol === 'stomp' || record.method !== filter)) return;
    set(s => ({ records: [record, ...s.records] }));
  },
}));
