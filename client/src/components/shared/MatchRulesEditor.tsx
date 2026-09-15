import { Plus, Filter, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from '../../i18n';
import type { MatchRules, MatchRule } from '../../types';

export type RuleKind = 'bodyRules' | 'headerRules' | 'queryParamRules' | 'pathParamRules';

const ALL_KINDS: RuleKind[] = ['bodyRules', 'headerRules', 'queryParamRules', 'pathParamRules'];

const EMPTY: MatchRules = { bodyRules: [], headerRules: [], queryParamRules: [], pathParamRules: [], combineWith: 'AND' };

const FIELD_PLACEHOLDER: Record<RuleKind, string> = {
  bodyRules: 'e.g. user.role',
  headerRules: 'e.g. x-api-key',
  queryParamRules: 'e.g. page',
  pathParamRules: 'e.g. id',
};

/**
 * Conditional match-rule editor shared by HTTP response variants and STOMP
 * message variants. `kinds` limits which rule groups are offered; `labels`
 * overrides a group's title (STOMP calls path params "captures").
 */
export function MatchRulesEditor({
  rules: value,
  onChange,
  kinds = ALL_KINDS,
  labels,
  placeholders,
}: {
  rules: MatchRules | null;
  onChange: (rules: MatchRules | null) => void;
  kinds?: RuleKind[];
  labels?: Partial<Record<RuleKind, string>>;
  placeholders?: Partial<Record<RuleKind, string>>;
}) {
  const t = useTranslation();
  const rules: MatchRules = value ?? EMPTY;
  const totalRules = ALL_KINDS.reduce((n, k) => n + (rules[k]?.length ?? 0), 0);
  const hasRules = totalRules > 0;

  const addLabels: Record<RuleKind, string> = {
    bodyRules: t.response.addBody,
    headerRules: t.response.addHeader,
    queryParamRules: t.response.addQueryParam,
    pathParamRules: t.response.addPathParam,
  };
  const sectionLabels: Record<RuleKind, string> = {
    bodyRules: t.response.bodyRules,
    headerRules: t.response.headerRules,
    queryParamRules: t.response.queryParamRules,
    pathParamRules: t.response.pathParamRules,
    ...labels,
  };

  const save = (next: MatchRules) => {
    const isEmpty = ALL_KINDS.every(k => (next[k]?.length ?? 0) === 0);
    onChange(isEmpty ? null : next);
  };

  const addRule = (key: RuleKind) => {
    save({ ...rules, [key]: [...(rules[key] ?? []), { field: '', operator: 'equals', value: '' }] });
  };

  const updateRule = (key: RuleKind, idx: number, patch: Partial<MatchRule>) => {
    const next = [...(rules[key] ?? [])];
    next[idx] = { ...next[idx], ...patch };
    save({ ...rules, [key]: next });
  };

  const removeRule = (key: RuleKind, idx: number) => {
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
          {kinds.map(kind => (
            <button key={kind} onClick={() => addRule(kind)} className="text-xs text-accent-primary hover:underline flex items-center gap-0.5">
              <Plus size={12} /> {labels?.[kind] ?? addLabels[kind]}
            </button>
          ))}
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

        {ALL_KINDS.map(kind => (rules[kind]?.length ?? 0) > 0 && (
          <div key={kind}>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{sectionLabels[kind]}</div>
            {rules[kind].map((rule, idx) => (
              <RuleRow
                key={idx}
                rule={rule}
                fieldPlaceholder={placeholders?.[kind] ?? FIELD_PLACEHOLDER[kind]}
                onChange={patch => updateRule(kind, idx, patch)}
                onRemove={() => removeRule(kind, idx)}
              />
            ))}
          </div>
        ))}
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
