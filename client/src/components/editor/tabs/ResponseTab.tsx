import { useCallback, useState, useRef, useEffect } from 'react';
import { Check, X, Plus, Trash2, Filter } from 'lucide-react';
import { useEndpointStore } from '../../../stores/endpoint.store';
import { useSettingsStore } from '../../../stores/settings.store';
import { StatusCodeBadge } from '../../shared/StatusCodeBadge';
import { CodeEditor } from '../../shared/CodeEditor';
import { useTranslation, fmt } from '../../../i18n';
import { STATUS_CODES } from '../../../utils/http';
import { formatJson } from '../../../utils/json';
import { validateStatusCode } from '../../../utils/validation';
import type { Endpoint, ResponseVariant, MatchRules, MatchRule } from '../../../types';
import clsx from 'clsx';

export function ResponseTab({ endpoint }: { endpoint: Endpoint }) {
  const t = useTranslation();
  const setActiveVariant = useEndpointStore(s => s.setActiveVariant);
  const addVariant = useEndpointStore(s => s.addVariant);
  const updateVariant = useEndpointStore(s => s.updateVariant);
  const deleteVariant = useEndpointStore(s => s.deleteVariant);

  const variants = endpoint.responseVariants ?? [];
  const activeVariant = variants.find(v => v.id === endpoint.activeVariantId) ?? variants[0];
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const [customCodeInput, setCustomCodeInput] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedVariant = editingVariantId
    ? variants.find(v => v.id === editingVariantId) ?? activeVariant
    : activeVariant;

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
        <button onClick={async () => {
          const ep = await addVariant(endpoint.id);
          const newVariant = ep.responseVariants?.[ep.responseVariants.length - 1];
          if (newVariant) setEditingVariantId(newVariant.id);
        }} className="text-sm text-accent-primary hover:underline">
          {t.response.addResponse}
        </button>
      </div>

      {/* Variant list */}
      <div className="mb-4">
        <div className="text-xs text-text-muted uppercase tracking-wider mb-2">{t.response.responseVariants}</div>
        {variants.map(v => (
          <div
            key={v.id}
            className={clsx(
              'flex items-center gap-3 rounded px-3 py-2 mb-1 cursor-pointer',
              v.id === (editingVariantId ?? activeVariant?.id) ? 'bg-bg-hover' : 'hover:bg-bg-hover',
            )}
            onClick={() => { setEditingVariantId(v.id); setActiveVariant(endpoint.id, v.id); }}
          >
            <input
              type="radio"
              name={`variant-${endpoint.id}`}
              checked={v.id === endpoint.activeVariantId}
              onChange={() => setActiveVariant(endpoint.id, v.id)}
              onClick={e => e.stopPropagation()}
              className="accent-accent-primary"
            />
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
              {v.matchRules && (v.matchRules.bodyRules.length > 0 || v.matchRules.headerRules.length > 0) && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-accent-primary bg-accent-primary/10 px-1.5 py-0.5 rounded-full" title={t.response.matchConditions}>
                  <Filter size={10} /> {v.matchRules.bodyRules.length + v.matchRules.headerRules.length}
                </span>
              )}
            </span>
            {variants.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); deleteVariant(v.id); }}
                className="text-text-muted hover:text-method-delete flex items-center"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        ))}
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
      <MatchRulesEditor variant={variant} updateVariant={updateVariant} />

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

function MatchRulesEditor({
  variant,
  updateVariant,
}: {
  variant: ResponseVariant;
  updateVariant: (id: string, data: Partial<ResponseVariant>) => Promise<void>;
}) {
  const t = useTranslation();
  const rules: MatchRules = variant.matchRules ?? { bodyRules: [], headerRules: [], queryParamRules: [], pathParamRules: [], combineWith: 'AND' };
  const totalRules = (rules.bodyRules?.length ?? 0) + (rules.headerRules?.length ?? 0) + (rules.queryParamRules?.length ?? 0) + (rules.pathParamRules?.length ?? 0);
  const hasRules = totalRules > 0;

  const save = (next: MatchRules) => {
    const isEmpty = (next.bodyRules?.length ?? 0) === 0 && (next.headerRules?.length ?? 0) === 0 && (next.queryParamRules?.length ?? 0) === 0 && (next.pathParamRules?.length ?? 0) === 0;
    updateVariant(variant.id, { matchRules: isEmpty ? null : next });
  };

  const addRule = (key: keyof Pick<MatchRules, 'bodyRules' | 'headerRules' | 'queryParamRules' | 'pathParamRules'>) => {
    save({ ...rules, [key]: [...(rules[key] ?? []), { field: '', operator: 'equals', value: '' }] });
  };

  const updateRule = (key: keyof Pick<MatchRules, 'bodyRules' | 'headerRules' | 'queryParamRules' | 'pathParamRules'>, idx: number, patch: Partial<MatchRule>) => {
    const next = [...(rules[key] ?? [])];
    next[idx] = { ...next[idx], ...patch };
    save({ ...rules, [key]: next });
  };

  const removeRule = (key: keyof Pick<MatchRules, 'bodyRules' | 'headerRules' | 'queryParamRules' | 'pathParamRules'>, idx: number) => {
    save({ ...rules, [key]: (rules[key] ?? []).filter((_, i) => i !== idx) });
  };

  const toggleCombine = () => {
    save({ ...rules, combineWith: rules.combineWith === 'AND' ? 'OR' : 'AND' });
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary uppercase tracking-wider">
          <Filter size={12} />
          {t.response.matchConditions}
          {hasRules && (
            <span className="text-accent-primary bg-accent-primary/10 px-1.5 py-0.5 rounded-full text-[10px] normal-case">
              {totalRules}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => addRule('bodyRules')} className="text-xs text-accent-primary hover:underline flex items-center gap-0.5">
            <Plus size={12} /> {t.response.addBody}
          </button>
          <button onClick={() => addRule('headerRules')} className="text-xs text-accent-primary hover:underline flex items-center gap-0.5">
            <Plus size={12} /> {t.response.addHeader}
          </button>
          <button onClick={() => addRule('queryParamRules')} className="text-xs text-accent-primary hover:underline flex items-center gap-0.5">
            <Plus size={12} /> {t.response.addQueryParam}
          </button>
          <button onClick={() => addRule('pathParamRules')} className="text-xs text-accent-primary hover:underline flex items-center gap-0.5">
            <Plus size={12} /> {t.response.addPathParam}
          </button>
        </div>
      </div>

      <div className="rounded border border-border-secondary bg-bg-surface/50 p-3 space-y-2">
        {!hasRules && (
          <p className="text-xs text-text-muted text-center py-2 whitespace-pre-line">
            {t.response.noConditions}
          </p>
        )}

        {hasRules && totalRules > 1 && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-text-tertiary">{t.response.combine}</span>
            <button
              onClick={toggleCombine}
              className={clsx(
                'text-xs px-2 py-0.5 rounded font-medium',
                rules.combineWith === 'AND'
                  ? 'bg-accent-primary/15 text-accent-primary'
                  : 'bg-method-patch/15 text-method-patch',
              )}
            >
              {rules.combineWith}
            </button>
          </div>
        )}

        {(rules.bodyRules?.length ?? 0) > 0 && (
          <div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{t.response.bodyRules}</div>
            {rules.bodyRules.map((rule, idx) => (
              <RuleRow
                key={idx}
                rule={rule}
                fieldPlaceholder="e.g. user.role"
                onChange={patch => updateRule('bodyRules', idx, patch)}
                onRemove={() => removeRule('bodyRules', idx)}
              />
            ))}
          </div>
        )}

        {(rules.headerRules?.length ?? 0) > 0 && (
          <div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{t.response.headerRules}</div>
            {rules.headerRules.map((rule, idx) => (
              <RuleRow
                key={idx}
                rule={rule}
                fieldPlaceholder="e.g. x-api-key"
                onChange={patch => updateRule('headerRules', idx, patch)}
                onRemove={() => removeRule('headerRules', idx)}
              />
            ))}
          </div>
        )}

        {(rules.queryParamRules?.length ?? 0) > 0 && (
          <div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{t.response.queryParamRules}</div>
            {rules.queryParamRules.map((rule, idx) => (
              <RuleRow
                key={idx}
                rule={rule}
                fieldPlaceholder="e.g. page"
                onChange={patch => updateRule('queryParamRules', idx, patch)}
                onRemove={() => removeRule('queryParamRules', idx)}
              />
            ))}
          </div>
        )}

        {(rules.pathParamRules?.length ?? 0) > 0 && (
          <div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{t.response.pathParamRules}</div>
            {rules.pathParamRules.map((rule, idx) => (
              <RuleRow
                key={idx}
                rule={rule}
                fieldPlaceholder="e.g. id"
                onChange={patch => updateRule('pathParamRules', idx, patch)}
                onRemove={() => removeRule('pathParamRules', idx)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RuleRow({
  rule,
  fieldPlaceholder,
  onChange,
  onRemove,
}: {
  rule: MatchRule;
  fieldPlaceholder: string;
  onChange: (patch: Partial<MatchRule>) => void;
  onRemove: () => void;
}) {
  const t = useTranslation();

  const OPERATORS: { value: MatchRule['operator']; label: string }[] = [
    { value: 'equals', label: t.operators.equals },
    { value: 'contains', label: t.operators.contains },
    { value: 'startsWith', label: t.operators.startsWith },
    { value: 'endsWith', label: t.operators.endsWith },
    { value: 'regex', label: t.operators.regex },
  ];

  return (
    <div className="flex items-center gap-1.5 mb-1">
      <input
        type="text"
        value={rule.field}
        onChange={e => onChange({ field: e.target.value })}
        placeholder={fieldPlaceholder}
        className="flex-1 min-w-0 rounded border border-border-secondary bg-bg-input px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary font-mono"
      />
      <select
        value={rule.operator}
        onChange={e => onChange({ operator: e.target.value as MatchRule['operator'] })}
        className="rounded border border-border-secondary bg-bg-input px-1.5 py-1 text-xs text-text-primary outline-none focus:border-accent-primary"
      >
        {OPERATORS.map(op => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>
      <input
        type="text"
        value={rule.value}
        onChange={e => onChange({ value: e.target.value })}
        placeholder="value"
        className="flex-1 min-w-0 rounded border border-border-secondary bg-bg-input px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary font-mono"
      />
      <button onClick={onRemove} className="text-text-muted hover:text-method-delete flex-shrink-0">
        <Trash2 size={13} />
      </button>
    </div>
  );
}
