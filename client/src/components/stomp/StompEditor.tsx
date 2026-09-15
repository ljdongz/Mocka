import { useTranslation } from '../../i18n';

/** Placeholder — connection / destination editors land in the next tasks. */
export function StompEditor() {
  const t = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center text-text-muted text-sm">
      {t.stomp.selectConnection}
    </div>
  );
}
