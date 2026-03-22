import { EventEmitter } from 'events';
import type { Endpoint } from '../models/endpoint.js';
import type { ResponseVariant } from '../models/response-variant.js';
import type { Collection } from '../models/collection.js';
import type { Environment } from '../models/environment.js';
import type { RequestRecord } from '../models/request-record.js';
import type { WsEndpoint, WsResponseFrame } from '../models/ws-endpoint.js';

const emitter = new EventEmitter();

export type DomainEvent =
  | { type: 'endpoint:created'; payload: Endpoint }
  | { type: 'endpoint:updated'; payload: Endpoint }
  | { type: 'endpoint:deleted'; payload: { id: string } }
  | { type: 'variant:updated'; payload: ResponseVariant }
  | { type: 'variant:deleted'; payload: { id: string } }
  | { type: 'collection:created'; payload: Collection }
  | { type: 'collection:updated'; payload: Collection }
  | { type: 'collection:deleted'; payload: { id: string } }
  | { type: 'collection:reordered'; payload: null }
  | { type: 'environment:created'; payload: Environment }
  | { type: 'environment:updated'; payload: Environment }
  | { type: 'environment:deleted'; payload: { id: string } }
  | { type: 'environment:active-changed'; payload: { activeId: string | null } }
  | { type: 'history:new'; payload: RequestRecord }
  | { type: 'history:cleared'; payload: null }
  | { type: 'import:completed'; payload: any }
  | { type: 'server:status'; payload: { running: boolean; port: number } }
  | { type: 'ws-endpoint:created'; payload: WsEndpoint }
  | { type: 'ws-endpoint:updated'; payload: WsEndpoint }
  | { type: 'ws-endpoint:deleted'; payload: { id: string } }
  | { type: 'ws-frame:updated'; payload: WsResponseFrame }
  | { type: 'ws-frame:deleted'; payload: { id: string } };

/** Emit a domain event that will be broadcast to WebSocket clients */
export function emit<T extends DomainEvent['type']>(
  type: T,
  payload: Extract<DomainEvent, { type: T }>['payload'],
): void {
  emitter.emit('broadcast', type, payload);
}

/** Subscribe to broadcast events (used by WebSocket plugin) */
export function onBroadcast(handler: (event: string, data?: any) => void): void {
  emitter.on('broadcast', handler);
}
