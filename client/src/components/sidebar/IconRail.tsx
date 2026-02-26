import { Folder, History, Layers, ArrowUpDown, Settings, BookOpen } from 'lucide-react';
import { useUIStore } from '../../stores/ui.store';
import { useTranslation } from '../../i18n';

export function IconRail() {
  const t = useTranslation();
  const showHistory = useUIStore(s => s.showHistory);
  const setShowHistory = useUIStore(s => s.setShowHistory);
  const showOnboarding = useUIStore(s => s.showOnboarding);
  const setShowOnboarding = useUIStore(s => s.setShowOnboarding);
  const setShowEnvironments = useUIStore(s => s.setShowEnvironments);
  const setShowImportExport = useUIStore(s => s.setShowImportExport);
  const setShowSettings = useUIStore(s => s.setShowSettings);

  const activePanel = showHistory ? 'history' : 'collections';

  const railItems = [
    { id: 'collections' as const, icon: Folder, label: t.sidebar.collections },
    { id: 'history' as const, icon: History, label: t.sidebar.history },
  ];

  const handleRailClick = (id: string) => {
    if (id === 'history') {
      setShowHistory(!showHistory);
    } else if (id === 'collections') {
      if (showHistory) setShowHistory(false);
    }
  };

  return (
    <div className="flex h-full w-12 flex-col items-center justify-between border-r border-border-primary bg-bg-sidebar py-3">
      {/* Top section - nav icons */}
      <div className="flex flex-col items-center gap-1">
        {/* Panel toggle icons */}
        {railItems.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => handleRailClick(id)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              activePanel === id
                ? 'bg-bg-hover text-text-primary'
                : 'text-text-tertiary hover:bg-bg-hover hover:text-text-secondary'
            }`}
            title={label}
          >
            <Icon size={20} strokeWidth={1.8} />
          </button>
        ))}
      </div>

      {/* Bottom section - modal actions + settings */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => setShowOnboarding(!showOnboarding)}
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
            showOnboarding
              ? 'bg-bg-hover text-text-primary'
              : 'text-text-tertiary hover:bg-bg-hover hover:text-text-secondary'
          }`}
          title={t.sidebar.guide}
        >
          <BookOpen size={20} strokeWidth={1.8} />
        </button>
        <button
          onClick={() => setShowEnvironments(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
          title={t.sidebar.environments}
        >
          <Layers size={20} strokeWidth={1.8} />
        </button>
        <button
          onClick={() => setShowImportExport(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
          title={t.sidebar.importExport}
        >
          <ArrowUpDown size={20} strokeWidth={1.8} />
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
          title={t.sidebar.settings}
        >
          <Settings size={20} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
