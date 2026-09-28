import { randomUUID as uuid } from 'crypto';
import { createWriteStream, existsSync, statSync, unlinkSync } from 'fs';
import { copyFile } from 'fs/promises';
import { basename, isAbsolute, join, resolve } from 'path';
import { homedir } from 'os';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import * as mediaRepo from '../repositories/media.repo.js';
import { ensureMediaDir, resolveMediaDir } from '../utils/paths.js';
import { emit } from './domain-events.js';
import {
  DEFAULT_MIME,
  defaultMediaName,
  mimeTypeForFileName,
  storageExtension,
  type Media,
} from '../models/media.js';

/** Upper bound on a single registered file. Video mocks are the reason it is this large. */
export const MAX_MEDIA_BYTES = 200 * 1024 * 1024;

export class MediaError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

export function getAll(): Media[] {
  return mediaRepo.findAll();
}

export function getById(id: string): Media | null {
  return mediaRepo.findById(id);
}

export function getByName(name: string): Media | null {
  return mediaRepo.findByName(name);
}

/** Absolute path of a registered file on disk. */
export function filePath(media: Media): string {
  return join(resolveMediaDir(), media.fileName);
}

/**
 * A free reference name based on `preferred`, suffixed -2, -3, … on collision.
 * Auto-generated names must never fail on a duplicate; an explicitly requested
 * one is checked by the caller instead, so the user hears about the clash.
 */
function uniqueName(preferred: string): string {
  if (!mediaRepo.findByName(preferred)) return preferred;
  for (let n = 2; ; n++) {
    const candidate = `${preferred}-${n}`;
    if (!mediaRepo.findByName(candidate)) return candidate;
  }
}

/**
 * Insert the row for a file already written to disk.
 *
 * The name was checked before the bytes were written, but checking and inserting
 * are not one step: a second registration can take the name in between, and the
 * UNIQUE constraint is what catches it. Rather than surfacing a raw SQLite error
 * — and leaving the copy behind with no row pointing at it — an auto-generated
 * name is resolved again and retried, and anything else unlinks the copy first.
 */
function insert(input: {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  size: number;
  originalName: string;
  /** false when the caller asked for this exact name and should hear that it is taken */
  nameWasGenerated: boolean;
}): Media {
  const { nameWasGenerated, ...row } = input;
  try {
    const media = mediaRepo.create(row);
    emit('media:created', media);
    return media;
  } catch (err) {
    if (isNameConflict(err)) {
      if (nameWasGenerated) {
        const media = mediaRepo.create({ ...row, name: uniqueName(row.name) });
        emit('media:created', media);
        return media;
      }
      safeUnlink(join(resolveMediaDir(), row.fileName));
      throw new MediaError(`Media name already in use: ${row.name}`, 409);
    }
    safeUnlink(join(resolveMediaDir(), row.fileName));
    throw err;
  }
}

function isNameConflict(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed: media\.name/.test(err.message);
}

/** Expand a leading ~ and make the path absolute against the process's cwd. */
function expandPath(input: string): string {
  const expanded = input.startsWith('~/') ? join(homedir(), input.slice(2)) : input;
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

/**
 * Register a file that already exists on this machine, copying it into the media
 * directory. A copy rather than a reference so moving or deleting the original
 * later cannot silently break a mock.
 */
export async function registerFromPath(input: { path: string; name?: string }): Promise<Media> {
  const sourcePath = expandPath(input.path);

  let stat;
  try {
    stat = statSync(sourcePath);
  } catch {
    throw new MediaError(`File not found: ${sourcePath}`, 400);
  }
  if (!stat.isFile()) throw new MediaError(`Not a regular file: ${sourcePath}`, 400);
  if (stat.size > MAX_MEDIA_BYTES) {
    throw new MediaError(`File exceeds the ${MAX_MEDIA_BYTES} byte limit`, 413);
  }

  const originalName = basename(sourcePath);
  const { name, generated } = resolveRequestedName(input.name, originalName);
  const id = uuid();
  const fileName = `${id}${storageExtension(originalName)}`;

  await copyFile(sourcePath, join(ensureMediaDir(), fileName));

  return insert({
    id,
    name,
    fileName,
    mimeType: mimeTypeForFileName(fileName),
    size: stat.size,
    originalName,
    nameWasGenerated: generated,
  });
}

/**
 * Register an uploaded file, streaming it to disk rather than buffering it —
 * a 200 MB video mock should not become 200 MB of process memory.
 */
export async function registerFromStream(input: {
  stream: Readable;
  originalName: string;
  mimeType?: string;
  name?: string;
}): Promise<Media> {
  const originalName = basename(input.originalName || 'upload');
  const { name, generated } = resolveRequestedName(input.name, originalName);
  const id = uuid();
  const fileName = `${id}${storageExtension(originalName, input.mimeType)}`;
  const target = join(ensureMediaDir(), fileName);

  try {
    await pipeline(input.stream, createWriteStream(target));
  } catch (err) {
    safeUnlink(target);
    throw err;
  }

  // A multipart parser that enforces its own size limit truncates the stream and
  // ends it normally, so the pipeline above resolves on a half-written file.
  // Without this check that file would be registered as if it were complete.
  if ((input.stream as { truncated?: boolean }).truncated) {
    safeUnlink(target);
    throw new MediaError(`File exceeds the ${MAX_MEDIA_BYTES} byte limit`, 413);
  }

  // Read the size back off the file rather than counting the stream: a 'data'
  // listener would switch it to flowing mode before pipeline wires the
  // destination up, and relying on that ordering is relying on an internal.
  const byExtension = mimeTypeForFileName(fileName);
  return insert({
    id,
    name,
    fileName,
    mimeType: byExtension === DEFAULT_MIME ? (input.mimeType || DEFAULT_MIME) : byExtension,
    size: statSync(target).size,
    originalName,
    nameWasGenerated: generated,
  });
}

/** An explicit name must be free; a generated one is made free. */
function resolveRequestedName(
  requested: string | undefined,
  originalName: string,
): { name: string; generated: boolean } {
  const trimmed = requested?.trim();
  if (!trimmed) return { name: uniqueName(defaultMediaName(originalName)), generated: true };
  if (mediaRepo.findByName(trimmed)) throw new MediaError(`Media name already in use: ${trimmed}`, 409);
  return { name: trimmed, generated: false };
}

export function rename(id: string, name: string): Media | null {
  const trimmed = name.trim();
  if (!trimmed) throw new MediaError('name must not be empty', 400);
  const clash = mediaRepo.findByName(trimmed);
  if (clash && clash.id !== id) throw new MediaError(`Media name already in use: ${trimmed}`, 409);
  const media = mediaRepo.rename(id, trimmed);
  if (media) emit('media:updated', media);
  return media;
}

export function remove(id: string): boolean {
  const media = mediaRepo.findById(id);
  if (!media) return false;
  mediaRepo.remove(id);
  safeUnlink(filePath(media));
  emit('media:deleted', { id });
  return true;
}

function safeUnlink(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch { /* the row is gone either way; a stray file is not worth failing the request */ }
}
