import { useEffect } from 'react';
import { Sidebar } from './components/sidebar/Sidebar';
import { EndpointEditor } from './components/editor/EndpointEditor';
import { HistoryView } from './components/history/HistoryView';
import { NewEndpointModal } from './components/modals/NewEndpointModal';
import { NewCollectionModal } from './components/modals/NewCollectionModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { ResizableDivider } from './components/layout/ResizableDivider';
import { useEndpointStore } from './stores/endpoint.store';
import { useCollectionStore } from './stores/collection.store';
import { useSettingsStore } from './stores/settings.store';
import { useUIStore } from './stores/ui.store';
import { useWebSocket } from './hooks/useWebSocket';
import { initWebSocket } from './api/websocket';
import { ToastContainer } from './components/shared/Toast';

export default function App() {
  const fetchEndpoints = useEndpointStore(s => s.fetch);
  const fetchCollections = useCollectionStore(s => s.fetch);
  const fetchSettings = useSettingsStore(s => s.fetch);
  const fetchServerStatus = useSettingsStore(s => s.fetchServerStatus);
  const showHistory = useUIStore(s => s.showHistory);
  const sidebarWidth = useUIStore(s => s.sidebarWidth);

  useWebSocket();

  useEffect(() => {
    initWebSocket();
    fetchEndpoints();
    fetchCollections();
    fetchSettings();
    fetchServerStatus();
  }, [fetchEndpoints, fetchCollections, fetchSettings, fetchServerStatus]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg-page">
      {/* Sidebar */}
      <div style={{ width: sidebarWidth, minWidth: sidebarWidth }} className="flex-shrink-0">
        <Sidebar />
      </div>

      <ResizableDivider />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {showHistory ? <HistoryView /> : <EndpointEditor />}
      </div>

      {/* Modals */}
      <NewEndpointModal />
      <NewCollectionModal />
      <SettingsModal />

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}
