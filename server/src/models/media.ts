import { extname } from 'path';

export interface Media {
  id: string;
  /** Name used to reference the file from a response body: {{$media 'name'}}. Unique. */
  name: string;
  /** File on disk under <dataDir>/media — always `<id><ext>` so the served URL carries a real extension. */
  fileName: string;
  mimeType: string;
  size: number;
  /** The file's name when it was registered, kept for display only. */
  originalName: string;
  createdAt: string;
}

/**
 * Extensions we can name a Content-Type for. The static file server sniffs the
 * served file's extension, so the extension — not this table — is what decides
 * the response's Content-Type; the table only fills `mime_type` for the API and
 * supplies an extension when an upload arrives without one.
 */
const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.heic': 'image/heic', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.aac': 'audio/aac',
  '.pdf': 'application/pdf', '.zip': 'application/zip', '.json': 'application/json',
  '.txt': 'text/plain', '.csv': 'text/csv',
};

export const DEFAULT_MIME = 'application/octet-stream';

/** Content-Type for a file name, by extension. */
export function mimeTypeForFileName(fileName: string): string {
  return MIME_BY_EXT[extname(fileName).toLowerCase()] ?? DEFAULT_MIME;
}

/**
 * The extension to store the file under. Prefers the original file's own extension;
 * falls back to the reported Content-Type, because a file served without an extension
 * comes back as octet-stream and players (AVPlayer among them) refuse it.
 */
export function storageExtension(originalName: string, mimeType?: string): string {
  const own = extname(originalName).toLowerCase();
  if (own) return own;
  if (!mimeType) return '';
  const match = Object.entries(MIME_BY_EXT).find(([, mime]) => mime === mimeType.toLowerCase());
  return match ? match[0] : '';
}

/**
 * Turn a file name into a default reference name: no extension, lowercase,
 * runs of anything that is not a letter or digit collapsed to a dash.
 *
 * The character class is Unicode-aware on purpose. Restricting it to a-z0-9
 * would slug every entirely non-Latin file name — 회의록.mp4, 프로필.png — down
 * to the empty string, and a folder of them would come back as media, media-2,
 * media-3, which defeats the point of naming them at all.
 */
export function defaultMediaName(originalName: string): string {
  const base = originalName.slice(0, originalName.length - extname(originalName).length);
  const slug = base.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return slug || 'media';
}
