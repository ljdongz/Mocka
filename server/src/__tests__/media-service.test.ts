import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { initDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import * as mediaService from '../services/media.service.js';
import { MediaError } from '../services/media.service.js';

let sourceDir: string;

function sourceFile(name: string, contents = 'binary-ish'): string {
  const path = join(sourceDir, name);
  writeFileSync(path, contents);
  return path;
}

describe('media.service', () => {
  beforeEach(() => {
    initDb(':memory:');
    initSchema();
    sourceDir = mkdtempSync(join(tmpdir(), 'mocka-src-'));
  });
  afterEach(() => { closeDb(); rmSync(sourceDir, { recursive: true, force: true }); });

  it('copies the file in, keeping its extension so the served URL has a real Content-Type', async () => {
    const media = await mediaService.registerFromPath({ path: sourceFile('clip.mp4') });
    expect(media.fileName).toBe(`${media.id}.mp4`);
    expect(media.mimeType).toBe('video/mp4');
    expect(media.size).toBeGreaterThan(0);
    expect(existsSync(mediaService.filePath(media))).toBe(true);
    expect(readFileSync(mediaService.filePath(media), 'utf8')).toBe('binary-ish');
  });

  it('survives the original being moved or deleted, because it stored a copy', async () => {
    const path = sourceFile('clip.mp4');
    const media = await mediaService.registerFromPath({ path });
    writeFileSync(path, 'replaced');
    expect(readFileSync(mediaService.filePath(media), 'utf8')).toBe('binary-ish');
  });

  it('names a file after itself, slugified, and suffixes a generated name that collides', async () => {
    const first = await mediaService.registerFromPath({ path: sourceFile('Chat Clip 01.mp4') });
    const second = await mediaService.registerFromPath({ path: sourceFile('Chat Clip 01.mp4') });
    expect(first.name).toBe('chat-clip-01');
    expect(second.name).toBe('chat-clip-01-2');
  });

  it('keeps non-Latin file names instead of slugging them all to the same word', async () => {
    const a = await mediaService.registerFromPath({ path: sourceFile('회의록.mp4') });
    const b = await mediaService.registerFromPath({ path: sourceFile('프로필 사진.png') });
    expect(a.name).toBe('회의록');
    expect(b.name).toBe('프로필-사진');
  });

  it('rejects an explicitly requested name that is already taken', async () => {
    await mediaService.registerFromPath({ path: sourceFile('a.mp4'), name: 'hero' });
    await expect(mediaService.registerFromPath({ path: sourceFile('b.mp4'), name: 'hero' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects a path that is not a readable file', async () => {
    await expect(mediaService.registerFromPath({ path: join(sourceDir, 'nope.mp4') }))
      .rejects.toBeInstanceOf(MediaError);
    await expect(mediaService.registerFromPath({ path: sourceDir }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('looks a file up by the name used in {{$media}}', async () => {
    const media = await mediaService.registerFromPath({ path: sourceFile('doc.pdf'), name: 'invoice' });
    expect(mediaService.getByName('invoice')?.id).toBe(media.id);
    expect(mediaService.getByName('missing')).toBeNull();
  });

  it('rename rejects a clash but allows renaming a file to its own name', async () => {
    const a = await mediaService.registerFromPath({ path: sourceFile('a.mp4'), name: 'a' });
    await mediaService.registerFromPath({ path: sourceFile('b.mp4'), name: 'b' });
    expect(() => mediaService.rename(a.id, 'b')).toThrow(MediaError);
    expect(mediaService.rename(a.id, 'a')?.name).toBe('a');
    expect(mediaService.rename(a.id, 'renamed')?.name).toBe('renamed');
  });

  it('remove deletes the row and the copied file', async () => {
    const media = await mediaService.registerFromPath({ path: sourceFile('clip.mov') });
    const onDisk = mediaService.filePath(media);
    expect(mediaService.remove(media.id)).toBe(true);
    expect(mediaService.getById(media.id)).toBeNull();
    expect(existsSync(onDisk)).toBe(false);
    expect(mediaService.remove(media.id)).toBe(false);
  });

  it('rejects an upload the parser truncated, instead of registering a partial file', async () => {
    const stream = Readable.from([Buffer.from('half a video')]) as Readable & { truncated?: boolean };
    stream.truncated = true;
    await expect(mediaService.registerFromStream({ stream, originalName: 'clip.mp4' }))
      .rejects.toMatchObject({ statusCode: 413 });
    expect(mediaService.getAll()).toHaveLength(0);
  });

  it('reads Content-Type from the same table the static server serves by', async () => {
    const mkv = await mediaService.registerFromPath({ path: sourceFile('clip.mkv') });
    expect(mkv.mimeType).toBe('video/x-matroska');
    const heic = await mediaService.registerFromPath({ path: sourceFile('photo.heic') });
    expect(heic.mimeType).toBe('image/heic');
  });

  it('still picks an extension when the reported type carries parameters', async () => {
    const media = await mediaService.registerFromStream({
      stream: Readable.from([Buffer.from('bytes')]),
      originalName: 'clip',
      mimeType: 'video/mp4; codecs="avc1.42E01E"',
    });
    expect(media.fileName).toBe(`${media.id}.mp4`);
    expect(media.mimeType).toBe('video/mp4');
  });

  it('falls back to the reported Content-Type when the upload has no extension', async () => {
    const media = await mediaService.registerFromStream({
      stream: Readable.from([Buffer.from('bytes')]),
      originalName: 'clip',
      mimeType: 'video/mp4',
    });
    expect(media.fileName).toBe(`${media.id}.mp4`);
    expect(media.mimeType).toBe('video/mp4');
  });
});
