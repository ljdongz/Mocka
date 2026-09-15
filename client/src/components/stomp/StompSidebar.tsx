import { useTranslation } from '../../i18n';

/** Placeholder — the connection tree lands in the next task. */
export function StompSidebar() {
  const t = useTranslation();
  return (
    <div className="flex h-full flex-col bg-bg-sidebar p-3">
      <span className="text-sm font-bold text-text-primary tracking-tight">Mocka</span>
      <span className="text-xs text-text-muted mt-2">{t.stomp.connections}</span>
    </div>
  );
}
