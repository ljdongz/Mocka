import { extname } from 'path';
import { lookup as mimeLookup, extension as extensionForMime } from 'mime-types';

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

export const DEFAULT_MIME = 'application/octet-stream';

/**
 * Content-Type for a file name, by extension.
 *
 * Deliberately the same library the static file server uses to set the header on
 * the wire. A table of our own would disagree with it for every extension we
 * forgot — a .mkv stored as octet-stream but served as video/x-matroska shows up
 * as a file the UI refuses to preview and a video the mock plays anyway.
 */
export function mimeTypeForFileName(fileName: string): string {
  return mimeLookup(fileName) || DEFAULT_MIME;
}

/**
 * The extension to store the file under. Prefers the original file's own extension;
 * falls back to the reported Content-Type, because a file served without an extension
 * comes back as octet-stream and players (AVPlayer among them) refuse it.
 */
export function storageExtension(originalName: string, mimeType?: string): string {
  const own = extname(originalName).toLowerCase();
  if (own) return own;
  if (!mimeType || mimeType.split(';')[0].trim().toLowerCase() === DEFAULT_MIME) return '';
  const ext = extensionForMime(mimeType);
  return ext ? `.${ext}` : '';
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
