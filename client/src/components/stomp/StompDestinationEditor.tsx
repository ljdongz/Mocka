import { useCallback, useState } from 'react';
import { X, Filter, RotateCcw, GripVertical, Zap, AlertTriangle, Power } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { useStompStore } from '../../stores/stomp.store';
import { useTranslation, fmt } from '../../i18n';
import { CodeEditor } from '../shared/CodeEditor';
import { MatchRulesEditor } from '../shared/MatchRulesEditor';
import { HeadersJsonEditor } from '../shared/HeadersJsonEditor';
import { DatasetBindingEditor } from '../shared/DatasetBindingEditor';
import { TriggerBadge, KindBadge, ScopeBadge } from './badges';
import { formatJson } from '../../utils/json';
import type { StompConnection, StompDestination, StompMessageVariant, StompTrigger, StompFireKind, StompScope } from '../../types';

const TRIGGERS: StompTrigger[] = ['send', 'subscribe', 'manual'];
const KINDS: StompFireKind[] = ['message', 'error', 'receipt', 'disconnect'];
const SCOPES: StompScope[] = ['broadcast', 'echo', 'user'];

const inputCls = 'w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary';
const monoCls = `${inputCls} font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;

function numberOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function SortableVariantRow({ variant, children }: {
  variant: StompMessageVariant;
  children: (dragHandleProps: { listeners: any; attributes: any }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: variant.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return <div ref={setNodeRef} style={style}>{children({ listeners, attributes })}</div>;
}

export function StompDestinationEditor({ destination, connection }: { destination: StompDestination; connection: StompConnection }) {
  const t = useTranslation();
  const updateDestination = useStompStore(s => s.updateDestination);
  const toggleDestination = useStompStore(s => s.toggleDestination);
  const setActiveVariant = useStompStore(s => s.setActiveVariant);
  const addVariant = useStompStore(s => s.addVariant);
  const updateVariant = useStompStore(s => s.updateVariant);
  const deleteVariant = useStompStore(s => s.deleteVariant);
  const reorderVariants = useStompStore(s => s.reorderVariants);
  const createPreset = useStompStore(s => s.createPreset);
  const updatePreset = useStompStore(s => s.updatePreset);
  const deletePreset = useStompStore(s => s.deletePreset);
  const setActivePreset = useStompStore(s => s.setActivePreset);
  const addPresetVariant = useStompStore(s => s.addPresetVariant);
  const resetSequence = useStompStore(s => s.resetSequence);
  const fireDestination = useStompStore(s => s.fireDestination);
  const stats = useStompStore(s => s.stats[connection.id]);
  const sessions = useStompStore(s => s.sessions).filter(s => s.connectionId === connection.id);

  const [editingPattern, setEditingPattern] = useState(false);
  const [patternValue, setPatternValue] = useState(destination.pattern);
  const [nameValue, setNameValue] = useState(destination.name);
  const [error, setError] = useState('');
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [fireSessionId, setFireSessionId] = useState('');
  const [fireResult, setFireResult] = useState<{ text: string; error: boolean } | null>(null);

  const isSequence = destination.sequenceMode === 'on';
  const presets = destination.presets ?? [];
  const activePreset = presets.find(p => p.id === destination.activePresetId) ?? presets[0];
  const allVariants = destination.variants ?? [];
  const variants = isSequence && activePreset
    ? allVariants.filter(v => v.presetId === activePreset.id)
    : allVariants.filter(v => v.variantGroup === 'standard');
  const activeVariant = variants.find(v => v.id === destination.activeVariantId) ?? variants[0];
  const selectedVariant = editingVariantId ? variants.find(v => v.id === editingVariantId) ?? activeVariant : activeVariant;

  const subscriberCount = stats?.subscribers?.[destination.id];
  const needsSession = selectedVariant && (selectedVariant.scope !== 'broadcast' || selectedVariant.kind !== 'message');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = variants.findIndex(v => v.id === active.id);
    const newIndex = variants.findIndex(v => v.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    reorderVariants(destination.id, arrayMove(variants, oldIndex, newIndex).map(v => v.id));
  };

  const savePattern = async () => {
    const trimmed = patternValue.trim();
    if (!trimmed) { setError(t.stomp.patternRequired); return; }
    if (trimmed !== destination.pattern) {
      try { await updateDestination(destination.id, { pattern: trimmed }); setError(''); }
      catch (e: any) { setError(e.message); return; }
    }
    setEditingPattern(false);
  };

  const handleFire = async () => {
    try {
      const r = await fireDestination(destination.id, fireSessionId || null);
      setFireResult({ text: r.scheduled ? t.stomp.pushScheduled : fmt(t.stomp.fired, r.delivered), error: false });
    } catch (e: any) {
      setFireResult({ text: e.message, error: true });
    }
    setTimeout(() => setFireResult(null), 4000);
  };

  const handleBodyChange = useCallback((body: string) => {
    if (selectedVariant) updateVariant(selectedVariant.id, { body });
  }, [selectedVariant, updateVariant]);

  const handleBeautify = useCallback(() => {
    if (!selectedVariant) return;
    const formatted = formatJson(selectedVariant.body);
    if (formatted !== selectedVariant.body) updateVariant(selectedVariant.id, { body: formatted });
  }, [selectedVariant, updateVariant]);

  const triggerLabel: Record<StompTrigger, string> = { send: t.stomp.triggerSend, subscribe: t.stomp.triggerSubscribe, manual: t.stomp.triggerManual };
  const triggerDesc: Record<StompTrigger, string> = { send: t.stomp.triggerSendDesc, subscribe: t.stomp.triggerSubscribeDesc, manual: t.stomp.triggerManualDesc };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border-primary px-6 py-3">
        <select
          value={destination.trigger}
          onChange={e => updateDestination(destination.id, { trigger: e.target.value as StompTrigger })}
          className="rounded border border-border-secondary bg-bg-input px-2 py-1 text-xs font-mono font-bold text-text-primary outline-none"
          title={triggerDesc[destination.trigger]}
        >
          {TRIGGERS.map(tr => <option key={tr} value={tr}>{triggerLabel[tr]}</option>)}
        </select>
        {editingPattern ? (
          <input
            value={patternValue}
            onChange={e => { setPatternValue(e.target.value); setError(''); }}
            onBlur={savePattern}
            onKeyDown={e => {
              if (e.key === 'Enter') savePattern();
              if (e.key === 'Escape') { setEditingPattern(false); setError(''); }
            }}
            className="flex-1 rounded border border-border-secondary bg-bg-input px-2 py-1 font-mono text-base text-text-primary outline-none focus:border-accent-primary"
            autoFocus
          />
        ) : (
          <span
            onClick={() => { setPatternValue(destination.pattern); setEditingPattern(true); }}
            className="font-mono text-base text-text-primary cursor-pointer hover:text-accent-primary transition-colors"
            title={t.stomp.patternHint}
          >
            {destination.pattern.split(/(\*\*|\*)/).map((seg, i) =>
              seg === '*' || seg === '**'
                ? <span key={i} className="rounded bg-accent-primary/15 px-0.5 text-accent-primary">{seg}</span>
                : <span key={i}>{seg}</span>)}
          </span>
        )}
        {error && <span className="text-xs text-method-delete">{error}</span>}
        <div className="flex-1" />
        {subscriberCount === 0 && destination.trigger !== 'send' ? (
          <span className="flex items-center gap-1 text-xs text-method-post" title={t.stomp.noSubscribers}>
            <AlertTriangle size={13} strokeWidth={2.5} /> {t.stomp.noSubscribers}
          </span>
        ) : subscriberCount !== undefined && destination.trigger !== 'send' ? (
          <span className="text-xs text-text-muted">{fmt(t.stomp.subscribers, subscriberCount)}</span>
        ) : null}
        <button
          onClick={() => toggleDestination(destination.id)}
          className={clsx('flex items-center gap-1.5 rounded px-2.5 py-1 text-xs border transition-colors',
            destination.isEnabled ? 'border-server-running/40 text-server-running hover:bg-bg-hover' : 'border-server-stopped/40 text-server-stopped hover:bg-bg-hover')}
          title={t.stomp.toggle}
        >
          <Power size={12} strokeWidth={2.5} />
          {destination.isEnabled ? t.stomp.enabled : t.stomp.disabled}
        </button>
      </div>
      <div className="flex items-center gap-3 px-6 py-1.5 border-b border-border-primary">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">{t.stomp.name}</span>
          <input
            type="text"
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            onBlur={() => { if (nameValue !== destination.name) updateDestination(destination.id, { name: nameValue }); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur(); }}
            placeholder={t.editor.enterAlias}
            className="w-40 rounded border border-border-secondary bg-bg-input px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary placeholder:text-text-muted/50"
          />
        </div>
        <span className="text-xs text-text-muted font-mono truncate">{connection.path} · {triggerDesc[destination.trigger]}</span>
        <div className="flex-1" />
        {needsSession && (
          <select value={fireSessionId} onChange={e => setFireSessionId(e.target.value)} className="rounded border border-border-secondary bg-bg-input px-2 py-1 text-xs font-mono text-text-primary outline-none">
            <option value="">{t.stomp.selectSession}</option>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.id.slice(0, 8)} · {s.clientHeaders['x-client-type'] ?? '-'}</option>)}
          </select>
        )}
        <button onClick={handleFire} className="flex items-center gap-1.5 rounded bg-accent-primary px-3 py-1 text-xs font-semibold text-white hover:brightness-110">
          <Zap size={12} strokeWidth={2.5} /> {t.stomp.fireNow}
        </button>
        {fireResult && <span className={clsx('text-xs', fireResult.error ? 'text-method-delete' : 'text-method-get')}>{fireResult.text}</span>}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-base font-semibold text-text-primary">{t.stomp.variants}</h3>
            <p className="text-xs text-text-tertiary mt-0.5">{t.stomp.scopeHint}</p>
          </div>
          <div className="flex items-center gap-2">
            {isSequence && (
              <button onClick={() => resetSequence(destination.id)} className="text-sm text-text-secondary hover:text-accent-primary flex items-center gap-1" title={t.response.resetSequence}>
                <RotateCcw size={14} /> {t.response.resetSequence}
              </button>
            )}
            {!isSequence && (
              <button onClick={async () => {
                const dest = await addVariant(destination.id);
                const created = dest.variants?.filter(v => v.variantGroup === 'standard').at(-1);
                if (created) { setEditingVariantId(created.id); setActiveVariant(destination.id, created.id); }
              }} className="text-sm text-accent-primary hover:underline">
                {t.stomp.addVariant}
              </button>
            )}
          </div>
        </div>

        {/* Mode selector */}
        <div className="flex items-center gap-1 mb-3">
          <span className="text-xs text-text-muted mr-2">{t.response.responseMode}</span>
          {(['off', 'on'] as const).map(mode => (
            <button
              key={mode}
              onClick={async () => {
                if (mode === 'on' && presets.length === 0) await createPreset(destination.id, { name: 'Default' });
                updateDestination(destination.id, { sequenceMode: mode });
              }}
              className={clsx('text-xs px-3 py-1 rounded-full border transition-colors',
                destination.sequenceMode === mode ? 'bg-accent-primary text-white border-accent-primary' : 'border-border-primary text-text-secondary hover:border-accent-primary')}
            >
              {mode === 'off' ? t.response.modeStandard : t.response.modeSequence}
            </button>
          ))}
        </div>

        {/* Presets */}
        {isSequence && (
          <div className="mb-3">
            <div className="text-xs text-text-muted uppercase tracking-wider mb-2">{t.response.presetLabel}</div>
            {presets.map(p => (
              <div
                key={p.id}
                className={clsx('flex items-center gap-3 rounded px-3 py-2 mb-1 cursor-pointer', p.id === activePreset?.id ? 'bg-bg-hover' : 'hover:bg-bg-hover')}
                onClick={() => setActivePreset(destination.id, p.id)}
              >
                <input type="radio" name={`preset-${destination.id}`} checked={p.id === destination.activePresetId}
                  onChange={() => setActivePreset(destination.id, p.id)} onClick={e => e.stopPropagation()} className="accent-accent-primary" />
                <input
                  type="text"
                  defaultValue={p.name}
                  key={`name-${p.id}`}
                  onClick={e => e.stopPropagation()}
                  onBlur={e => { const name = e.target.value.trim(); if (name && name !== p.name) updatePreset(p.id, { name }); }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  placeholder={t.response.presetNamePlaceholder}
                  className="text-sm bg-transparent border-none outline-none text-text-primary flex-1 min-w-0"
                />
                <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full border', p.mode === 'sequential' ? 'border-accent-primary/30 text-accent-primary' : 'border-purple-400/30 text-purple-400')}>
                  {p.mode === 'sequential' ? t.response.modeSequential : t.response.modeLoop}
                </span>
                {presets.length > 1 && (
                  <button onClick={e => { e.stopPropagation(); deletePreset(p.id); }} className="text-text-muted hover:text-method-delete flex items-center">
                    <X size={14} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => createPreset(destination.id)} className="text-xs text-accent-primary hover:underline mt-1 ml-3">
              {t.response.newPreset}
            </button>
            {activePreset && (
              <div className="flex items-center gap-2 mt-3 mb-2">
                {(['sequential', 'loop'] as const).map(mode => (
                  <button key={mode} onClick={() => updatePreset(activePreset.id, { mode })}
                    className={clsx('text-xs px-3 py-1 rounded-full border transition-colors',
                      activePreset.mode === mode ? 'bg-accent-primary text-white border-accent-primary' : 'border-border-primary text-text-secondary hover:border-accent-primary')}>
                    {mode === 'sequential' ? t.response.modeSequential : t.response.modeLoop}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-text-tertiary">{activePreset?.mode === 'sequential' ? t.response.sequentialDescription : t.response.loopDescription}</p>
          </div>
        )}

        {/* Variant list */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-text-muted uppercase tracking-wider">{t.stomp.variants}</div>
            {isSequence && activePreset && (
              <button onClick={async () => {
                const dest = await addPresetVariant(activePreset.id);
                const created = dest.variants?.filter(v => v.presetId === activePreset.id).at(-1);
                if (created) setEditingVariantId(created.id);
              }} className="text-sm text-accent-primary hover:underline">
                {t.stomp.addVariant}
              </button>
            )}
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={variants.map(v => v.id)} strategy={verticalListSortingStrategy}>
              {variants.map((v, idx) => {
                const ruleCount = v.matchRules ? (v.matchRules.bodyRules?.length ?? 0) + (v.matchRules.headerRules?.length ?? 0) + (v.matchRules.queryParamRules?.length ?? 0) + (v.matchRules.pathParamRules?.length ?? 0) : 0;
                return (
                  <SortableVariantRow key={v.id} variant={v}>
                    {({ listeners, attributes }) => (
                      <div
                        className={clsx('flex items-center gap-3 rounded px-3 py-2 mb-1 cursor-pointer',
                          v.id === (editingVariantId ?? activeVariant?.id) ? 'bg-bg-hover' : 'hover:bg-bg-hover')}
                        onClick={() => { setEditingVariantId(v.id); if (!isSequence) setActiveVariant(destination.id, v.id); }}
                      >
                        <button {...listeners} {...attributes} onClick={e => e.stopPropagation()} className="text-text-muted hover:text-text-primary cursor-grab active:cursor-grabbing flex items-center">
                          <GripVertical size={14} />
                        </button>
                        {isSequence ? (
                          <span className="text-xs font-mono text-text-muted w-6 text-center">{idx + 1}</span>
                        ) : (
                          <input type="radio" name={`variant-${destination.id}`} checked={v.id === destination.activeVariantId}
                            onChange={() => setActiveVariant(destination.id, v.id)} onClick={e => e.stopPropagation()} className="accent-accent-primary" />
                        )}
                        <KindBadge kind={v.kind} />
                        <ScopeBadge scope={v.scope} />
                        <span className="flex-1 text-sm text-text-secondary flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{v.description}</span>
                          {v.targetDestination && <span className="text-[11px] font-mono text-text-muted truncate">→ {v.targetDestination}</span>}
                          {v.repeatIntervalMs ? <span className="text-[10px] text-text-muted">⟳ {v.repeatIntervalMs}ms{v.repeatCount != null ? ` ×${v.repeatCount}` : ''}</span> : null}
                          {ruleCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-accent-primary bg-accent-primary/10 px-1.5 py-0.5 rounded-full" title={t.response.matchConditions}>
                              <Filter size={10} /> {ruleCount}
                            </span>
                          )}
                        </span>
                        {(isSequence || variants.length > 1) && (
                          <button onClick={e => { e.stopPropagation(); deleteVariant(v.id); }} className="text-text-muted hover:text-method-delete flex items-center">
                            <X size={14} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    )}
                  </SortableVariantRow>
                );
              })}
            </SortableContext>
          </DndContext>
        </div>

        {selectedVariant && (
          <VariantEditor
            key={selectedVariant.id}
            variant={selectedVariant}
            connection={connection}
            updateVariant={updateVariant}
            handleBodyChange={handleBodyChange}
            handleBeautify={handleBeautify}
          />
        )}
      </div>
    </div>
  );
}

function VariantEditor({ variant, connection, updateVariant, handleBodyChange, handleBeautify }: {
  variant: StompMessageVariant;
  connection: StompConnection;
  updateVariant: (id: string, data: Partial<StompMessageVariant>) => Promise<void>;
  handleBodyChange: (body: string) => void;
  handleBeautify: () => void;
}) {
  const t = useTranslation();
  const [description, setDescription] = useState(variant.description);
  const [target, setTarget] = useState(variant.targetDestination);
  const [delay, setDelay] = useState(variant.delay == null ? '' : String(variant.delay));
  const [interval, setInterval] = useState(variant.repeatIntervalMs == null ? '' : String(variant.repeatIntervalMs));
  const [count, setCount] = useState(variant.repeatCount == null ? '' : String(variant.repeatCount));
  const [memo, setMemo] = useState(variant.memo);

  const kindLabel: Record<StompFireKind, string> = { message: t.stomp.kindMessage, error: t.stomp.kindError, receipt: t.stomp.kindReceipt, disconnect: t.stomp.kindDisconnect };
  const scopeLabel: Record<StompScope, string> = { broadcast: t.stomp.scopeBroadcast, echo: t.stomp.scopeEcho, user: t.stomp.scopeUser };
  const headersHint = variant.kind === 'error' ? t.stomp.frameHeadersHintError
    : variant.kind === 'disconnect' ? t.stomp.frameHeadersHintDisconnect
    : variant.kind === 'receipt' ? t.stomp.frameHeadersHintReceipt : undefined;

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.response.descriptionLabel}</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)}
            onBlur={() => { if (description !== variant.description) updateVariant(variant.id, { description }); }}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.stomp.kind}</label>
          <select value={variant.kind} onChange={e => updateVariant(variant.id, { kind: e.target.value as StompFireKind })} className={`${inputCls} font-mono`}>
            {KINDS.map(k => <option key={k} value={k}>{kindLabel[k]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.stomp.scope}</label>
          <select value={variant.scope} onChange={e => updateVariant(variant.id, { scope: e.target.value as StompScope })} className={inputCls}>
            {SCOPES.map(s => <option key={s} value={s}>{scopeLabel[s]}</option>)}
          </select>
        </div>
      </div>

      {variant.kind === 'message' && (
        <div className="mb-4">
          <label className="block text-xs text-text-tertiary mb-1">{t.stomp.targetDestination}</label>
          <input type="text" value={target} onChange={e => setTarget(e.target.value)}
            onBlur={() => { if (target !== variant.targetDestination) updateVariant(variant.id, { targetDestination: target.trim() }); }}
            placeholder="/topic/rooms/{{$destCapture 1}}"
            className={`${inputCls} font-mono`} />
          <p className="mt-1 text-xs text-text-muted">{t.stomp.targetDestinationHint}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.stomp.delay}</label>
          <input type="number" min={0} value={delay} onChange={e => setDelay(e.target.value)}
            onBlur={() => { const n = numberOrNull(delay); if (n !== (variant.delay ?? null)) updateVariant(variant.id, { delay: n }); }}
            placeholder={String(connection.defaultDelay ?? 0)}
            className={monoCls} />
          <p className="mt-1 text-xs text-text-muted">
            {variant.delay != null ? '' : connection.defaultDelay ? fmt(t.stomp.connectionDefault, connection.defaultDelay) : t.stomp.noDelay}
          </p>
        </div>
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.stomp.repeatInterval}</label>
          <input type="number" min={0} value={interval} onChange={e => setInterval(e.target.value)}
            onBlur={() => { const n = numberOrNull(interval); const next = n && n > 0 ? n : null; if (next !== (variant.repeatIntervalMs ?? null)) updateVariant(variant.id, { repeatIntervalMs: next }); }}
            placeholder="—"
            className={monoCls} />
        </div>
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.stomp.repeatCount}</label>
          <input type="number" min={1} value={count} onChange={e => setCount(e.target.value)} disabled={!variant.repeatIntervalMs}
            onBlur={() => { const n = numberOrNull(count); const next = n && n >= 1 ? Math.floor(n) : null; if (next !== (variant.repeatCount ?? null)) updateVariant(variant.id, { repeatCount: next }); }}
            placeholder="∞"
            className={`${monoCls} disabled:opacity-40`} />
          {variant.repeatIntervalMs ? <p className="mt-1 text-xs text-text-muted">{t.stomp.repeatCountHint}</p> : null}
        </div>
      </div>

      <div className="mb-2">
        <label className="block text-xs text-text-tertiary mb-1 uppercase tracking-wider">{t.response.memo}</label>
        <textarea value={memo} onChange={e => setMemo(e.target.value)}
          onBlur={() => { if (memo !== variant.memo) updateVariant(variant.id, { memo }); }}
          rows={2}
          className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary resize-none"
          placeholder={t.response.memoPlaceholder} />
      </div>

      <MatchRulesEditor
        rules={variant.matchRules}
        onChange={rules => updateVariant(variant.id, { matchRules: rules })}
        kinds={['bodyRules', 'headerRules', 'pathParamRules']}
        labels={{ pathParamRules: t.stomp.captureRules }}
        placeholders={{ headerRules: 'e.g. x-client-type', pathParamRules: 'capture number, e.g. 1' }}
      />

      <DatasetBindingEditor
        binding={variant.datasetBinding ?? null}
        onChange={binding => updateVariant(variant.id, { datasetBinding: binding })}
        keySources={['body', 'path']}
      />

      <HeadersJsonEditor
        value={variant.headers}
        onChange={headers => updateVariant(variant.id, { headers })}
        title={t.stomp.frameHeaders}
        addLabel={t.stomp.addHeader}
        keyPlaceholder={variant.kind === 'error' ? 'message' : variant.kind === 'disconnect' ? 'code' : variant.kind === 'receipt' ? 'receipt-id' : 'e.g. content-type'}
        valuePlaceholder={variant.kind === 'disconnect' ? '4001' : 'e.g. application/json'}
        hint={headersHint}
        resetKey={variant.id}
      />

      {(variant.kind === 'message' || variant.kind === 'error') && (
        <>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-text-tertiary uppercase tracking-wider">{t.stomp.body}</label>
            <button onClick={handleBeautify} className="text-sm text-accent-primary hover:underline">{t.response.formatJson}</button>
          </div>
          <div className="rounded border border-border-secondary overflow-hidden">
            <CodeEditor value={variant.body} onChange={handleBodyChange} height="400px" />
          </div>
          <p className="mt-2 text-xs text-text-muted font-mono break-all">{t.stomp.helpersHint}</p>
        </>
      )}
    </div>
  );
}
