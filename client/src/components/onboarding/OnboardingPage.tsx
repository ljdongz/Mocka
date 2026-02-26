import { Braces, SlidersHorizontal, Layers, Reply, Route, ArrowUpDown, X, Sparkles, Info, Check } from 'lucide-react';
import { useUIStore } from '../../stores/ui.store';
import { ModalOverlay } from '../shared/ModalOverlay';
import { useTranslation } from '../../i18n';

export function OnboardingPage() {
  const t = useTranslation();
  const showOnboarding = useUIStore(s => s.showOnboarding);
  const setShowOnboarding = useUIStore(s => s.setShowOnboarding);

  const handleClose = () => setShowOnboarding(false);

  const features = [
    {
      key: 'dynamicTemplates',
      icon: Braces,
      iconColor: 'text-accent-primary',
      iconBg: 'bg-accent-primary/10',
      title: t.onboarding.dynamicTemplates,
      description: t.onboarding.dynamicTemplatesDesc,
      preview: TemplatePreview,
    },
    {
      key: 'conditionalMatchRules',
      icon: SlidersHorizontal,
      iconColor: 'text-method-patch',
      iconBg: 'bg-method-patch/10',
      title: t.onboarding.conditionalMatchRules,
      description: t.onboarding.conditionalMatchRulesDesc,
      preview: MatchRulesPreview,
    },
    {
      key: 'environmentVariables',
      icon: Layers,
      iconColor: 'text-method-get',
      iconBg: 'bg-method-get/10',
      title: t.onboarding.environmentVariables,
      description: t.onboarding.environmentVariablesDesc,
      preview: EnvironmentPreview,
    },
    {
      key: 'requestContextHelpers',
      icon: Reply,
      iconColor: 'text-method-post',
      iconBg: 'bg-method-post/10',
      title: t.onboarding.requestContextHelpers,
      description: t.onboarding.requestContextHelpersDesc,
      preview: RequestHelpersPreview,
    },
    {
      key: 'pathParameters',
      icon: Route,
      iconColor: 'text-method-put',
      iconBg: 'bg-accent-primary/10',
      title: t.onboarding.pathParameters,
      description: t.onboarding.pathParametersDesc,
      preview: PathParamsPreview,
    },
    {
      key: 'importExport',
      icon: ArrowUpDown,
      iconColor: 'text-method-delete',
      iconBg: 'bg-method-delete/10',
      title: t.onboarding.importExportTitle,
      description: t.onboarding.importExportDesc,
      preview: ImportExportPreview,
    },
  ];

  return (
    <ModalOverlay open={showOnboarding} onClose={handleClose}>
      <div className="flex max-h-[80vh] w-[1100px] flex-col rounded-2xl border border-border-secondary bg-bg-page shadow-xl">
        {/* Fixed top bar */}
        <div className="flex flex-shrink-0 items-center justify-between rounded-t-2xl border-b border-border-primary bg-bg-page px-6 py-3">
          <span className="text-sm font-semibold text-text-primary">{t.onboarding.featureGuide}</span>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="min-h-0 overflow-y-auto">
          {/* Header */}
          <div className="flex flex-col items-center gap-3 px-12 pt-8 pb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-primary px-4 py-1.5 text-xs font-semibold text-white">
              <Sparkles size={14} />
              {t.onboarding.welcomeTo}
            </span>
            <h1 className="text-2xl font-bold text-text-primary">
              {t.onboarding.buildMockApis}
            </h1>
            <p className="max-w-xl text-center text-sm leading-relaxed text-text-tertiary">
              {t.onboarding.welcomeDescription}
            </p>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-3 gap-4 px-12 pb-10">
            {features.map((f) => (
              <div
                key={f.key}
                className="flex flex-col rounded-xl border border-border-secondary bg-bg-surface p-5"
              >
                {/* Preview */}
                <div className="mb-3 flex h-[140px] items-center overflow-hidden rounded-lg border border-border-primary bg-bg-page">
                  <div className="w-full">
                    <f.preview />
                  </div>
                </div>

                {/* Icon + Title */}
                <div className="mb-3 flex items-center gap-2.5">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${f.iconBg}`}>
                    <f.icon size={16} className={f.iconColor} />
                  </div>
                  <span className="text-sm font-semibold text-text-primary">{f.title}</span>
                </div>

                {/* Description */}
                <p className="text-xs leading-relaxed text-text-tertiary">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ── Preview Components ── */

function CodeLine({ pairs }: { pairs: [string, string][] }) {
  return (
    <div className="flex gap-1">
      {pairs.map(([text, color], i) => (
        <span key={i} className={`font-mono text-[10px] ${color}`}>{text}</span>
      ))}
    </div>
  );
}

function TemplatePreview() {
  return (
    <div className="flex flex-col gap-1 p-3">
      <CodeLine pairs={[
        ['"id"', 'text-code-key'], [':', 'text-text-muted'], ['"{{$randomUUID}}"', 'text-code-string'],
      ]} />
      <CodeLine pairs={[
        ['"name"', 'text-code-key'], [':', 'text-text-muted'], ['"{{$randomFullName}}"', 'text-code-string'],
      ]} />
      <CodeLine pairs={[
        ['"email"', 'text-code-key'], [':', 'text-text-muted'], ['"{{$randomEmail}}"', 'text-code-string'],
      ]} />
      <CodeLine pairs={[
        ['"active"', 'text-code-key'], [':', 'text-text-muted'], ['{{$randomBoolean}}', 'text-code-boolean'],
      ]} />
      <CodeLine pairs={[
        ['"createdAt"', 'text-code-key'], [':', 'text-text-muted'], ['"{{$isoTimestamp}}"', 'text-code-string'],
      ]} />
    </div>
  );
}

function MatchRulesPreview() {
  const t = useTranslation();
  return (
    <div className="flex flex-col gap-1.5 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold tracking-wider text-text-tertiary uppercase">{t.onboarding.previewMatchConditions}</span>
        <span className="rounded-full bg-method-patch/10 px-2 py-0.5 text-[9px] font-bold text-method-patch">AND</span>
      </div>
      <span className="text-[8px] font-semibold tracking-wider text-text-muted uppercase">{t.onboarding.previewBodyRules}</span>
      {[
        { field: 'user.role', op: 'equals', value: 'admin' },
        { field: 'status', op: 'contains', value: 'active' },
      ].map((r, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="flex-1 rounded border border-border-secondary bg-bg-input px-1.5 py-0.5 font-mono text-[9px] text-text-primary">{r.field}</span>
          <span className="rounded border border-border-secondary bg-bg-input px-1.5 py-0.5 text-[9px] text-text-secondary">{r.op}</span>
          <span className="flex-1 rounded border border-border-secondary bg-bg-input px-1.5 py-0.5 font-mono text-[9px] text-text-primary">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function EnvironmentPreview() {
  const t = useTranslation();
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-server-running" />
          <span className="text-[10px] font-semibold text-text-primary">Production</span>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-server-running/10 px-2 py-0.5 text-[8px] font-semibold text-server-running">
          <Check size={8} /> {t.onboarding.previewActive}
        </span>
      </div>
      <div className="border-t border-border-secondary">
        <div className="flex bg-bg-surface text-[8px] font-semibold tracking-wider text-text-muted">
          <span className="flex-1 border-r border-border-secondary px-3 py-1">{t.onboarding.previewKey}</span>
          <span className="flex-1 px-3 py-1">{t.onboarding.previewValue}</span>
        </div>
        {[
          ['baseUrl', 'https://api.prod.io'],
          ['apiKey', 'sk-prod-xxxx'],
          ['dbHost', 'db.prod.internal'],
        ].map(([k, v], i) => (
          <div key={i} className="flex border-t border-border-primary">
            <span className="flex-1 border-r border-border-secondary px-3 py-1 font-mono text-[9px] text-text-primary">{k}</span>
            <span className="flex-1 px-3 py-1 font-mono text-[9px] text-text-secondary">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RequestHelpersPreview() {
  const t = useTranslation();
  return (
    <div className="flex flex-col gap-1 p-3">
      <span className="text-[8px] font-semibold tracking-wider text-text-muted uppercase">{t.onboarding.previewResponseBody}</span>
      <CodeLine pairs={[
        ['"echo"', 'text-code-key'], [':', 'text-text-muted'], ['"{{$body \'user.name\'}}"', 'text-code-string'],
      ]} />
      <CodeLine pairs={[
        ['"token"', 'text-code-key'], [':', 'text-text-muted'], ['"{{$headers \'authorization\'}}"', 'text-code-string'],
      ]} />
      <CodeLine pairs={[
        ['"search"', 'text-code-key'], [':', 'text-text-muted'], ['"{{$queryParams \'q\'}}"', 'text-code-string'],
      ]} />
      <CodeLine pairs={[
        ['"userId"', 'text-code-key'], [':', 'text-text-muted'], ['"{{$pathParams \'id\'}}"', 'text-code-string'],
      ]} />
    </div>
  );
}

function PathParamsPreview() {
  const t = useTranslation();
  return (
    <div className="flex flex-col gap-2 p-3">
      <span className="text-[8px] font-semibold tracking-wider text-text-muted uppercase">{t.onboarding.previewEndpointPath}</span>
      <div className="flex items-center rounded border border-border-secondary bg-bg-input px-2.5 py-1.5">
        <span className="font-mono text-[10px] text-text-secondary">/api/users/</span>
        <span className="rounded bg-accent-primary/10 px-1 font-mono text-[10px] font-semibold text-accent-primary">:id</span>
        <span className="font-mono text-[10px] text-text-secondary">/posts</span>
      </div>
      <div className="flex items-center rounded border border-border-secondary bg-bg-input px-2.5 py-1.5">
        <span className="font-mono text-[10px] text-text-secondary">/api/orders/</span>
        <span className="rounded bg-accent-primary/10 px-1 font-mono text-[10px] font-semibold text-accent-primary">{'{orderId}'}</span>
        <span className="font-mono text-[10px] text-text-secondary">/items</span>
      </div>
      <div className="flex items-center gap-1">
        <Info size={10} className="text-text-muted" />
        <span className="text-[9px] text-text-muted">{t.onboarding.previewBothSyntax}</span>
      </div>
    </div>
  );
}

function ImportExportPreview() {
  const t = useTranslation();
  return (
    <div className="flex flex-col gap-1.5 p-3">
      <span className="text-[8px] font-semibold tracking-wider text-text-muted uppercase">{t.onboarding.previewExportPreview}</span>
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[9px] text-text-muted">{'{'}</span>
        <CodeLine pairs={[[' "version"', 'text-code-key'], [':', 'text-text-muted'], ['"1.0"', 'text-code-string']]} />
        <CodeLine pairs={[[' "collections"', 'text-code-key'], [': [', 'text-text-muted']]} />
        <CodeLine pairs={[['   {', 'text-text-muted'], ['"name"', 'text-code-key'], [':', 'text-text-muted'], ['"Users API"', 'text-code-string'], [', ...}', 'text-text-muted']]} />
      </div>
      <div className="flex justify-end gap-1.5 pt-0.5">
        <span className="flex items-center gap-1 rounded border border-border-secondary bg-bg-input px-2.5 py-1 text-[9px] font-medium text-text-secondary">
          {t.onboarding.previewImport}
        </span>
        <span className="flex items-center gap-1 rounded bg-accent-primary px-2.5 py-1 text-[9px] font-medium text-white">
          {t.onboarding.previewExport}
        </span>
      </div>
    </div>
  );
}
