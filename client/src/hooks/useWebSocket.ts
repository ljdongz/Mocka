import { useEffect } from 'react';
import { onMessage } from '../api/websocket';
import { useEndpointStore } from '../stores/endpoint.store';
import { useCollectionStore } from '../stores/collection.store';
import { useHistoryStore } from '../stores/history.store';
import { useSettingsStore } from '../stores/settings.store';
import { useStompStore } from '../stores/stomp.store';
import { useToastStore } from '../components/shared/Toast';

export function useWebSocket() {
  const replaceEndpoint = useEndpointStore(s => s.replaceEndpoint);
  const removeEndpoint = useEndpointStore(s => s.removeEndpointFromList);
  const replaceCollection = useCollectionStore(s => s.replaceCollection);
  const removeCollection = useCollectionStore(s => s.removeCollection);
  const fetchCollections = useCollectionStore(s => s.fetch);
  const addRecord = useHistoryStore(s => s.addRecord);
  const setServerStatus = useSettingsStore(s => s.setServerStatus);

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
          // STOMP frames arrive continuously (heartbeat-driven pushes, repeats); no toast per frame.
          if (data.protocol !== 'stomp' && useSettingsStore.getState().settings.historyToast && data.method && data.statusCode != null) {
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
          // a restarted mock server starts with no sessions
          useStompStore.getState().fetchSessions();
          break;
        case 'stomp:changed':
          useStompStore.getState().fetch();
          break;
        case 'stomp:session:opened':
        case 'stomp:session:updated':
          useStompStore.getState().upsertSession(data);
          useStompStore.getState().fetchStats(data.connectionId);
          break;
        case 'stomp:session:closed':
          useStompStore.getState().removeSession(data.id);
          useStompStore.getState().fetchStats(data.connectionId);
          break;
      }
    });
    return unsub;
  }, [replaceEndpoint, removeEndpoint, replaceCollection, removeCollection, fetchCollections, addRecord, setServerStatus]);
}
