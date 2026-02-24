import { useCallback, useState, useRef, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { useEndpointStore } from '../../../stores/endpoint.store';
import { StatusCodeBadge } from '../../shared/StatusCodeBadge';
import { CodeEditor } from '../../shared/CodeEditor';
import { STATUS_CODES } from '../../../utils/http';
import { formatJson } from '../../../utils/json';
import { validateStatusCode } from '../../../utils/validation';
import type { Endpoint, ResponseVariant } from '../../../types';
import clsx from 'clsx';

export function ResponseTab({ endpoint }: { endpoint: Endpoint }) {
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
          <h3 className="text-base font-semibold text-text-primary">Mock Response</h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            Define the mock responses. Set the active response variant to control what the endpoint returns.
          </p>
        </div>
        <button onClick={() => addVariant(endpoint.id)} className="text-sm text-accent-primary hover:underline">
          + Add Response
        </button>
      </div>

      {/* Variant list */}
      <div className="mb-4">
        <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Response Variants</div>
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
                title="Change status code"
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
                        placeholder="Custom code (100-599)"
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
            <span className="flex-1 text-sm text-text-secondary">{v.description}</span>
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
  const [description, setDescription] = useState(variant.description);
  const [delay, setDelay] = useState(String(variant.delay ?? ''));
  const [memo, setMemo] = useState(variant.memo);

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs text-text-tertiary mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            onBlur={() => { if (description !== variant.description) updateVariant(variant.id, { description }); }}
            className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
          />
        </div>
        <div>
          <label className="block text-xs text-text-tertiary mb-1">Delay (ms)</label>
          <input
            type="number"
            value={delay}
            onChange={e => setDelay(e.target.value)}
            onBlur={() => {
              const parsed = delay ? parseFloat(delay) : null;
              if (parsed !== (variant.delay ?? null)) updateVariant(variant.id, { delay: parsed });
            }}
            placeholder="0"
            className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      </div>

      <div className="mb-2">
        <label className="block text-xs text-text-tertiary mb-1 uppercase tracking-wider">Memo</label>
        <textarea
          value={memo}
          onChange={e => setMemo(e.target.value)}
          onBlur={() => { if (memo !== variant.memo) updateVariant(variant.id, { memo }); }}
          rows={2}
          className="w-full rounded border border-border-secondary bg-bg-input px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary resize-none"
          placeholder="Notes about this response variant..."
        />
      </div>

      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-text-tertiary uppercase tracking-wider">Response Body</label>
        <button onClick={handleBeautify} className="text-sm text-accent-primary hover:underline">
          Format JSON
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
