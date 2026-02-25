import { Plus } from 'lucide-react';
import { useEndpointStore } from '../../stores/endpoint.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useUIStore } from '../../stores/ui.store';
import { CollectionTree } from './CollectionTree';

export function Sidebar() {
  const serverStatus = useSettingsStore(s => s.serverStatus);
  const setShowHistory = useUIStore(s => s.setShowHistory);
  const setShowSettings = useUIStore(s => s.setShowSettings);
  const setShowNewEndpoint = useUIStore(s => s.setShowNewEndpoint);
  const showHistory = useUIStore(s => s.showHistory);

  const setShowNewCollection = useUIStore(s => s.setShowNewCollection);
  const setShowImportExport = useUIStore(s => s.setShowImportExport);

  return (
    <div className="flex h-full flex-col bg-bg-sidebar border-r border-border-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-text-primary">Mocka</span>
            <span className={`h-2.5 w-2.5 rounded-full ${serverStatus.running ? 'bg-server-running' : 'bg-server-stopped'}`} />
          </div>
          <div className="text-xs text-text-muted font-mono">
            {serverStatus.localIp}:{serverStatus.port}
          </div>
        </div>
      </div>

      {/* Collections label */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
          Collections
        </span>
        <button
          onClick={() => setShowNewCollection(true)}
          className="text-text-muted hover:text-text-secondary leading-none px-1 rounded hover:bg-bg-hover flex items-center"
          title="New Collection"
        >
          <Plus size={16} strokeWidth={2.5} />
        </button>
      </div>

      {/* Collection tree */}
      <div className="flex-1 overflow-y-auto px-2">
        <CollectionTree />
      </div>

      {/* Footer */}
      <div className="border-t border-border-primary p-2 flex flex-col gap-1">
        <button
          onClick={() => setShowNewEndpoint(true)}
          className="w-full rounded px-3 py-2 text-left text-sm text-text-secondary hover:bg-bg-hover"
        >
          + New Endpoint
        </button>
        <div className="flex gap-1">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex-1 rounded px-3 py-2 text-sm ${showHistory ? 'bg-bg-hover text-text-primary' : 'text-text-tertiary hover:bg-bg-hover hover:text-text-secondary'}`}
          >
            History
          </button>
          <button
            onClick={() => setShowImportExport(true)}
            className="flex-1 rounded px-3 py-2 text-sm text-text-tertiary hover:bg-bg-hover hover:text-text-secondary"
          >
            Import/Export
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="flex-1 rounded px-3 py-2 text-sm text-text-tertiary hover:bg-bg-hover hover:text-text-secondary"
          >
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}
