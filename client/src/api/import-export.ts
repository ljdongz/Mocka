import { api } from './client';

export interface ExportData {
  version: number;
  exportedAt: string;
  endpoints: any[];
  collections: any[];
  /** Present from export version 4 on. */
  stompConnections?: any[];
}

export interface ImportResult {
  created: number;
  skipped: number;
  overwritten: number;
  merged: number;
  collectionsCreated: number;
  collectionsSkipped: number;
  stompCreated: number;
  stompSkipped: number;
  stompOverwritten: number;
  errors: string[];
}

export type ConflictPolicy = 'overwrite' | 'skip' | 'merge';

export const importExportApi = {
  exportAll: () => api.post<ExportData>('/api/export', {}),
  exportCollections: (collectionIds: string[]) => api.post<ExportData>('/api/export', { collectionIds }),
  importData: (data: ExportData, conflictPolicy: ConflictPolicy) =>
    api.post<ImportResult>('/api/import', { data, conflictPolicy }),
};
