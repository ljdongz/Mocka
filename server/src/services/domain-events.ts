import { EventEmitter } from 'events';

const emitter = new EventEmitter();

/** Emit a domain event that will be broadcast to WebSocket clients */
export function emit(event: string, data?: any): void {
  emitter.emit('broadcast', event, data);
}

/** Subscribe to broadcast events (used by WebSocket plugin) */
export function onBroadcast(handler: (event: string, data?: any) => void): void {
  emitter.on('broadcast', handler);
}
