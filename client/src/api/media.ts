import { api } from './client';
import type { Media } from '../types';

async function upload(files: File[]): Promise<Media[]> {
  const form = new FormData();
  for (const file of files) form.append('file', file);

  const res = await fetch('/api/media', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Upload failed with status ${res.status}`);
  return data;
}

export const mediaApi = {
  getAll: () => api.get<Media[]>('/api/media'),
  upload,
  rename: (id: string, name: string) => api.put<Media>(`/api/media/${id}`, { name }),
  remove: (id: string) => api.delete<{ success: boolean }>(`/api/media/${id}`),
};
