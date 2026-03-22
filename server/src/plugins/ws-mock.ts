import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { handleWsMessage, handleWsConnect, resolveWsTemplate } from '../services/ws-mock-handler.service.js';

/**
 * Fastify WebSocket handler for WS mock routes.
 * Exported separately so mock-server.ts can combine it with the HTTP handler
 * on a single GET /* route (Fastify does not allow two GET /* registrations).
 */
export function wsHandler(socket: WebSocket, req: { url: string }): void {
  const path = req.url.split('?')[0];
  const intervalTimers: ReturnType<typeof setTimeout>[] = [];

  // Clean up all interval timers when socket closes
  socket.on('close', () => {
    for (const timer of intervalTimers) clearTimeout(timer);
    intervalTimers.length = 0;
  });

  // Fire connect-trigger frames immediately on connection
  handleWsConnect(path).then(responses => {
    if (responses === null) {
      socket.close(4004, `No WS mock endpoint configured for ${path}`);
      return;
    }
    for (const r of responses) {
      if (r.body !== '' && socket.readyState === socket.OPEN) {
        socket.send(r.body);
      }

      // Set up periodic sending if interval is configured
      if (r.intervalMin != null && r.intervalMax != null && r.intervalMin > 0) {
        const scheduleNext = () => {
          const min = r.intervalMin!;
          const max = r.intervalMax!;
          const delaySec = Math.random() * (max - min) + min;
          const timer = setTimeout(() => {
            if (socket.readyState !== socket.OPEN) return;
            const resolved = resolveWsTemplate(path, r.messageTemplate);
            socket.send(resolved);
            scheduleNext();
          }, delaySec * 1000);
          intervalTimers.push(timer);
        };
        scheduleNext();
      }
    }
  });

  socket.on('message', async (raw: Buffer | string) => {
    const message = typeof raw === 'string' ? raw : raw.toString('utf8');
    const response = await handleWsMessage(path, message);

    if (response === null) {
      socket.close(4004, `No WS mock endpoint configured for ${path}`);
      return;
    }

    if (response.body !== '') {
      socket.send(response.body);
    }
  });
}
