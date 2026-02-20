import type { WebSocket } from 'ws';

const clients = new Set<WebSocket>();

export function addClient(ws: WebSocket): void {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
}

export function broadcast(event: string, data?: any): void {
  const message = JSON.stringify({ event, data });
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}
