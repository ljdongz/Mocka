export interface HttpRequestRecord {
  protocol: 'http';
  id: string;
  method: string;
  path: string;
  statusCode: number;
  bodyOrParams: string;
  requestHeaders: string;
  responseBody: string;
  timestamp: string;
}

export interface WsRequestRecord {
  protocol: 'ws';
  id: string;
  /** Always 'WS' for WebSocket connections */
  method: string;
  path: string;
  /** 0 for WebSocket (no HTTP status code) */
  statusCode: number;
  /** The incoming message payload */
  bodyOrParams: string;
  requestHeaders: string;
  /** The outgoing frame body (empty string if no match) */
  responseBody: string;
  timestamp: string;
}

export type RequestRecord = HttpRequestRecord | WsRequestRecord;
