import type { WebSocket } from 'ws';
import { onBroadcast } from '../services/domain-events.js';

const clients = new Set<WebSocket>();

export function addClient(ws: WebSocket): void {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
}

function broadcast(event: string, data?: any): void {
  const message = JSON.stringify({ event, data });
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

// Subscribe to domain events and broadcast via WebSocket
onBroadcast(broadcast);
