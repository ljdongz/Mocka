import { useEffect } from 'react';
import { onMessage } from '../api/websocket';
import { useEndpointStore } from '../stores/endpoint.store';
import { useCollectionStore } from '../stores/collection.store';
import { useHistoryStore } from '../stores/history.store';
import { useSettingsStore } from '../stores/settings.store';
import { useWsEndpointStore } from '../stores/ws-endpoint.store';
import { useToastStore } from '../components/shared/Toast';

export function useWebSocket() {
  const replaceEndpoint = useEndpointStore(s => s.replaceEndpoint);
  const removeEndpoint = useEndpointStore(s => s.removeEndpointFromList);
  const replaceCollection = useCollectionStore(s => s.replaceCollection);
  const removeCollection = useCollectionStore(s => s.removeCollection);
  const fetchCollections = useCollectionStore(s => s.fetch);
  const addRecord = useHistoryStore(s => s.addRecord);
  const setServerStatus = useSettingsStore(s => s.setServerStatus);
  const replaceWsEndpoint = useWsEndpointStore(s => s.replaceEndpoint);
  const removeWsEndpoint = useWsEndpointStore(s => s.removeEndpointFromList);

  useEffect(() => {
    const unsub = onMessage((event, data) => {
      switch (event) {
        case 'endpoint:created':
        case 'endpoint:updated':
          replaceEndpoint(data);
          break;
        case 'endpoint:deleted':
          removeEndpoint(data.id);
          break;
        case 'collection:created':
        case 'collection:updated':
          replaceCollection(data);
          break;
        case 'collection:deleted':
          removeCollection(data.id);
          break;
        case 'collection:reordered':
          fetchCollections();
          break;
        case 'history:new':
          addRecord(data);
          if (useSettingsStore.getState().settings.historyToast && data.method && data.statusCode != null) {
            useToastStore.getState().addToast({
              method: data.method,
              path: data.path,
              statusCode: data.statusCode,
            });
          }
          break;
        case 'history:cleared':
          useHistoryStore.getState().fetch();
          break;
        case 'server:status':
          setServerStatus(data);
          break;
        case 'ws-endpoint:created':
        case 'ws-endpoint:updated':
        case 'ws-frame:updated':
          if (data.wsEndpointId) {
            // frame update — refresh parent endpoint
            useWsEndpointStore.getState().fetch();
          } else {
            replaceWsEndpoint(data);
          }
          break;
        case 'ws-endpoint:deleted':
          removeWsEndpoint(data.id);
          break;
        case 'ws-frame:deleted':
          useWsEndpointStore.getState().fetch();
          break;
      }
    });
    return unsub;
  }, [replaceEndpoint, removeEndpoint, replaceCollection, removeCollection, fetchCollections, addRecord, setServerStatus, replaceWsEndpoint, removeWsEndpoint]);
}
