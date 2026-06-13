type MessageHandler = (event: string, data: any) => void;

let ws: WebSocket | null = null;
let handlers: MessageHandler[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => {
    reconnectAttempts = 0;
  };

  ws.onmessage = (event) => {
    try {
      const { event: evt, data } = JSON.parse(event.data);
      for (const handler of handlers) {
        handler(evt, data);
      }
    } catch { /* ignore */ }
  };

  ws.onclose = () => {
    // Only one pending reconnect at a time; capped exponential backoff (1s, 2s, 4s … 30s).
    if (reconnectTimer) return;
    const delay = Math.min(30000, 1000 * 2 ** reconnectAttempts);
    reconnectAttempts++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function initWebSocket() {
  if (ws) {
    ws.onclose = null;
    ws.close();
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  connect();
}

export function onMessage(handler: MessageHandler): () => void {
  handlers.push(handler);
  return () => {
    handlers = handlers.filter(h => h !== handler);
  };
}
