import { Plus, FolderPlus } from 'lucide-react';
import { useSettingsStore } from '../../stores/settings.store';
import { useUIStore } from '../../stores/ui.store';
import { useWsEndpointStore } from '../../stores/ws-endpoint.store';
import { useTranslation } from '../../i18n';
import { CollectionTree } from './CollectionTree';
import { WsEndpointItem } from './WsEndpointItem';

export function Sidebar() {
  const t = useTranslation();
  const serverStatus = useSettingsStore(s => s.serverStatus);
  const showHistory = useUIStore(s => s.showHistory);
  const setShowNewEndpoint = useUIStore(s => s.setShowNewEndpoint);
  const setShowNewCollection = useUIStore(s => s.setShowNewCollection);
  const setShowNewWsEndpoint = useUIStore(s => s.setShowNewWsEndpoint);
  const wsEndpoints = useWsEndpointStore(s => s.endpoints);

  const panelTitle = showHistory ? t.sidebar.history : t.sidebar.collections;

  return (
    <div className="flex h-full flex-col bg-bg-sidebar">
      {/* Header */}
      <div className="flex flex-col px-3 pt-3 pb-2">
        <span className="text-sm font-bold text-text-primary tracking-tight">Mocka</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`h-1.5 w-1.5 rounded-full ${serverStatus.running ? 'bg-server-running' : 'bg-server-stopped'}`} />
          <span className="text-[11px] text-text-tertiary font-mono">
            {serverStatus.localIp}:{serverStatus.port}
          </span>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{panelTitle}</span>
          {!showHistory && (
            <button
              onClick={() => setShowNewCollection(true)}
              className="flex items-center rounded p-0.5 text-text-muted hover:bg-bg-hover hover:text-text-secondary"
              title={t.sidebar.newCollection}
            >
              <FolderPlus size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* Collection tree */}
      <div className="flex-1 overflow-y-auto px-2">
        <CollectionTree />

        {/* WebSocket endpoints section */}
        {!showHistory && wsEndpoints.length > 0 && (
          <div className="mt-2">
            <div className="px-2 py-1 text-xs text-text-muted uppercase tracking-wider">{t.sidebar.wsEndpoints}</div>
            {wsEndpoints.map(ep => (
              <WsEndpointItem key={ep.id} endpoint={ep} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border-primary p-2 flex flex-col gap-1">
        <button
          onClick={() => setShowNewEndpoint(true)}
          className="flex w-full items-center gap-1.5 rounded px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover"
        >
          <Plus size={14} strokeWidth={2} />
          {t.sidebar.newEndpoint}
        </button>
        <button
          onClick={() => setShowNewWsEndpoint(true)}
          className="flex w-full items-center gap-1.5 rounded px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover"
        >
          <Plus size={14} strokeWidth={2} />
          {t.sidebar.newWsEndpoint}
        </button>
      </div>
    </div>
  );
}
