import { create } from 'zustand';
import { historyApi } from '../api/history';
import type { RequestRecord } from '../types';

interface HistoryStore {
  records: RequestRecord[];
  selectedRecord: RequestRecord | null;
  filterMethod: string;
  search: string;
  fetch: () => Promise<void>;
  clearAll: () => Promise<void>;
  setFilterMethod: (method: string) => void;
  setSearch: (search: string) => void;
  selectRecord: (record: RequestRecord | null) => void;
  addRecord: (record: RequestRecord) => void;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  records: [],
  selectedRecord: null,
  filterMethod: '',
  search: '',

  fetch: async () => {
    const { filterMethod, search } = get();
    const records = await historyApi.getAll({
      method: filterMethod || undefined,
      search: search || undefined,
    });
    set({ records });
  },

  clearAll: async () => {
    await historyApi.clearAll();
    set({ records: [], selectedRecord: null });
  },

  setFilterMethod: (method) => {
    set({ filterMethod: method });
    get().fetch();
  },

  setSearch: (search) => {
    set({ search });
    get().fetch();
  },

  selectRecord: (record) => set({ selectedRecord: record }),

  addRecord: (record) => {
    set(s => ({ records: [record, ...s.records] }));
  },
}));
