import { useCallback, useState, useRef, useEffect } from 'react';
import { Check, X, Filter, RotateCcw, GripVertical } from 'lucide-react';
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
import { useEndpointStore } from '../../../stores/endpoint.store';
import { useSettingsStore } from '../../../stores/settings.store';
import { StatusCodeBadge } from '../../shared/StatusCodeBadge';
import { CodeEditor } from '../../shared/CodeEditor';
import { MatchRulesEditor } from '../../shared/MatchRulesEditor';
import { HeadersJsonEditor } from '../../shared/HeadersJsonEditor';
import { DatasetBindingEditor } from '../../shared/DatasetBindingEditor';
import { useTranslation, fmt } from '../../../i18n';
import { STATUS_CODES } from '../../../utils/http';
import { formatJson } from '../../../utils/json';
import { validateStatusCode } from '../../../utils/validation';
import type { Endpoint, ResponseVariant } from '../../../types';
import clsx from 'clsx';

function SortableVariantRow({
  variant,
  children,
}: {
  variant: ResponseVariant;
  children: (dragHandleProps: { listeners: any; attributes: any }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: variant.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ listeners, attributes })}
    </div>
  );
}

export function ResponseTab({ endpoint }: { endpoint: Endpoint }) {
  const t = useTranslation();
  const setActiveVariant = useEndpointStore(s => s.setActiveVariant);
  const addVariant = useEndpointStore(s => s.addVariant);
  const updateVariant = useEndpointStore(s => s.updateVariant);
  const deleteVariant = useEndpointStore(s => s.deleteVariant);
  const updateEndpoint = useEndpointStore(s => s.updateEndpoint);
  const resetSequence = useEndpointStore(s => s.resetSequence);
  const createPreset = useEndpointStore(s => s.createPreset);
  const updatePreset = useEndpointStore(s => s.updatePreset);
  const deletePreset = useEndpointStore(s => s.deletePreset);
  const setActivePreset = useEndpointStore(s => s.setActivePreset);
  const addPresetVariant = useEndpointStore(s => s.addPresetVariant);
  const reorderVariants = useEndpointStore(s => s.reorderVariants);
  const isSequence = endpoint.sequenceMode === 'on';

  const allVariants = endpoint.responseVariants ?? [];
  const presets = endpoint.sequencePresets ?? [];
  const activePreset = presets.find(p => p.id === endpoint.activePresetId) ?? presets[0];

  const variants = isSequence && activePreset
    ? allVariants.filter(v => v.presetId === activePreset.id)
    : allVariants.filter(v => v.variantGroup === 'standard');
  const activeVariant = variants.find(v => v.id === endpoint.activeVariantId) ?? variants[0];
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const [customCodeInput, setCustomCodeInput] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedVariant = editingVariantId
    ? variants.find(v => v.id === editingVariantId) ?? activeVariant
    : activeVariant;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = variants.findIndex(v => v.id === active.id);
    const newIndex = variants.findIndex(v => v.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    reorderVariants(endpoint.id, arrayMove(variants, oldIndex, newIndex).map(v => v.id));
  };

  const handleBodyChange = useCallback((body: string) => {
    if (selectedVariant) updateVariant(selectedVariant.id, { body });
  }, [selectedVariant, updateVariant]);

  const handleBeautify = useCallback(() => {
    if (!selectedVariant) return;
    const formatted = formatJson(selectedVariant.body);
    if (formatted !== selectedVariant.body) {
      updateVariant(selectedVariant.id, { body: formatted });
    }
  }, [selectedVariant, updateVariant]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!statusDropdownId) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownId(null);
        setCustomCodeInput('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statusDropdownId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-base font-semibold text-text-primary">{t.response.title}</h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            {t.response.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSequence && (
            <button onClick={() => resetSequence(endpoint.id)} className="text-sm text-text-secondary hover:text-accent-primary flex items-center gap-1" title={t.response.resetSequence}>
              <RotateCcw size={14} />
              {t.response.resetSequence}
            </button>
          )}
          {!isSequence && (
            <button onClick={async () => {
              const ep = await addVariant(endpoint.id);
              const newVariant = ep.responseVariants?.filter(v => v.variantGroup === 'standard').at(-1);
              if (newVariant) {
                setEditingVariantId(newVariant.id);
                setActiveVariant(endpoint.id, newVariant.id);
              }
            }} className="text-sm text-accent-primary hover:underline">
              {t.response.addResponse}
            </button>
          )}
        </div>
      </div>

      {/* Mode selector: Standard | Sequence */}
      <div className="flex items-center gap-1 mb-3">
        <span className="text-xs text-text-muted mr-2">{t.response.responseMode}</span>
        {(['off', 'on'] as const).map(mode => (
          <button
            key={mode}
            onClick={async () => {
              if (mode === 'on' && presets.length === 0) {
                await createPreset(endpoint.id, { name: 'Default' });
              }
              updateEndpoint(endpoint.id, { sequenceMode: mode });
            }}
            className={clsx(
              'text-xs px-3 py-1 rounded-full border transition-colors',
              endpoint.sequenceMode === mode
                ? 'bg-accent-primary text-white border-accent-primary'
                : 'border-border-primary text-text-secondary hover:border-accent-primary',
            )}
          >
            {mode === 'off' ? t.response.modeStandard : t.response.modeSequence}
          </button>
        ))}
      </div>

      {/* Preset list (only in Sequence mode) */}
      {isSequence && (
        <div className="mb-3">
          <div className="text-xs text-text-muted uppercase tracking-wider mb-2">{t.response.presetLabel}</div>
          {presets.map(p => (
            <div
              key={p.id}
              className={clsx(
                'flex items-center gap-3 rounded px-3 py-2 mb-1 cursor-pointer',
                p.id === activePreset?.id ? 'bg-bg-hover' : 'hover:bg-bg-hover',
              )}
              onClick={() => setActivePreset(endpoint.id, p.id)}
            >
              <input
                type="radio"
                name={`preset-${endpoint.id}`}
                checked={p.id === endpoint.activePresetId}
                onChange={() => setActivePreset(endpoint.id, p.id)}
                onClick={e => e.stopPropagation()}
                className="accent-accent-primary"
              />
              <input
                type="text"
                defaultValue={p.name}
                key={`name-${p.id}`}
                onClick={e => e.stopPropagation()}
                onBlur={e => {
                  const name = e.target.value.trim();
                  if (name && name !== p.name) updatePreset(p.id, { name });
                }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder={t.response.presetNamePlaceholder}
                className="text-sm bg-transparent border-none outline-none text-text-primary flex-1 min-w-0"
              />
              <span className={clsx(
                'text-[10px] px-1.5 py-0.5 rounded-full border',
                p.mode === 'sequential'
                  ? 'border-accent-primary/30 text-accent-primary'
                  : 'border-purple-400/30 text-purple-400',
              )}>
                {p.mode === 'sequential' ? t.response.modeSequential : t.response.modeLoop}
              </span>
              {presets.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); deletePreset(p.id); }}
                  className="text-text-muted hover:text-method-delete flex items-center"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => createPreset(endpoint.id)}
            className="text-xs text-accent-primary hover:underline mt-1 ml-3"
          >
            {t.response.newPreset}
          </button>

          {/* Active preset controls */}
          {activePreset && (
            <div className="flex items-center gap-2 mt-3 mb-2">
              {(['sequential', 'loop'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => updatePreset(activePreset.id, { mode })}
                  className={clsx(
                    'text-xs px-3 py-1 rounded-full border transition-colors',
                    activePreset.mode === mode
                      ? 'bg-accent-primary text-white border-accent-primary'
                      : 'border-border-primary text-text-secondary hover:border-accent-primary',
                  )}
                >
                  {mode === 'sequential' ? t.response.modeSequential : t.response.modeLoop}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-text-tertiary">
            {activePreset?.mode === 'sequential' ? t.response.sequentialDescription : t.response.loopDescription}
          </p>
        </div>
      )}

      {/* Variant list */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-text-muted uppercase tracking-wider">{t.response.responseVariants}</div>
          {isSequence && activePreset && (
            <button onClick={async () => {
              const ep = await addPresetVariant(activePreset.id);
              const newVariant = ep.responseVariants?.filter(v => v.presetId === activePreset.id).at(-1);
              if (newVariant) setEditingVariantId(newVariant.id);
            }} className="text-sm text-accent-primary hover:underline">
              {t.response.addResponse}
            </button>
          )}
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={variants.map(v => v.id)} strategy={verticalListSortingStrategy}>
            {variants.map((v, idx) => (
              <SortableVariantRow key={v.id} variant={v}>
                {({ listeners, attributes }) => (
                  <div
                    className={clsx(
                      'flex items-center gap-3 rounded px-3 py-2 mb-1 cursor-pointer',
                      v.id === (editingVariantId ?? activeVariant?.id) ? 'bg-bg-hover' : 'hover:bg-bg-hover',
                    )}
                    onClick={() => { setEditingVariantId(v.id); if (!isSequence) setActiveVariant(endpoint.id, v.id); }}
                  >
                    <button
                      {...listeners}
                      {...attributes}
                      onClick={e => e.stopPropagation()}
                      className="text-text-muted hover:text-text-primary cursor-grab active:cursor-grabbing flex items-center"
                    >
                      <GripVertical size={14} />
                    </button>
                    {isSequence ? (
                      <span className="text-xs font-mono text-text-muted w-6 text-center">{idx + 1}</span>
                    ) : (
                      <input
                        type="radio"
                        name={`variant-${endpoint.id}`}
                        checked={v.id === endpoint.activeVariantId}
                        onChange={() => setActiveVariant(endpoint.id, v.id)}
                        onClick={e => e.stopPropagation()}
                        className="accent-accent-primary"
                      />
                    )}
                    <div className="relative" ref={statusDropdownId === v.id ? dropdownRef : undefined}>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setStatusDropdownId(statusDropdownId === v.id ? null : v.id);
                        }}
                        className="hover:ring-1 hover:ring-accent-primary rounded transition-shadow"
                        title={t.response.changeStatusCode}
                      >
                        <StatusCodeBadge code={v.statusCode} />
                      </button>
                      {statusDropdownId === v.id && (
                        <div className="absolute top-full left-0 mt-1 z-50 bg-bg-surface border border-border-secondary rounded-lg shadow-lg py-1 max-h-60 overflow-y-auto w-56">
                          <div className="pb-1 mb-1 border-b border-border-secondary">
                            <div className="flex items-center gap-1.5 px-3 py-1.5" onClick={e => e.stopPropagation()}>
                              <input
                                type="number"
                                min={100}
                                max={599}
                                value={customCodeInput}
                                onChange={e => setCustomCodeInput(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    const code = parseInt(customCodeInput);
                                    if (validateStatusCode(code)) {
                                      updateVariant(v.id, { statusCode: code });
                                      setStatusDropdownId(null);
                                      setCustomCodeInput('');
                                    }
                                  }
                                  if (e.key === 'Escape') {
                                    setStatusDropdownId(null);
                                    setCustomCodeInput('');
                                  }
                                }}
                                placeholder={t.response.customCode}
                                autoFocus
                                className="flex-1 rounded border border-border-secondary bg-bg-input px-2 py-1 text-sm text-text-primary font-mono outline-none focus:border-accent-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  const code = parseInt(customCodeInput);
                                  if (code >= 100 && code <= 599) {
                                    updateVariant(v.id, { statusCode: code });
                                    setStatusDropdownId(null);
                                    setCustomCodeInput('');
                                  }
                                }}
                                className="text-accent-primary hover:text-accent-primary/80 flex items-center"
                              >
                                <Check size={16} strokeWidth={2.5} />
                              </button>
                            </div>
                          </div>
                          {STATUS_CODES.map(sc => (
                            <button
                              key={sc.code}
                              onClick={e => {
                                e.stopPropagation();
                                updateVariant(v.id, { statusCode: sc.code });
                                setStatusDropdownId(null);
                                setCustomCodeInput('');
                              }}
                              className={clsx(
                                'w-full text-left px-3 py-1.5 text-sm hover:bg-bg-hover flex items-center gap-2',
                                v.statusCode === sc.code && 'text-accent-primary font-medium',
                              )}
                            >
                              <StatusCodeBadge code={sc.code} />
                              <span className="text-text-secondary">{sc.label.slice(4)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="flex-1 text-sm text-text-secondary flex items-center gap-1.5">
                      {v.description}
                      {v.matchRules && (() => {
                        const count = (v.matchRules.bodyRules?.length ?? 0) + (v.matchRules.headerRules?.length ?? 0) + (v.matchRules.queryParamRules?.length ?? 0) + (v.matchRules.pathParamRules?.length ?? 0);
                        return count > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-accent-primary bg-accent-primary/10 px-1.5 py-0.5 rounded-full" title={t.response.matchConditions}>
                            <Filter size={10} /> {count}
                          </span>
                        ) : null;
                      })()}
                    </span>
                    {(isSequence || variants.length > 1) && (
                      <button
                        onClick={e => { e.stopPropagation(); deleteVariant(v.id); }}
                        className="text-text-muted hover:text-method-delete flex items-center"
                      >
                        <X size={14} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                )}
              </SortableVariantRow>
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Variant editor */}
      {selectedVariant && (
        <VariantEditor
          key={selectedVariant.id}
          variant={selectedVariant}
          updateVariant={updateVariant}
          handleBodyChange={handleBodyChange}
          handleBeautify={handleBeautify}
        />
      )}
    </div>
  );
}

function VariantEditor({
  variant,
  updateVariant,
  handleBodyChange,
  handleBeautify,
}: {
  variant: ResponseVariant;
  updateVariant: (id: string, data: Partial<ResponseVariant>) => Promise<void>;
  handleBodyChange: (body: string) => void;
  handleBeautify: () => void;
}) {
  const t = useTranslation();
  const globalDelay = useSettingsStore(s => s.settings.responseDelay);
  const [description, setDescription] = useState(variant.description);
  const [delay, setDelay] = useState(String(variant.delay ?? ''));
  const [memo, setMemo] = useState(variant.memo);

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.response.descriptionLabel}</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            onBlur={() => { if (description !== variant.description) updateVariant(variant.id, { description }); }}
            className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
          />
        </div>
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.response.delay}</label>
          <input
            type="number"
            value={delay}
            onChange={e => setDelay(e.target.value)}
            onBlur={() => {
              const parsed = delay ? parseFloat(delay) : null;
              if (parsed !== (variant.delay ?? null)) updateVariant(variant.id, { delay: parsed });
            }}
            placeholder={String(globalDelay || 0)}
            className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <p className="mt-1 text-xs text-text-muted">
            {variant.delay != null ? '' : globalDelay ? fmt(t.response.globalDefault, globalDelay) : t.response.noDelay}
          </p>
        </div>
      </div>

      <div className="mb-2">
        <label className="block text-xs text-text-tertiary mb-1 uppercase tracking-wider">{t.response.memo}</label>
        <textarea
          value={memo}
          onChange={e => setMemo(e.target.value)}
          onBlur={() => { if (memo !== variant.memo) updateVariant(variant.id, { memo }); }}
          rows={2}
          className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary resize-none"
          placeholder={t.response.memoPlaceholder}
        />
      </div>

      {/* Match Rules */}
      <MatchRulesEditor rules={variant.matchRules} onChange={rules => updateVariant(variant.id, { matchRules: rules })} />

      {/* Dataset binding */}
      <DatasetBindingEditor binding={variant.datasetBinding ?? null} onChange={binding => updateVariant(variant.id, { datasetBinding: binding })} />

      {/* Response Headers */}
      <HeadersJsonEditor
        value={variant.headers}
        onChange={headers => updateVariant(variant.id, { headers })}
        title={t.response.responseHeaders}
        addLabel={t.response.addResponseHeader}
        keyLabel={t.response.responseHeaderKey}
        valueLabel={t.response.responseHeaderValue}
        resetKey={variant.id}
      />

      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-text-tertiary uppercase tracking-wider">{t.response.responseBody}</label>
        <button onClick={handleBeautify} className="text-sm text-accent-primary hover:underline">
          {t.response.formatJson}
        </button>
      </div>
      <div className="rounded border border-border-secondary overflow-hidden">
        <CodeEditor
          value={variant.body}
          onChange={handleBodyChange}
          height="500px"
        />
      </div>
    </div>
  );
}
