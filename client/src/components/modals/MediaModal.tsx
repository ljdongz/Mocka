import { useState, useEffect, useRef } from 'react';
import { Check, Copy, Trash2, Upload } from 'lucide-react';
import { useMediaStore } from '../../stores/media.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useUIStore } from '../../stores/ui.store';
import { ModalOverlay } from '../shared/ModalOverlay';
import { useTranslation } from '../../i18n';
import type { Media } from '../../types';
import clsx from 'clsx';

/** Human-readable size, the unit chosen by magnitude. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/**
 * The file's URL on the mock server. The admin UI is served from a different
 * port than the mock API, so the preview has to name that port explicitly —
 * it uses the host the UI itself was opened on, which is the one that works
 * whether that is localhost or a LAN address.
 */
function mediaUrl(media: Media, mockPort: number): string {
  return `${window.location.protocol}//${window.location.hostname}:${mockPort}/__mocka/media/${media.fileName}`;
}

export function MediaModal() {
  const t = useTranslation();
  const open = useUIStore(s => s.showMedia);
  const close = () => useUIStore.getState().setShowMedia(false);
  const { media, fetch, upload, rename, remove } = useMediaStore();
  const mockPort = useSettingsStore(s => s.serverStatus.port);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) fetch(); }, [open, fetch]);
  useEffect(() => {
    if (media.length > 0 && !media.some(m => m.id === selectedId)) setSelectedId(media[0].id);
  }, [media, selectedId]);

  const selected = media.find(m => m.id === selectedId);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError('');
    try {
      await upload(Array.from(files));
      const all = useMediaStore.getState().media;
      setSelectedId(all[all.length - 1]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: string) => {
    await remove(id);
    setSelectedId(useMediaStore.getState().media[0]?.id ?? null);
  };

  return (
    <ModalOverlay open={open} onClose={close}>
      <div className="w-[720px] max-h-[80vh] rounded-lg border border-border-secondary bg-bg-surface flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-secondary">
          <h2 className="text-base font-semibold text-text-primary">{t.media.title}</h2>
          <button onClick={close} className="text-text-muted hover:text-text-secondary text-lg">&times;</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: registered files */}
          <div className="w-56 border-r border-border-secondary flex flex-col">
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {media.map(m => (
                <div
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className={clsx(
                    'flex items-center gap-2 rounded px-2.5 py-2 cursor-pointer text-sm',
                    selectedId === m.id ? 'bg-bg-hover text-text-primary' : 'text-text-secondary hover:bg-bg-hover',
                  )}
                >
                  <span className="flex-1 truncate font-mono text-xs">{m.name}</span>
                  <span className="text-xs text-text-muted">{formatSize(m.size)}</span>
                </div>
              ))}
              {media.length === 0 && (
                <p className="px-2 py-3 text-xs text-text-muted">{t.media.empty}</p>
              )}
            </div>

            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleUpload(e.dataTransfer.files); }}
              onClick={() => fileInput.current?.click()}
              className={clsx(
                'm-2 rounded border border-dashed px-2 py-4 text-center cursor-pointer transition-colors',
                dragging
                  ? 'border-accent-primary text-accent-primary'
                  : 'border-border-secondary text-text-muted hover:border-accent-primary hover:text-text-secondary',
              )}
            >
              <Upload size={16} className="mx-auto mb-1" />
              <span className="text-xs">{t.media.dropHint}</span>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                onChange={e => { handleUpload(e.target.files); e.target.value = ''; }}
              />
            </div>
          </div>

          {/* Right: detail */}
          <div className="flex-1 p-4 overflow-y-auto">
            {error && <p className="mb-3 text-xs text-method-delete">{error}</p>}
            {selected ? (
              <MediaDetail
                key={selected.id}
                media={selected}
                url={mediaUrl(selected, mockPort)}
                onRename={rename}
                onDelete={handleDelete}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-text-muted">
                {t.media.addToStart}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

function MediaDetail({
  media,
  url,
  onRename,
  onDelete,
}: {
  media: Media;
  url: string;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const t = useTranslation();
  const [name, setName] = useState(media.name);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const placeholder = `{{$media '${media.name}'}}`;

  const commitName = async () => {
    if (name === media.name) return;
    try {
      setError('');
      await onRename(media.id, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setName(media.name);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(placeholder);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={commitName}
          className="flex-1 rounded border border-border-secondary bg-bg-input px-2.5 py-1.5 text-sm text-text-primary font-mono outline-none focus:border-accent-primary"
        />
        <button
          onClick={() => onDelete(media.id)}
          className="text-text-muted hover:text-method-delete p-1.5"
          title={t.media.deleteMedia}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {error && <p className="mb-3 text-xs text-method-delete">{error}</p>}

      <label className="block text-xs text-text-tertiary mb-1 uppercase tracking-wider">{t.media.placeholder}</label>
      <div className="flex items-center gap-2 mb-4">
        <code className="flex-1 truncate rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-xs text-text-primary font-mono">
          {placeholder}
        </code>
        <button onClick={copy} className="text-text-muted hover:text-text-secondary p-1.5" title={t.media.copy}>
          {copied ? <Check size={14} className="text-accent-primary" /> : <Copy size={14} />}
        </button>
      </div>

      <MediaPreview media={media} url={url} />

      <dl className="mt-4 space-y-1 text-xs">
        <Row label={t.media.originalName} value={media.originalName} />
        <Row label={t.media.type} value={media.mimeType} />
        <Row label={t.media.size} value={formatSize(media.size)} />
        <Row label={t.media.url} value={url} />
      </dl>

      <p className="mt-4 text-xs text-text-muted">{t.media.usageHint}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 flex-shrink-0 text-text-tertiary">{label}</dt>
      <dd className="flex-1 truncate text-text-secondary font-mono">{value}</dd>
    </div>
  );
}

function MediaPreview({ media, url }: { media: Media; url: string }) {
  const t = useTranslation();

  if (media.mimeType.startsWith('image/')) {
    return <img src={url} alt={media.name} className="max-h-48 rounded border border-border-secondary" />;
  }
  if (media.mimeType.startsWith('video/')) {
    return <video src={url} controls className="max-h-48 w-full rounded border border-border-secondary" />;
  }
  if (media.mimeType.startsWith('audio/')) {
    return <audio src={url} controls className="w-full" />;
  }
  return (
    <p className="rounded border border-border-secondary bg-bg-input px-2 py-3 text-xs text-text-muted">
      {t.media.noPreview}
    </p>
  );
}
