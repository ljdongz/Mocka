import { useStompStore } from '../../stores/stomp.store';
import { useTranslation } from '../../i18n';
import { StompConnectionEditor } from './StompConnectionEditor';
import { StompDestinationEditor } from './StompDestinationEditor';

export function StompEditor() {
  const t = useTranslation();
  const connections = useStompStore(s => s.connections);
  const selectedConnectionId = useStompStore(s => s.selectedConnectionId);
  const selectedDestinationId = useStompStore(s => s.selectedDestinationId);

  const connection = connections.find(c => c.id === selectedConnectionId);
  const destination = selectedDestinationId
    ? connections.flatMap(c => c.destinations).find(d => d.id === selectedDestinationId)
    : undefined;
  const destinationConnection = destination ? connections.find(c => c.id === destination.connectionId) : undefined;

  if (destination && destinationConnection) {
    return <StompDestinationEditor key={destination.id} destination={destination} connection={destinationConnection} />;
  }
  if (connection) {
    return <StompConnectionEditor key={connection.id} connection={connection} />;
  }
  return (
    <div className="flex flex-1 items-center justify-center text-text-muted text-sm">
      {t.stomp.selectConnection}
    </div>
  );
}
