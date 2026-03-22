import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Filter, Trash2 } from 'lucide-react';
import { useWsEndpointStore } from '../../stores/ws-endpoint.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useTranslation, fmt } from '../../i18n';
import { CodeEditor } from '../shared/CodeEditor';
import { formatJson } from '../../utils/json';
import type { WsEndpoint, WsResponseFrame, MatchRules, MatchRule } from '../../types';
import clsx from 'clsx';

export function WsEndpointEditor() {
  const t = useTranslation();
  const endpoints = useWsEndpointStore(s => s.endpoints);
  const selectedId = useWsEndpointStore(s => s.selectedId);
  const updateEndpoint = useWsEndpointStore(s => s.updateEndpoint);
  const serverStatus = useSettingsStore(s => s.serverStatus);

  const [editingPath, setEditingPath] = useState(false);
  const [pathValue, setPathValue] = useState('');
  const [nameValue, setNameValue] = useState('');
  const [error, setError] = useState('');

  const endpoint = endpoints.find(e => e.id === selectedId);

  useEffect(() => {
    setNameValue(endpoint?.name ?? '');
  }, [endpoint?.id, endpoint?.name]);

  useEffect(() => {
    setEditingPath(false);
    setError('');
  }, [selectedId]);

  if (!endpoint) {
    return (
      <div className="flex flex-1 items-center justify-center text-text-muted text-sm">
        {t.wsEditor.selectEndpoint}
      </div>
    );
  }

  const startEditPath = () => {
    setPathValue(endpoint.path);
    setEditingPath(true);
    setError('');
  };

  const savePath = async () => {
    const trimmed = pathValue.trim();
    if (!trimmed) {
      setError(t.validation.pathRequired);
      return;
    }
    if (trimmed !== endpoint.path) {
      try {
        await updateEndpoint(endpoint.id, { path: trimmed });
        setError('');
      } catch (e: any) {
        setError(e.message || t.validation.pathRequired);
        return;
      }
    }
    setEditingPath(false);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border-primary px-6 py-3">
        <span className="inline-flex items-center rounded px-2 py-0.5 font-mono text-xs font-bold bg-accent-primary/15 text-accent-primary">
          WS
        </span>

        {editingPath ? (
          <input
            value={pathValue}
            onChange={e => { setPathValue(e.target.value); setError(''); }}
            onBlur={savePath}
            onKeyDown={e => {
              if (e.key === 'Enter') savePath();
              if (e.key === 'Escape') { setEditingPath(false); setError(''); }
            }}
            className="flex-1 rounded border border-border-secondary bg-bg-input px-2 py-1 font-mono text-base text-text-primary outline-none focus:border-accent-primary"
            autoFocus
          />
        ) : (
          <span
            onClick={startEditPath}
            className="font-mono text-base text-text-primary cursor-pointer hover:text-accent-primary transition-colors"
            title={t.editor.clickToEditPath}
          >
            {endpoint.path}
          </span>
        )}
        {error && <span className="text-xs text-method-delete">{error}</span>}
      </div>

      {/* Alias bar */}
      <div className="flex items-center gap-3 px-6 py-1.5 border-b border-border-primary">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">{t.editor.alias}</span>
          <input
            type="text"
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            onBlur={() => { if (nameValue !== endpoint.name) updateEndpoint(endpoint.id, { name: nameValue }); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur(); }}
            placeholder={t.editor.enterAlias}
            className="w-40 rounded border border-border-secondary bg-bg-input px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary placeholder:text-text-muted/50"
          />
        </div>
        <span className="text-xs text-text-muted font-mono truncate">
          {`ws://${serverStatus.localIp}:${serverStatus.port}${endpoint.path}`}
        </span>
      </div>

      {/* Frames editor */}
      <div className="flex-1 overflow-y-auto p-6">
        <WsFramesTab endpoint={endpoint} />
      </div>
    </div>
  );
}

function WsFramesTab({ endpoint }: { endpoint: WsEndpoint }) {
  const t = useTranslation();
  const setActiveFrame = useWsEndpointStore(s => s.setActiveFrame);
  const addFrame = useWsEndpointStore(s => s.addFrame);
  const updateFrame = useWsEndpointStore(s => s.updateFrame);
  const deleteFrame = useWsEndpointStore(s => s.deleteFrame);

  const frames = endpoint.responseFrames ?? [];
  const activeFrame = frames.find(f => f.id === endpoint.activeFrameId) ?? frames[0];
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);

  const selectedFrame = editingFrameId
    ? frames.find(f => f.id === editingFrameId) ?? activeFrame
    : activeFrame;

  const handleBodyChange = useCallback((messageBody: string) => {
    if (selectedFrame) updateFrame(selectedFrame.id, { messageBody });
  }, [selectedFrame, updateFrame]);

  const handleBeautify = useCallback(() => {
    if (!selectedFrame) return;
    const formatted = formatJson(selectedFrame.messageBody);
    if (formatted !== selectedFrame.messageBody) {
      updateFrame(selectedFrame.id, { messageBody: formatted });
    }
  }, [selectedFrame, updateFrame]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-base font-semibold text-text-primary">{t.wsEditor.title}</h3>
          <p className="text-xs text-text-tertiary mt-0.5">{t.wsEditor.description}</p>
        </div>
        <button
          onClick={async () => {
            const ep = await addFrame(endpoint.id);
            const newFrame = ep.responseFrames?.[ep.responseFrames.length - 1];
            if (newFrame) setEditingFrameId(newFrame.id);
          }}
          className="text-sm text-accent-primary hover:underline"
        >
          {t.wsEditor.addFrame}
        </button>
      </div>

      {/* Frame list */}
      <div className="mb-4">
        <div className="text-xs text-text-muted uppercase tracking-wider mb-2">{t.wsEditor.responseFrames}</div>
        {frames.map(f => (
          <div
            key={f.id}
            className={clsx(
              'flex items-center gap-3 rounded px-3 py-2 mb-1 cursor-pointer',
              f.id === (editingFrameId ?? activeFrame?.id) ? 'bg-bg-hover' : 'hover:bg-bg-hover',
            )}
            onClick={() => { setEditingFrameId(f.id); setActiveFrame(endpoint.id, f.id); }}
          >
            <input
              type="radio"
              name={`frame-${endpoint.id}`}
              checked={f.id === endpoint.activeFrameId}
              onChange={() => setActiveFrame(endpoint.id, f.id)}
              onClick={e => e.stopPropagation()}
              className="accent-accent-primary"
            />
            <span className="flex-1 text-sm text-text-secondary flex items-center gap-1.5">
              {f.trigger === 'connect' && (
                <span className="inline-flex items-center text-[10px] text-method-post bg-method-post/10 px-1.5 py-0.5 rounded-full">
                  connect
                </span>
              )}
              {f.label || <span className="text-text-muted italic">{t.wsEditor.unnamedFrame}</span>}
              {f.matchRules && (() => {
                const count = (f.matchRules.bodyRules?.length ?? 0) + (f.matchRules.headerRules?.length ?? 0) + (f.matchRules.queryParamRules?.length ?? 0) + (f.matchRules.pathParamRules?.length ?? 0);
                return count > 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-accent-primary bg-accent-primary/10 px-1.5 py-0.5 rounded-full">
                    <Filter size={10} /> {count}
                  </span>
                ) : null;
              })()}
            </span>
            {frames.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); deleteFrame(f.id); }}
                className="text-text-muted hover:text-method-delete flex items-center"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Frame editor */}
      {selectedFrame && (
        <WsFrameEditor
          key={selectedFrame.id}
          frame={selectedFrame}
          updateFrame={updateFrame}
          handleBodyChange={handleBodyChange}
          handleBeautify={handleBeautify}
        />
      )}
    </div>
  );
}

function WsFrameEditor({
  frame,
  updateFrame,
  handleBodyChange,
  handleBeautify,
}: {
  frame: WsResponseFrame;
  updateFrame: (id: string, data: Partial<WsResponseFrame>) => Promise<void>;
  handleBodyChange: (body: string) => void;
  handleBeautify: () => void;
}) {
  const t = useTranslation();
  const globalDelay = useSettingsStore(s => s.settings.responseDelay);
  const [label, setLabel] = useState(frame.label);
  const [delay, setDelay] = useState(String(frame.delay ?? ''));
  const [intervalMin, setIntervalMin] = useState(String(frame.intervalMin ?? ''));
  const [intervalMax, setIntervalMax] = useState(String(frame.intervalMax ?? ''));
  const [memo, setMemo] = useState(frame.memo);

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.wsEditor.frameLabel}</label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            onBlur={() => { if (label !== frame.label) updateFrame(frame.id, { label }); }}
            className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
          />
        </div>
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.wsEditor.trigger}</label>
          <select
            value={frame.trigger ?? 'message'}
            onChange={e => updateFrame(frame.id, { trigger: e.target.value as 'message' | 'connect' })}
            className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
          >
            <option value="message">{t.wsEditor.triggerMessage}</option>
            <option value="connect">{t.wsEditor.triggerConnect}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-tertiary mb-1">{t.response.delay}</label>
          <input
            type="number"
            value={delay}
            onChange={e => setDelay(e.target.value)}
            onBlur={() => {
              const parsed = delay ? parseFloat(delay) : null;
              if (parsed !== (frame.delay ?? null)) updateFrame(frame.id, { delay: parsed });
            }}
            placeholder={String(globalDelay || 0)}
            className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <p className="mt-1 text-xs text-text-muted">
            {frame.delay != null ? '' : globalDelay ? fmt(t.response.globalDefault, globalDelay) : t.response.noDelay}
          </p>
        </div>
      </div>

      {/* Interval settings (connect trigger only) */}
      {frame.trigger === 'connect' && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-text-tertiary mb-1">{t.wsEditor.intervalMin}</label>
            <input
              type="number"
              value={intervalMin}
              onChange={e => setIntervalMin(e.target.value)}
              onBlur={() => {
                const parsed = intervalMin ? parseFloat(intervalMin) : null;
                if (parsed !== (frame.intervalMin ?? null)) updateFrame(frame.id, { intervalMin: parsed });
              }}
              placeholder="0"
              min="0"
              step="0.1"
              className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-tertiary mb-1">{t.wsEditor.intervalMax}</label>
            <input
              type="number"
              value={intervalMax}
              onChange={e => setIntervalMax(e.target.value)}
              onBlur={() => {
                const parsed = intervalMax ? parseFloat(intervalMax) : null;
                if (parsed !== (frame.intervalMax ?? null)) updateFrame(frame.id, { intervalMax: parsed });
              }}
              placeholder="0"
              min="0"
              step="0.1"
              className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <p className="col-span-2 text-xs text-text-muted -mt-2">{t.wsEditor.intervalHelp}</p>
        </div>
      )}

      <div className="mb-4">
        <label className="block text-xs text-text-tertiary mb-1 uppercase tracking-wider">{t.response.memo}</label>
        <textarea
          value={memo}
          onChange={e => setMemo(e.target.value)}
          onBlur={() => { if (memo !== frame.memo) updateFrame(frame.id, { memo }); }}
          rows={2}
          className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary resize-none"
          placeholder={t.response.memoPlaceholder}
        />
      </div>

      {/* Match Rules */}
      <WsMatchRulesEditor frame={frame} updateFrame={updateFrame} />

      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-text-tertiary uppercase tracking-wider">{t.wsEditor.messageBody}</label>
        <button onClick={handleBeautify} className="text-sm text-accent-primary hover:underline">
          {t.response.formatJson}
        </button>
      </div>
      <div className="rounded border border-border-secondary overflow-hidden">
        <CodeEditor
          value={frame.messageBody}
          onChange={handleBodyChange}
          height="500px"
        />
      </div>
    </div>
  );
}

function WsMatchRulesEditor({
  frame,
  updateFrame,
}: {
  frame: WsResponseFrame;
  updateFrame: (id: string, data: Partial<WsResponseFrame>) => Promise<void>;
}) {
  const t = useTranslation();
  const rules: MatchRules = frame.matchRules ?? { bodyRules: [], headerRules: [], queryParamRules: [], pathParamRules: [], combineWith: 'AND' };
  const totalRules = (rules.bodyRules?.length ?? 0) + (rules.headerRules?.length ?? 0) + (rules.queryParamRules?.length ?? 0) + (rules.pathParamRules?.length ?? 0);
  const hasRules = totalRules > 0;

  const save = (next: MatchRules) => {
    const isEmpty = (next.bodyRules?.length ?? 0) === 0 && (next.headerRules?.length ?? 0) === 0 && (next.queryParamRules?.length ?? 0) === 0 && (next.pathParamRules?.length ?? 0) === 0;
    updateFrame(frame.id, { matchRules: isEmpty ? null : next });
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
              <WsRuleRow
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
              <WsRuleRow
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
              <WsRuleRow
                key={idx}
                rule={rule}
                fieldPlaceholder="e.g. page"
                onChange={patch => updateRule('queryParamRules', idx, patch)}
                onRemove={() => removeRule('queryParamRules', idx)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WsRuleRow({
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
