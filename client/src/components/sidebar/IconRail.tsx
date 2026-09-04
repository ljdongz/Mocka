import { Folder, History, Layers, ArrowUpDown, Settings, BookOpen, Database, LucideIcon } from 'lucide-react';
import { useUIStore } from '../../stores/ui.store';
import { useTranslation } from '../../i18n';

function RailButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
        active
          ? 'bg-bg-hover text-text-primary'
          : 'text-text-tertiary hover:bg-bg-hover hover:text-text-secondary'
      }`}
      title={label}
    >
      <Icon size={20} strokeWidth={1.8} />
    </button>
  );
}

export function IconRail() {
  const t = useTranslation();
  const showHistory = useUIStore(s => s.showHistory);
  const setShowHistory = useUIStore(s => s.setShowHistory);
  const showOnboarding = useUIStore(s => s.showOnboarding);
  const setShowOnboarding = useUIStore(s => s.setShowOnboarding);
  const showEnvironments = useUIStore(s => s.showEnvironments);
  const setShowEnvironments = useUIStore(s => s.setShowEnvironments);
  const showDatasets = useUIStore(s => s.showDatasets);
  const setShowDatasets = useUIStore(s => s.setShowDatasets);
  const setShowImportExport = useUIStore(s => s.setShowImportExport);
  const setShowSettings = useUIStore(s => s.setShowSettings);

  return (
    <div className="flex h-full w-12 flex-col items-center justify-between border-r border-border-primary bg-bg-sidebar py-3">
      {/* Top section - the project's own content */}
      <div className="flex flex-col items-center gap-1">
        <RailButton
          icon={Folder}
          label={t.sidebar.collections}
          active={!showHistory}
          onClick={() => setShowHistory(false)}
        />
        <RailButton
          icon={History}
          label={t.sidebar.history}
          active={showHistory}
          onClick={() => setShowHistory(!showHistory)}
        />
        <RailButton
          icon={Layers}
          label={t.sidebar.environments}
          active={showEnvironments}
          onClick={() => setShowEnvironments(true)}
        />
        <RailButton
          icon={Database}
          label={t.sidebar.datasets}
          active={showDatasets}
          onClick={() => setShowDatasets(true)}
        />
      </div>

      {/* Bottom section - about the app, not the project */}
      <div className="flex flex-col items-center gap-1">
        <RailButton
          icon={BookOpen}
          label={t.sidebar.guide}
          active={showOnboarding}
          onClick={() => setShowOnboarding(!showOnboarding)}
        />
        <RailButton
          icon={ArrowUpDown}
          label={t.sidebar.importExport}
          onClick={() => setShowImportExport(true)}
        />
        <RailButton
          icon={Settings}
          label={t.sidebar.settings}
          onClick={() => setShowSettings(true)}
        />
      </div>
    </div>
  );
}
