import { useEffect } from 'react';
import { IconRail } from './components/sidebar/IconRail';
import { Sidebar } from './components/sidebar/Sidebar';
import { EndpointEditor } from './components/editor/EndpointEditor';
import { WsEndpointEditor } from './components/editor/WsEndpointEditor';
import { HistoryView } from './components/history/HistoryView';
import { NewEndpointModal } from './components/modals/NewEndpointModal';
import { NewCollectionModal } from './components/modals/NewCollectionModal';
import { NewWsEndpointModal } from './components/modals/NewWsEndpointModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { ImportExportModal } from './components/modals/ImportExportModal';
import { EnvironmentModal } from './components/modals/EnvironmentModal';
import { OnboardingPage } from './components/onboarding/OnboardingPage';
import { ResizableDivider } from './components/layout/ResizableDivider';
import { useEndpointStore } from './stores/endpoint.store';
import { useCollectionStore } from './stores/collection.store';
import { useSettingsStore } from './stores/settings.store';
import { useUIStore } from './stores/ui.store';
import { useWsEndpointStore } from './stores/ws-endpoint.store';
import { useWebSocket } from './hooks/useWebSocket';
import { initWebSocket } from './api/websocket';
import { ToastContainer } from './components/shared/Toast';

export default function App() {
  const fetchEndpoints = useEndpointStore(s => s.fetch);
  const fetchCollections = useCollectionStore(s => s.fetch);
  const fetchSettings = useSettingsStore(s => s.fetch);
  const fetchServerStatus = useSettingsStore(s => s.fetchServerStatus);
  const fetchWsEndpoints = useWsEndpointStore(s => s.fetch);
  const showHistory = useUIStore(s => s.showHistory);
  const sidebarWidth = useUIStore(s => s.sidebarWidth);
  const wsSelectedId = useWsEndpointStore(s => s.selectedId);

  useWebSocket();

  useEffect(() => {
    initWebSocket();
    fetchEndpoints();
    fetchCollections();
    fetchSettings();
    fetchServerStatus();
    fetchWsEndpoints();
  }, [fetchEndpoints, fetchCollections, fetchSettings, fetchServerStatus, fetchWsEndpoints]);

  const mainContent = () => {
    if (showHistory) return <HistoryView />;
    if (wsSelectedId) return <WsEndpointEditor />;
    return <EndpointEditor />;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg-page">
      {/* Icon Rail + Sidebar */}
      <IconRail />
      <div style={{ width: sidebarWidth, minWidth: sidebarWidth }} className="flex-shrink-0 border-r border-border-primary">
        <Sidebar />
      </div>

      <ResizableDivider />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {mainContent()}
      </div>

      {/* Modals */}
      <NewEndpointModal />
      <NewCollectionModal />
      <NewWsEndpointModal />
      <SettingsModal />
      <ImportExportModal />
      <EnvironmentModal />
      <OnboardingPage />

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}
